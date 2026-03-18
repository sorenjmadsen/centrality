import { readFileSync } from 'fs'
import { join, dirname, extname, resolve, relative } from 'path'

export interface DepEdge {
  source: string
  target: string
}

const TS_JS_IMPORT_RE = /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g
const TS_JS_REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const PY_FROM_RE = /^from\s+(\.+[\w./]*)\s+import/gm
const PY_IMPORT_RE = /^import\s+([\w.]+)/gm

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

  PY_FROM_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PY_FROM_RE.exec(content)) !== null) {
    const mod = m[1]
    if (!mod) continue

    // Count leading dots for relative level
    const dots = mod.match(/^\.+/)?.[0].length ?? 0
    if (dots === 0) continue

    const modPart = mod.slice(dots).replace(/\./g, '/')
    let base = sourceDir
    for (let i = 1; i < dots; i++) base = dirname(base)
    const importPath = modPart ? join(base, modPart) : base
    const relPath = relative(projectPath, importPath)

    const candidates = [
      relPath + '.py',
      relPath + '/__init__.py',
    ]
    for (const candidate of candidates) {
      if (knownFiles.has(candidate) && candidate !== sourceFile) {
        edges.push({ source: sourceFile, target: candidate })
        break
      }
    }
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
