import { spawn } from 'child_process'
import * as fs from 'fs'
import { REMOTE_PATH_PREFIX } from './ssh-manager'

export type EditorChoice = 'auto' | 'vscode' | 'cursor' | 'zed' | 'sublime' | 'webstorm' | 'vim' | 'neovim'

export interface OpenInEditorArgs {
  filePath: string
  line?: number
  editor: EditorChoice
}

export type OpenInEditorResult =
  | { ok: true }
  | { ok: false; error: string }

/** Spawn a fully detached child process so macOS doesn't return focus to
 *  Electron when the editor CLI exits. */
function spawnDetached(bin: string, args: string[]): Promise<OpenInEditorResult> {
  return new Promise(resolve => {
    try {
      const child = spawn(bin, args, {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      // Give it a moment to fail (e.g. ENOENT) before resolving success.
      child.on('error', (err) => resolve({ ok: false, error: err.message }))
      // If no error fires within a short window, assume success.
      setTimeout(() => resolve({ ok: true }), 200)
    } catch (err: unknown) {
      resolve({ ok: false, error: (err as Error).message })
    }
  })
}

/** Opens a file in the user's preferred editor, optionally at a specific line.
 *  Validates inputs before shelling out. Supports macOS and Windows. */
export function openInEditor(args: OpenInEditorArgs): Promise<OpenInEditorResult> {
  const { filePath, line, editor } = args ?? ({} as OpenInEditorArgs)

  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return Promise.resolve({ ok: false, error: 'Open in editor is currently only supported on macOS and Windows' })
  }
  if (typeof filePath !== 'string' || !filePath) {
    return Promise.resolve({ ok: false, error: 'Missing filePath' })
  }
  if (filePath.startsWith(REMOTE_PATH_PREFIX)) {
    return Promise.resolve({ ok: false, error: 'Cannot open remote files in a local editor' })
  }
  // Reject paths with control chars, quotes, or null bytes
  if (/[\x00-\x1f"]/.test(filePath)) {
    return Promise.resolve({ ok: false, error: 'filePath contains invalid characters' })
  }
  if (!fs.existsSync(filePath)) {
    return Promise.resolve({ ok: false, error: `File does not exist: ${filePath}` })
  }
  if (line !== undefined && (typeof line !== 'number' || line < 1 || !Number.isInteger(line))) {
    return Promise.resolve({ ok: false, error: 'Invalid line number' })
  }

  if (editor === 'auto') {
    return openWithDefault(filePath)
  }

  if (process.platform === 'darwin') {
    return openEditorMac(filePath, line, editor)
  }
  return openEditorWindows(filePath, line, editor)
}

function openWithDefault(filePath: string): Promise<OpenInEditorResult> {
  const cmd = process.platform === 'darwin' ? 'open' : 'cmd.exe'
  const cmdArgs = process.platform === 'darwin' ? [filePath] : ['/c', 'start', '', filePath]
  return spawnDetached(cmd, cmdArgs)
}

interface EditorDef {
  bin: string
  lineArg: (file: string, line: number) => string[]
  noLineArg: (file: string) => string[]
}

const EDITORS: Record<Exclude<EditorChoice, 'auto'>, EditorDef> = {
  vscode:  { bin: 'code',      lineArg: (f, l) => ['-g', `${f}:${l}`],           noLineArg: (f) => [f] },
  cursor:  { bin: 'cursor',    lineArg: (f, l) => ['-g', `${f}:${l}`],           noLineArg: (f) => [f] },
  zed:     { bin: 'zed',       lineArg: (f, l) => [`${f}:${l}`],                 noLineArg: (f) => [f] },
  sublime: { bin: 'subl',      lineArg: (f, l) => [`${f}:${l}`],                 noLineArg: (f) => [f] },
  webstorm:{ bin: 'webstorm',  lineArg: (f, l) => ['--line', String(l), f],      noLineArg: (f) => [f] },
  vim:     { bin: 'vim',       lineArg: (f, l) => [`+${l}`, f],                  noLineArg: (f) => [f] },
  neovim:  { bin: 'nvim',      lineArg: (f, l) => [`+${l}`, f],                  noLineArg: (f) => [f] },
}

function openEditorMac(filePath: string, line: number | undefined, editor: Exclude<EditorChoice, 'auto'>): Promise<OpenInEditorResult> {
  const def = EDITORS[editor]
  if (!def) return Promise.resolve({ ok: false, error: `Unknown editor: ${editor}` })

  // vim/neovim need a terminal
  if (editor === 'vim' || editor === 'neovim') {
    return openInTerminalMac(def.bin, line ? def.lineArg(filePath, line) : def.noLineArg(filePath))
  }

  const args = line ? def.lineArg(filePath, line) : def.noLineArg(filePath)
  return spawnDetached(def.bin, args)
}

function openInTerminalMac(bin: string, args: string[]): Promise<OpenInEditorResult> {
  // Use osascript to open a terminal window, same pattern as session-launcher
  const cmdStr = [bin, ...args].map(a => `quoted form of "${a.replace(/"/g, '\\"')}"`).join(' & " " & ')
  const script = [
    'on run argv',
    `  set cmd to ${cmdStr}`,
    '  tell application "Terminal"',
    '    activate',
    '    do script cmd',
    '  end tell',
    'end run',
  ].join('\n')

  return spawnDetached('osascript', ['-e', script])
}

function openEditorWindows(filePath: string, line: number | undefined, editor: Exclude<EditorChoice, 'auto'>): Promise<OpenInEditorResult> {
  const def = EDITORS[editor]
  if (!def) return Promise.resolve({ ok: false, error: `Unknown editor: ${editor}` })

  // vim/neovim on Windows — open in a new cmd window
  if (editor === 'vim' || editor === 'neovim') {
    const editorArgs = line ? def.lineArg(filePath, line) : def.noLineArg(filePath)
    return spawnDetached('cmd.exe', ['/c', 'start', '', def.bin, ...editorArgs])
  }

  const args = line ? def.lineArg(filePath, line) : def.noLineArg(filePath)
  return spawnDetached(def.bin, args)
}
