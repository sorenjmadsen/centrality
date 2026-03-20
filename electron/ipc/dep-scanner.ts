import { readFileSync } from 'fs'
import { join, dirname, extname, resolve, relative } from 'path'

export interface DepEdge {
  source: string
  target: string
}

const TS_JS_IMPORT_RE = /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g
const TS_JS_REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const PY_EXTENSIONS = ['.py']

function resolveRelativeImport(
  sourceFile: string,
  importPath: string,
  projectPath: string,
  knownFiles: Set<string>
): string | null {
  const sourceDir = dirname(join(projectPath, sourceFile))
  const base = resolve(sourceDir, importPath)
  const basePath = relative(projectPath, base)

  // Try exact match first
  if (knownFiles.has(basePath)) return basePath

  // Try with extensions
  const allExts = [...TS_EXTENSIONS, ...PY_EXTENSIONS]
  for (const ext of allExts) {
    const candidate = basePath + ext
    if (knownFiles.has(candidate)) return candidate
  }

  // Try as directory index
  for (const ext of TS_EXTENSIONS) {
    const candidate = basePath + '/index' + ext
    if (knownFiles.has(candidate)) return candidate
  }

  return null
}

function parseTsJsImports(
  sourceFile: string,
  content: string,
  projectPath: string,
  knownFiles: Set<string>
): DepEdge[] {
  const edges: DepEdge[] = []
  const patterns = [TS_JS_IMPORT_RE, TS_JS_REQUIRE_RE]

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(content)) !== null) {
      const importPath = m[1]
      if (!importPath) continue

      if (importPath.startsWith('.')) {
        const target = resolveRelativeImport(sourceFile, importPath, projectPath, knownFiles)
        if (target && target !== sourceFile) {
          edges.push({ source: sourceFile, target })
        }
      }
      // Skip non-relative imports (node_modules)
    }
  }

  return edges
}

function parsePyImports(
  sourceFile: string,
  content: string,
  projectPath: string,
  knownFiles: Set<string>
): DepEdge[] {
  const edges: DepEdge[] = []
  const sourceDir = dirname(join(projectPath, sourceFile))

  function tryResolve(relPath: string): string | null {
    for (const candidate of [relPath + '.py', relPath + '/__init__.py']) {
      if (knownFiles.has(candidate) && candidate !== sourceFile) return candidate
    }
    return null
  }

  let m: RegExpExecArray | null

  // Relative imports: from .module import X, from ..pkg.sub import Y
  const relFromRe = /^from\s+(\.+[\w.]*)\s+import/gm
  while ((m = relFromRe.exec(content)) !== null) {
    const mod = m[1]
    const dots = mod.match(/^\.+/)![0].length
    const modPart = mod.slice(dots).replace(/\./g, '/')
    let base = sourceDir
    for (let i = 1; i < dots; i++) base = dirname(base)
    const absPath = modPart ? join(base, modPart) : base
    const relPath = relative(projectPath, absPath)
    const target = tryResolve(relPath)
    if (target) edges.push({ source: sourceFile, target })
  }

  // Absolute imports: from mypackage.module import X
  // Only creates an edge if the module resolves to a known file (filters out third-party)
  const absFromRe = /^from\s+([A-Za-z_][\w.]*)\s+import/gm
  while ((m = absFromRe.exec(content)) !== null) {
    const target = tryResolve(m[1].replace(/\./g, '/'))
    if (target) edges.push({ source: sourceFile, target })
  }

  // Absolute imports: import mypackage.module
  const absImportRe = /^import\s+([A-Za-z_][\w.]*)/gm
  while ((m = absImportRe.exec(content)) !== null) {
    const target = tryResolve(m[1].replace(/\./g, '/'))
    if (target) edges.push({ source: sourceFile, target })
  }

  return edges
}

export function scanDeps(projectPath: string, filePaths: string[]): DepEdge[] {
  const knownFiles = new Set(filePaths)
  const allEdges: DepEdge[] = []
  const seen = new Set<string>()

  for (const relPath of filePaths) {
    const ext = extname(relPath)
    const isTsJs = TS_EXTENSIONS.includes(ext)
    const isPy = PY_EXTENSIONS.includes(ext)

    if (!isTsJs && !isPy) continue

    let content: string
    try {
      content = readFileSync(join(projectPath, relPath), 'utf8')
    } catch {
      continue
    }

    const edges = isTsJs
      ? parseTsJsImports(relPath, content, projectPath, knownFiles)
      : parsePyImports(relPath, content, projectPath, knownFiles)

    for (const edge of edges) {
      const key = `${edge.source}→${edge.target}`
      if (!seen.has(key)) {
        seen.add(key)
        allEdges.push(edge)
      }
    }
  }

  return allEdges
}
