import * as fs from 'fs'
import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import { scanCodebase } from './codebase-scanner'
import { getProjectSettings } from './settings-manager'

interface WatcherEntry {
  watcher: ReturnType<typeof chokidar.watch>
  debounceTimer: ReturnType<typeof setTimeout> | null
}

// One entry per projectPath
const watchers = new Map<string, WatcherEntry>()

function sendToRenderer(channel: string, data: unknown) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send(channel, data)
  })
}

export function startCodebaseWatcher(projectPath: string, encodedName: string): void {
  // Idempotent: stop any existing watcher for this path first
  stopCodebaseWatcher(projectPath)
  if (!fs.existsSync(projectPath)) return

  const { excludePatterns } = getProjectSettings(encodedName)
  const extraExclude = excludePatterns.length ? excludePatterns : undefined

  const watcher = chokidar.watch(projectPath, {
    persistent: true,
    ignoreInitial: true,
    ignored: [
      /node_modules/,
      /\.git/,
      /dist/,
      /build/,
      /out/,
      /\.next/,
      /\.nuxt/,
      /coverage/,
      /\.cache/,
      /__pycache__/,
      /\.venv/,
    ],
  })

  const entry: WatcherEntry = { watcher, debounceTimer: null }
  watchers.set(projectPath, entry)

  function scheduleScan() {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    entry.debounceTimer = setTimeout(async () => {
      entry.debounceTimer = null
      try {
        const nodes = await scanCodebase(projectPath, extraExclude)
        sendToRenderer('codebase:update', { projectPath, nodes })
      } catch { /* ignore */ }
    }, 2000)
  }

  watcher.on('add', scheduleScan)
  watcher.on('change', scheduleScan)
  watcher.on('unlink', scheduleScan)
  watcher.on('addDir', scheduleScan)
  watcher.on('unlinkDir', scheduleScan)
}

export function stopCodebaseWatcher(projectPath: string): void {
  const entry = watchers.get(projectPath)
  if (!entry) return
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
  entry.watcher.close()
  watchers.delete(projectPath)
}
