import * as fs from 'fs'
import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'
import { scanCodebase } from './codebase-scanner'
import { getProjectSettings, getGlobalSettings } from './settings-manager'

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
  // Truly idempotent: if a watcher already exists for this path, do nothing.
  // Stopping and restarting chokidar every time a new tab opens the same project
  // is wasteful and can cause brief main-thread stalls during FSEvents re-init.
  if (watchers.has(projectPath)) return
  if (!fs.existsSync(projectPath)) return

  const { defaultExcludePatterns } = getGlobalSettings()
  const { excludePatterns } = getProjectSettings(encodedName)
  const allExcludePatterns = [...defaultExcludePatterns, ...excludePatterns]

  // Extensions we actually care about for source-change detection.
  // Anything not in this set (binaries, datasets, media, …) is ignored
  // so chokidar never opens a watcher fd for those files.
  const SOURCE_EXTS = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'rs', 'go', 'rb', 'java', 'kt', 'swift', 'cs', 'cpp', 'cc', 'c', 'h', 'hpp',
    'json', 'toml', 'yaml', 'yml', 'env', 'sh', 'bash', 'zsh',
    'css', 'scss', 'sass', 'less', 'html', 'svelte', 'vue',
    'md', 'mdx', 'txt', 'sql',
    'dockerfile', 'makefile', 'gemfile', 'rakefile',
  ])

  const watcher = chokidar.watch(projectPath, {
    persistent: true,
    ignoreInitial: true,
    ignored: (filePath: string) => {
      const rel = filePath.slice(projectPath.length + 1)
      // Always allow the root itself through
      if (!rel) return false

      const first = rel.split('/')[0]

      // Directory blocklist — stops chokidar from descending entirely,
      // so no fds are opened for any files inside these directories.
      if ([
        'node_modules', '.git', 'dist', 'build', 'out',
        '.next', '.nuxt', 'coverage', '.cache', '__pycache__',
        '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.ruff_cache',
        // Common ML/data directories that can contain millions of files
        'artifacts', 'data', 'dataset', 'datasets', 'raw_data',
        'models', 'weights', 'checkpoints', 'ckpt', 'logs',
        'wandb', 'mlruns', 'runs',
      ].includes(first) || first.startsWith('.')) return true

      // For user-supplied patterns (from project + global settings), do a simple substring match
      for (const pat of allExcludePatterns) {
        if (rel.includes(pat)) return true
      }

      // For files (not directories), only watch known source extensions.
      // This prevents chokidar from opening a watcher fd for every .pkl,
      // .bin, .h5, .parquet, etc. in a project's data directories.
      const dotIdx = rel.lastIndexOf('.')
      if (dotIdx !== -1) {
        const ext = rel.slice(dotIdx + 1).toLowerCase()
        if (!SOURCE_EXTS.has(ext)) return true
      }

      return false
    },
  })

  const entry: WatcherEntry = { watcher, debounceTimer: null }
  watchers.set(projectPath, entry)

  function scheduleScan() {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    entry.debounceTimer = setTimeout(async () => {
      entry.debounceTimer = null
      try {
        const nodes = await scanCodebase(projectPath, excludePatterns.length ? excludePatterns : undefined)
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

export function stopAllCodebaseWatchers(): void {
  for (const projectPath of [...watchers.keys()]) {
    stopCodebaseWatcher(projectPath)
  }
}

export function stopCodebaseWatcher(projectPath: string): void {
  const entry = watchers.get(projectPath)
  if (!entry) return
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
  watchers.delete(projectPath)
  // Await the close promise so FSEvents teardown is async and doesn't stall
  // the main-process event loop. Fire-and-forget is intentional here.
  entry.watcher.close().catch(() => {})
}
