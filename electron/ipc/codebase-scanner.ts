import * as fs from 'fs'
import { promises as fsp } from 'fs'
import * as path from 'path'
import ignore, { type Ignore } from 'ignore'
import { extractSymbols } from './tree-sitter-pool'
import type { SymbolInfo } from './tree-sitter-pool'

export interface FsNode {
  id: string        // relative path (files) or "relPath::SymbolName" (symbols)
  type: 'directory' | 'file' | 'class' | 'function' | 'method' | 'type' | 'enum' | 'interface' | 'struct'
  name: string
  path: string      // relative to project root (file path)
  parent?: string
  children: string[]
  language?: string
  startLine?: number
  endLine?: number
}

const EXCLUDE = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '__pycache__',
  '.next', '.nuxt', 'coverage', '.cache', '.venv', 'venv',
])

// Build an ignore instance for user-supplied patterns so path-aware
// patterns like "src/components" are matched correctly via the ignore library.
function buildExtraIg(extraExclude?: string[]): Ignore | null {
  if (!extraExclude?.length) return null
  return ignore().add(extraExclude)
}

// Loads a .gitignore file into an Ignore instance scoped to `dir`.
// Returns null if no .gitignore exists there.
async function loadGitignoreAt(dir: string): Promise<Ignore | null> {
  const gitignorePath = path.join(dir, '.gitignore')
  try {
    const ig = ignore()
    ig.add(await fsp.readFile(gitignorePath, 'utf8'))
    return ig
  } catch {
    return null
  }
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust',
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  go: 'go', rb: 'ruby', java: 'java',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', toml: 'toml', sh: 'shell',
  css: 'css', scss: 'css', html: 'html',
}

// Languages we can parse with tree-sitter for symbol extraction
const PARSEABLE = new Set(['typescript', 'javascript', 'python', 'rust', 'c', 'cpp'])

function getLanguage(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? LANG_MAP[ext] : undefined
}

export async function scanCodebase(projectPath: string, extraExclude?: string[]): Promise<FsNode[]> {
  try {
    await fsp.access(projectPath)
  } catch {
    return []
  }

  const extraIg = buildExtraIg(extraExclude)
  const nodes: FsNode[] = []

  // Add root node
  const rootName = path.basename(projectPath)
  const rootNode: FsNode = {
    id: '',
    type: 'directory',
    name: rootName,
    path: '',
    children: [],
  }
  nodes.push(rootNode)

  // Collect all file paths first (async walk), then extract symbols async
  const filePaths: Array<{ relPath: string; absPath: string; language: string }> = []

  // Stack of {baseRel, ig} pairs — each .gitignore is checked relative to its own directory
  const igStack: Array<{ baseRel: string; ig: Ignore }> = []
  const rootIg = await loadGitignoreAt(projectPath)
  if (rootIg) igStack.push({ baseRel: '', ig: rootIg })

  function isIgnored(relPath: string): boolean {
    if (extraIg?.ignores(relPath)) return true
    for (const { baseRel, ig } of igStack) {
      const rel = baseRel ? relPath.slice(baseRel.length + 1) : relPath
      if (ig.ignores(rel)) return true
    }
    return false
  }

  async function walkAsync(absPath: string, relPath: string, parentId: string | undefined) {
    // Load .gitignore for this directory (skip root, already loaded above)
    let pushedIg = false
    if (relPath !== '') {
      const dirIg = await loadGitignoreAt(absPath)
      if (dirIg) {
        igStack.push({ baseRel: relPath, ig: dirIg })
        pushedIg = true
      }
    }

    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(absPath, { withFileTypes: true })
    } catch {
      if (pushedIg) igStack.pop()
      return
    }

    const children: string[] = []
    const subdirs: Array<{ childAbs: string; childRel: string }> = []

    for (const entry of entries) {
      if (EXCLUDE.has(entry.name) || entry.name.startsWith('.')) continue

      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name
      const childAbs = path.join(absPath, entry.name)

      if (isIgnored(childRel)) continue

      if (entry.isDirectory()) {
        const dirNode: FsNode = {
          id: childRel,
          type: 'directory',
          name: entry.name,
          path: childRel,
          parent: parentId,
          children: [],
        }
        nodes.push(dirNode)
        children.push(childRel)
        subdirs.push({ childAbs, childRel })
      } else if (entry.isFile()) {
        const language = getLanguage(entry.name)
        const fileNode: FsNode = {
          id: childRel,
          type: 'file',
          name: entry.name,
          path: childRel,
          parent: parentId,
          children: [],
          language,
        }
        nodes.push(fileNode)
        children.push(childRel)

        if (language && PARSEABLE.has(language)) {
          filePaths.push({ relPath: childRel, absPath: childAbs, language })
        }
      }
    }

    // Attach children to parent
    if (parentId !== undefined) {
      const parentNode = nodes.find(n => n.id === parentId)
      if (parentNode) parentNode.children.push(...children)
    }

    // Recurse into subdirectories sequentially to keep igStack consistent
    for (const { childAbs, childRel } of subdirs) {
      await walkAsync(childAbs, childRel, childRel)
    }

    if (pushedIg) igStack.pop()
  }

  await walkAsync(projectPath, '', '')

  // Extract symbols in parallel (capped to avoid overwhelming the process)
  const CONCURRENCY = 8
  const nodeMap = new Map<string, FsNode>(nodes.map(n => [n.id, n]))

  async function processFile(info: { relPath: string; absPath: string; language: string }) {
    let symbols: SymbolInfo[]
    try {
      symbols = await extractSymbols(info.absPath, info.language)
    } catch {
      return
    }

    if (symbols.length === 0) return

    const fileNode = nodeMap.get(info.relPath)
    if (!fileNode) return

    // Build a local map of symbol id → FsNode so we can parent methods under classes
    const symNodeMap = new Map<string, FsNode>()

    for (const sym of symbols) {
      // Rewrite the absolute-path prefix to relative for the node id
      const nodeId = `${info.relPath}::${sym.id.slice(info.absPath.length + 2)}`
      const parentNodeId = sym.parent
        ? `${info.relPath}::${sym.parent.slice(info.absPath.length + 2)}`
        : undefined

      const symNode: FsNode = {
        id: nodeId,
        type: sym.kind,
        name: sym.name,
        path: info.relPath,
        parent: parentNodeId ?? info.relPath,
        children: [],
        language: info.language,
        startLine: sym.startLine,
        endLine: sym.endLine,
      }
      nodes.push(symNode)
      nodeMap.set(nodeId, symNode)
      symNodeMap.set(sym.id, symNode)

      // Attach to parent
      if (parentNodeId) {
        const parentSym = symNodeMap.get(sym.parent!)
        if (parentSym) {
          parentSym.children.push(nodeId)
        } else {
          fileNode.children.push(nodeId)
        }
      } else {
        fileNode.children.push(nodeId)
      }
    }
  }

  // Process in batches
  for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
    await Promise.all(filePaths.slice(i, i + CONCURRENCY).map(processFile))
  }

  return nodes
}
