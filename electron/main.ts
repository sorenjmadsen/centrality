import { app, BrowserWindow, dialog, shell, ipcMain } from 'electron'
import * as fs from 'fs'
import { join } from 'path'
import { listProjects, listSessions, parseSession } from './ipc/jsonl-parser'
import { scanCodebase } from './ipc/codebase-scanner'
import { startSessionWatcher } from './ipc/session-watcher'
import { getGitLog, getGitDiff, makeInlineDiff, startGitWatcher, stopGitWatcher } from './ipc/git-integration'
import { startCodebaseWatcher, stopCodebaseWatcher, stopAllCodebaseWatchers } from './ipc/codebase-watcher'
import { scanDeps } from './ipc/dep-scanner'
import { exportMarkdown, captureScreenshot, type ExchangeExportItem } from './ipc/exporter'
import {
  getProjectSettings, setProjectSettings,
  getGlobalSettings, setGlobalSettings,
} from './ipc/settings-manager'
import {
  testConnection as sshTestConnection,
  listRemoteProjects, listRemoteSessions, loadRemoteSession,
  startRemoteWatcher, stopRemoteWatcher, closeRemoteConnection,
  disconnectRemote, isRemotePath,
} from './ipc/ssh-manager'
import type { ProjectSettings, GlobalSettings, RemoteSettings } from '../src/types/settings'

const isDev = process.env['NODE_ENV'] === 'development'

// Raise the open-file-descriptor soft limit from the macOS default (256) to
// something large enough to accommodate chokidar watchers + tree-sitter + IPC.
try {
  process.setrlimit('nofile', { soft: 8192, hard: 8192 })
} catch {
  // Older Node / unsupported platform — proceed with system default
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// In-memory cache of the remote SSH password / key passphrase. We deliberately
// strip this before persisting settings to disk (see settings-manager), so it
// only lives for the duration of the process. Every place that needs the
// *current* remote config for SSH should go through getActiveRemote() so it
// gets the disk config merged with the cached secret.
let cachedRemotePassword: string = ''

function getActiveRemote(): RemoteSettings | null {
  const { remote } = getGlobalSettings()
  if (!remote) return null
  return cachedRemotePassword ? { ...remote, password: cachedRemotePassword } : remote
}

function registerIpcHandlers(): void {
  ipcMain.handle('settings:get-project', (_event, encodedName: string) =>
    getProjectSettings(encodedName)
  )

  ipcMain.handle('settings:set-project', (_event, encodedName: string, settings: ProjectSettings) =>
    setProjectSettings(encodedName, settings)
  )

  ipcMain.handle('settings:get-global', () => getGlobalSettings())

  ipcMain.handle('ssh:test-connection', (_event, remote: RemoteSettings) => {
    // Cache the password in memory so subsequent listings/watcher can reuse
    // it without asking the user again, while the disk config stays clean.
    cachedRemotePassword = remote.password ?? ''
    return sshTestConnection(remote)
  })

  ipcMain.handle('ssh:disconnect', () => {
    cachedRemotePassword = ''
    disconnectRemote()
  })

  ipcMain.handle('settings:set-global', (_event, settings: GlobalSettings) => {
    setGlobalSettings(settings)
    // Apply system-level effects
    try {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin ?? false })
    } catch {
      // Unsupported on this platform — ignore
    }
    if (app.dock) {
      if (settings.showDockIcon ?? true) {
        app.dock.show()
      } else {
        app.dock.hide()
      }
    }
    // Remember any freshly-supplied password so the SFTP session can keep
    // using it after settings are written to disk (where it's stripped).
    if (settings.remote?.password) cachedRemotePassword = settings.remote.password
    // Restart the remote watcher so it picks up new auth / host settings.
    // Always tear down the cached SSH client first — its config may be stale.
    closeRemoteConnection()
    const active = getActiveRemote()
    if (active?.enabled) startRemoteWatcher(active)
    else stopRemoteWatcher()
  })

  ipcMain.handle('projects:list', () => {
    const active = getActiveRemote()
    if (active?.enabled) return listRemoteProjects(active)
    return listProjects(getGlobalSettings().claudeDir ?? undefined)
  })

  ipcMain.handle('session:list', (_event, encodedName: string) => {
    const active = getActiveRemote()
    if (active?.enabled) return listRemoteSessions(active, encodedName)
    return listSessions(encodedName, getGlobalSettings().claudeDir ?? undefined)
  })

  ipcMain.handle('session:load', async (_event, filePath: string) => {
    if (isRemotePath(filePath)) {
      const active = getActiveRemote()
      if (active?.enabled) return await loadRemoteSession(active, filePath)
    }
    return await parseSession(filePath)
  })

  ipcMain.handle('session:read-claude-md', async (_event, projectPath: string) => {
    const homeDir = app.getPath('home')
    interface ClaudeMdFile { scope: string; path: string; chars: number }
    const results: ClaudeMdFile[] = []

    async function tryRead(scope: string, filePath: string) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8')
        results.push({ scope, path: filePath, chars: content.length })
      } catch { /* file not found — skip */ }
    }

    // Global and project-root CLAUDE.md
    await tryRead('global', join(homeDir, '.claude', 'CLAUDE.md'))
    await tryRead('project', join(projectPath, 'CLAUDE.md'))

    // Directory-level: scan up to 3 levels deep within the project
    async function scanDir(dir: string, depth: number) {
      if (depth > 3) return
      let entries: fs.Dirent[]
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) }
      catch { return }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          await scanDir(fullPath, depth + 1)
        } else if (entry.name === 'CLAUDE.md' && depth > 0) {
          // depth > 0 skips the project root (already handled)
          await tryRead('directory', fullPath)
        }
      }
    }
    await scanDir(projectPath, 0)

    return results
  })

  ipcMain.handle('codebase:scan', (_event, projectPath: string, encodedName: string) => {
    const { excludePatterns } = getProjectSettings(encodedName)
    return scanCodebase(projectPath, excludePatterns.length ? excludePatterns : undefined)
  })

  ipcMain.handle('git:log', (_event, projectPath: string, encodedName: string) => {
    const { gitHistoryDays } = getProjectSettings(encodedName)
    return getGitLog(projectPath, gitHistoryDays ?? undefined)
  })

  ipcMain.handle('git:diff', (_event, projectPath: string, commitHash: string) =>
    getGitDiff(projectPath, commitHash)
  )

  ipcMain.handle('git:inline-diff', (
    _event,
    oldStr: string,
    newStr: string,
    filePath: string,
  ) => makeInlineDiff(oldStr, newStr, filePath))

  ipcMain.handle('git:watch', (_event, projectPath: string) => {
    startGitWatcher(projectPath)
  })

  ipcMain.handle('codebase:watch', (_event, projectPath: string, encodedName: string) => {
    startCodebaseWatcher(projectPath, encodedName)
  })

  ipcMain.on('codebase:unwatch', (_event, projectPath: string) => {
    // Defer to the next event-loop tick so FSEvents teardown doesn't block
    // the IPC handler and cause a beach ball in the renderer.
    setImmediate(() => stopCodebaseWatcher(projectPath))
  })

  ipcMain.handle('dep:scan', (_event, projectPath: string, filePaths: string[]) =>
    scanDeps(projectPath, filePaths)
  )

  ipcMain.handle('export:markdown', (
    _event,
    projectPath: string,
    sessionPath: string,
    exchanges: ExchangeExportItem[]
  ) => exportMarkdown(projectPath, sessionPath, exchanges))

  ipcMain.handle('export:screenshot', () => captureScreenshot())

  ipcMain.handle('settings:pick-directory', async (_event) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Select Claude Projects Directory',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const dirPath = result.filePaths[0]

    // Validate: should look like ~/.claude — containing a projects/ subdir with
    // encoded project dirs (e.g. "-Users-soren-my-project") that hold .jsonl session files.
    let warning: string | null = null
    try {
      const projectsPath = `${dirPath}/projects`
      if (!fs.existsSync(projectsPath)) {
        warning = 'This doesn\'t look like a Claude directory.'
      } else {
        const entries = fs.readdirSync(projectsPath, { withFileTypes: true })
        const encodedProjectDirs = entries.filter(
          e => e.isDirectory() && e.name.startsWith('-') && !/[\s.]/.test(e.name)
        )
        const hasJsonl = encodedProjectDirs.some(sub => {
          try {
            return fs.readdirSync(`${projectsPath}/${sub.name}`).some(f => f.endsWith('.jsonl'))
          } catch { return false }
        })
        if (!hasJsonl) {
          warning = 'This doesn\'t look like a Claude directory.'
        }
      }
    } catch {
      warning = 'Could not read the selected directory.'
    }

    return { path: dirPath, warning }
  })

  ipcMain.handle('settings:export', async (_event) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Export Centrality Settings',
      defaultPath: 'centrality-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.cancelled || !result.filePath) return { success: false, cancelled: true }
    const settings = getGlobalSettings()
    fs.writeFileSync(result.filePath, JSON.stringify(settings, null, 2))
    return { success: true, cancelled: false }
  })

  ipcMain.handle('settings:import', async (_event) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Import Centrality Settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.cancelled || result.filePaths.length === 0) return null
    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  const stopSessionWatcher = startSessionWatcher()

  // If remote mode was enabled in the persisted config, try to start polling.
  // Password auth can't resume automatically because we never persist the
  // password — clear the enabled flag so the UI prompts for a fresh Connect.
  // 'auto', 'agent', and 'key' (unencrypted or the user accepts the risk)
  // can all attempt a reconnect without prior interaction.
  const initialSettings = getGlobalSettings()
  const initialRemote = initialSettings.remote
  if (initialRemote?.enabled) {
    if (initialRemote.authMethod === 'password') {
      setGlobalSettings({ ...initialSettings, remote: { ...initialRemote, enabled: false } })
    } else {
      startRemoteWatcher(initialRemote)
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Close all persistent watchers before the process exits. Without this,
  // chokidar's persistent:true handles keep the Node.js event loop alive and
  // the app either hangs on quit or exits with an error.
  app.on('before-quit', () => {
    stopSessionWatcher()
    stopGitWatcher()
    stopAllCodebaseWatchers()
    stopRemoteWatcher()
    closeRemoteConnection()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
