import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { listProjects, listSessions, parseSession } from './ipc/jsonl-parser'
import { scanCodebase } from './ipc/codebase-scanner'
import { startSessionWatcher } from './ipc/session-watcher'
import { getGitLog, getGitDiff, makeInlineDiff, startGitWatcher } from './ipc/git-integration'
import { scanDeps } from './ipc/dep-scanner'
import { exportMarkdown, captureScreenshot, type ExchangeExportItem } from './ipc/exporter'
import {
  getProjectSettings, setProjectSettings,
  getGlobalSettings, setGlobalSettings,
} from './ipc/settings-manager'
import type { ProjectSettings, GlobalSettings } from '../src/types/settings'

const isDev = process.env['NODE_ENV'] === 'development'

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
  startSessionWatcher()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
