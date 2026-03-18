import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import { parseSession } from './jsonl-parser'

// Track byte offsets per file to efficiently tail new lines
const fileOffsets = new Map<string, number>()

async function tailNewLines(filePath: string): Promise<string[]> {
  const offset = fileOffsets.get(filePath) ?? 0
  const stat = fs.statSync(filePath)
  if (stat.size <= offset) return []

  const buf = Buffer.alloc(stat.size - offset)
  const fd = fs.openSync(filePath, 'r')
  fs.readSync(fd, buf, 0, buf.length, offset)
  fs.closeSync(fd)

  fileOffsets.set(filePath, stat.size)
  return buf.toString('utf8').split('\n').filter(l => l.trim())
}

function sendToRenderer(channel: string, data: unknown) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send(channel, data)
  })
}

export function startSessionWatcher(): () => void {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(claudeDir)) return () => {}

  const watcher = chokidar.watch(`${claudeDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: true,   // don't fire for existing files on startup
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })

  watcher.on('add', async (filePath: string) => {
    // New session file — initialize offset and parse
    try {
      const stat = fs.statSync(filePath)
      fileOffsets.set(filePath, stat.size)
      const result = await parseSession(filePath)
      sendToRenderer('session:new', { filePath, ...result })
    } catch { /* ignore */ }
  })

  watcher.on('change', async (filePath: string) => {
    // Existing file grew — tail new lines and re-parse just the new content
    try {
      const newLines = await tailNewLines(filePath)
      if (newLines.length === 0) return
      // Re-parse the whole file for now (simple approach)
      const result = await parseSession(filePath)
      sendToRenderer('session:update', { filePath, ...result })
    } catch { /* ignore */ }
  })

  return () => watcher.close()
}
