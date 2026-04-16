import * as fs from 'fs'
import * as path from 'path'
import Parser from 'web-tree-sitter'

export interface SymbolInfo {
  id: string        // e.g. "src/foo.py::MyClass"
  name: string
  kind: 'class' | 'function' | 'method' | 'type' | 'enum' | 'interface' | 'struct'
  startLine: number
  endLine: number
  parent?: string   // parent symbol id (for methods inside classes)
}

// --- Initialisation ---

let parserReady = false
let initPromise: Promise<void> | null = null

async function ensureInit(): Promise<void> {
  if (parserReady) return
  if (initPromise) return initPromise
  initPromise = (async () => {
    // Locate the tree-sitter.wasm inside web-tree-sitter's package
    const wasmBase = path.dirname(require.resolve('web-tree-sitter'))
    await Parser.init({ locateFile: () => path.join(wasmBase, 'tree-sitter.wasm') })
    parserReady = true
  })()
  return initPromise
}

// --- Language cache ---

const languageCache = new Map<string, Parser.Language>()

async function getLanguage(lang: string): Promise<Parser.Language | null> {
  if (languageCache.has(lang)) return languageCache.get(lang)!

  const wasmDir = path.join(
    path.dirname(require.resolve('tree-sitter-wasms/package.json')),
    'out'
  )

  const nameMap: Record<string, string> = {
    python: 'python',
    typescript: 'typescript',
    javascript: 'javascript',
    rust: 'rust',
    c: 'c',
    cpp: 'cpp',
  }

  const wasmName = nameMap[lang]
  if (!wasmName) return null

  const wasmPath = path.join(wasmDir, `tree-sitter-${wasmName}.wasm`)
  if (!fs.existsSync(wasmPath)) return null

  try {
    const language = await Parser.Language.load(wasmPath)
    languageCache.set(lang, language)
    return language
  } catch {
    return null
  }
}

// --- Symbol extraction ---

interface WalkCtx {
  fileId: string        // relative file path used as id prefix
  symbols: SymbolInfo[]
  currentClass?: string // id of the enclosing class (for method parents)
}

function nodeName(node: Parser.SyntaxNode): string {
  // Most nodes have a 'name' child — try it first
  for (const child of node.children) {
    if (child.type === 'identifier' || child.type === 'name' || child.type === 'type_identifier') {
      return child.text
    }
  }
  return node.text.split(/\s|\(/)[0].slice(0, 40)
}

function walk(node: Parser.SyntaxNode, ctx: WalkCtx, lang: string) {
  const type = node.type
  let pushed: SymbolInfo | null = null

  // Python
  if (lang === 'python') {
    if (type === 'class_definition') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'class', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'function_definition' || type === 'decorated_definition') {
      const target = type === 'decorated_definition'
        ? node.children.find(c => c.type === 'function_definition' || c.type === 'async_function_definition')
        : node
      if (target) {
        const name = nodeName(target)
        const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`
        const kind = ctx.currentClass ? 'method' : 'function'
        pushed = { id, name, kind, startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass }
        ctx.symbols.push(pushed)
      }
    }
  }

  // TypeScript / JavaScript
  if (lang === 'typescript' || lang === 'javascript') {
    if (type === 'class_declaration' || type === 'abstract_class_declaration') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'class', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'interface_declaration') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'interface', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'type_alias_declaration') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'type', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'enum_declaration') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'enum', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'function_declaration' || type === 'generator_function_declaration') {
      const name = nodeName(node)
      const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`
      pushed = { id, name, kind: ctx.currentClass ? 'method' : 'function', startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass }
      ctx.symbols.push(pushed)
    } else if (type === 'method_definition') {
      const name = nodeName(node)
      const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'method', startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass }
      ctx.symbols.push(pushed)
    } else if (type === 'lexical_declaration' || type === 'variable_declaration') {
      // export const foo = () => {} or const foo = function() {}
      for (const decl of node.children.filter(c => c.type === 'variable_declarator')) {
        const val = decl.children.find(c => c.type === 'arrow_function' || c.type === 'function')
        if (val) {
          const name = decl.children[0]?.text ?? ''
          if (name) {
            const id = `${ctx.fileId}::${name}`
            pushed = { id, name, kind: 'function', startLine: node.startPosition.row, endLine: node.endPosition.row }
            ctx.symbols.push(pushed)
          }
        }
      }
    }
  }

  // Rust
  if (lang === 'rust') {
    if (type === 'struct_item') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'struct', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'enum_item') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'enum', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'trait_item') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'interface', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'type_item') {
      const name = nodeName(node)
      const id = `${ctx.fileId}::${name}`
      pushed = { id, name, kind: 'type', startLine: node.startPosition.row, endLine: node.endPosition.row }
      ctx.symbols.push(pushed)
    } else if (type === 'function_item') {
      const name = nodeName(node)
      const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`
      pushed = { id, name, kind: ctx.currentClass ? 'method' : 'function', startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass }
      ctx.symbols.push(pushed)
    }
  }

  // C / C++
  if (lang === 'c' || lang === 'cpp') {
    if (type === 'struct_specifier' || type === 'class_specifier') {
      const name = nodeName(node)
      if (name && name !== '{') {
        const id = `${ctx.fileId}::${name}`
        const kind = type === 'class_specifier' ? 'class' : 'struct'
        pushed = { id, name, kind, startLine: node.startPosition.row, endLine: node.endPosition.row }
        ctx.symbols.push(pushed)
      }
    } else if (type === 'enum_specifier') {
      const name = nodeName(node)
      if (name && name !== '{') {
        const id = `${ctx.fileId}::${name}`
        pushed = { id, name, kind: 'enum', startLine: node.startPosition.row, endLine: node.endPosition.row }
        ctx.symbols.push(pushed)
      }
    } else if (type === 'function_definition') {
      // declarator → function_declarator → identifier
      const declarator = node.children.find(c => c.type.includes('declarator'))
      const funcDeclarator = declarator?.children.find(c => c.type === 'function_declarator')
      const nameNode = funcDeclarator?.children[0]
      const name = nameNode?.text ?? ''
      if (name) {
        const id = ctx.currentClass ? `${ctx.currentClass}.${name}` : `${ctx.fileId}::${name}`
        pushed = { id, name, kind: ctx.currentClass ? 'method' : 'function', startLine: node.startPosition.row, endLine: node.endPosition.row, parent: ctx.currentClass }
        ctx.symbols.push(pushed)
      }
    }
  }

  // Recurse into children — update currentClass if we just pushed a class/struct
  const prevClass = ctx.currentClass
  if (pushed && (pushed.kind === 'class' || pushed.kind === 'struct' || pushed.kind === 'interface')) {
    ctx.currentClass = pushed.id
  }

  for (const child of node.children) {
    walk(child, ctx, lang)
  }

  ctx.currentClass = prevClass
}

// --- mtime-based cache ---

interface CacheEntry { mtime: number; symbols: SymbolInfo[] }
const symbolCache = new Map<string, CacheEntry>()

export async function extractSymbols(absPath: string, language: string): Promise<SymbolInfo[]> {
  try {
    const stat = await fs.promises.stat(absPath)
    const cached = symbolCache.get(absPath)
    if (cached && cached.mtime === stat.mtimeMs) return cached.symbols

    await ensureInit()
    const lang = await getLanguage(language)
    if (!lang) return []

    const parser = new Parser()
    parser.setLanguage(lang)

    const src = await fs.promises.readFile(absPath, 'utf8')
    // Skip very large files (> 500 KB) to avoid blocking
    if (src.length > 500_000) return []

    const tree = parser.parse(src)
    const ctx: WalkCtx = { fileId: absPath, symbols: [] }
    walk(tree.rootNode, ctx, language)

    symbolCache.set(absPath, { mtime: stat.mtimeMs, symbols: ctx.symbols })
    return ctx.symbols
  } catch {
    return []
  }
}

/** Parse symbols from an already-loaded content string.
 *  Used when the file is on a remote filesystem (no local path available).
 *  `fileId` is used as the symbol id prefix — pass the relative path so ids
 *  are consistent with those produced by extractSymbols via scanCodebase. */
export async function extractSymbolsFromContent(content: string, fileId: string, language: string): Promise<SymbolInfo[]> {
  if (content.length > 500_000) return []
  try {
    await ensureInit()
    const lang = await getLanguage(language)
    if (!lang) return []
    const parser = new Parser()
    parser.setLanguage(lang)
    const tree = parser.parse(content)
    const ctx: WalkCtx = { fileId, symbols: [] }
    walk(tree.rootNode, ctx, language)
    return ctx.symbols
  } catch {
    return []
  }
}
