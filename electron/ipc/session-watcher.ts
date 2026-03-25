import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import { parseSession } from './jsonl-parser'

// Per-file debounce timers (100ms)
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function sendToRenderer(channel: string, data: unknown) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send(channel, data)
  })
}

// Resolve the canonical path, falling back to the input on failure.
// On macOS, this resolves /Users → /private/Users so paths are consistent.
function tryRealpath(p: string): string {
  try { return fs.realpathSync(p) } catch { return p }
}

export function startSessionWatcher(): () => void {
  const rawClaudeDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(rawClaudeDir)) return () => {}
  const claudeDir = tryRealpath(rawClaudeDir)

  // Watch the directory directly (not a glob) — more reliable with macOS FSEvents.
  // Glob patterns can suppress FSEvents notifications on macOS.
  const watcher = chokidar.watch(claudeDir, {
    persistent: true,
    ignoreInitial: true,
    depth: 2,  // project-dir (depth 0) → session-dir (depth 1) → *.jsonl (depth 2)
  })

  function scheduleReparse(filePath: string, channel: 'session:new' | 'session:update') {
    const existing = debounceTimers.get(filePath)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      debounceTimers.delete(filePath)
      try {
        const realPath = tryRealpath(filePath)
        const result = await parseSession(realPath)
        sendToRenderer(channel, { filePath: realPath, ...result })
      } catch { /* ignore */ }
    }, 100)
    debounceTimers.set(filePath, timer)
  }

  watcher.on('add', fp => { if (fp.endsWith('.jsonl')) scheduleReparse(fp, 'session:new') })
  watcher.on('change', fp => { if (fp.endsWith('.jsonl')) scheduleReparse(fp, 'session:update') })

  return () => {
    watcher.close()
    for (const t of debounceTimers.values()) clearTimeout(t)
    debounceTimers.clear()
  }
}
