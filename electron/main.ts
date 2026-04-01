import { app, BrowserWindow, shell, ipcMain } from 'electron'
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
import type { ProjectSettings, GlobalSettings } from '../src/types/settings'

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

function registerIpcHandlers(): void {
  ipcMain.handle('settings:get-project', (_event, encodedName: string) =>
    getProjectSettings(encodedName)
  )

  ipcMain.handle('settings:set-project', (_event, encodedName: string, settings: ProjectSettings) =>
    setProjectSettings(encodedName, settings)
  )

  ipcMain.handle('settings:get-global', () => getGlobalSettings())

  ipcMain.handle('settings:set-global', (_event, settings: GlobalSettings) =>
    setGlobalSettings(settings)
  )

  ipcMain.handle('projects:list', () => {
    const { claudeDir } = getGlobalSettings()
    return listProjects(claudeDir ?? undefined)
  })

  ipcMain.handle('session:list', (_event, encodedName: string) => {
    const { claudeDir } = getGlobalSettings()
    return listSessions(encodedName, claudeDir ?? undefined)
  })

  ipcMain.handle('session:load', async (_event, filePath: string) => {
    return await parseSession(filePath)
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
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  const stopSessionWatcher = startSessionWatcher()
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
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
