import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { getGlobalSettings } from './settings-manager'

let mainWindow: BrowserWindow | null = null
let checkInterval: ReturnType<typeof setInterval> | null = null

const FOUR_HOURS = 4 * 60 * 60 * 1000

export type AutoUpdateStatus =
  | { event: 'checking' }
  | { event: 'available'; version: string; releaseNotes?: string }
  | { event: 'not-available'; version: string }
  | { event: 'downloading'; progress: ProgressInfo }
  | { event: 'downloaded'; version: string }
  | { event: 'error'; message: string }

function send(status: AutoUpdateStatus) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('autoupdate:status', status)
  }
}

export function initAutoUpdater(win: BrowserWindow) {
  mainWindow = win

  // Configure electron-updater
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.autoRunAppAfterInstall = false

  // Allow pre-release updates only if current version is a pre-release
  autoUpdater.allowPrerelease = false

  // Event listeners
  autoUpdater.on('checking-for-update', () => {
    send({ event: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send({
      event: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    send({ event: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    send({ event: 'downloading', progress })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    send({ event: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    send({ event: 'error', message: err.message })
  })

  // IPC handlers
  ipcMain.handle('autoupdate:check', async () => {
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      send({ event: 'error', message: (err as Error).message })
    }
  })

  // Initial check after a short delay, then periodic
  scheduleChecks()
}

function scheduleChecks() {
  // Initial check 3 seconds after launch
  setTimeout(() => {
    if (isAutoUpdateEnabled()) {
      autoUpdater.checkForUpdates().catch(() => { /* silent */ })
    }
  }, 3000)

  // Periodic check every 4 hours
  checkInterval = setInterval(() => {
    if (isAutoUpdateEnabled()) {
      autoUpdater.checkForUpdates().catch(() => { /* silent */ })
    }
  }, FOUR_HOURS)
}

function isAutoUpdateEnabled(): boolean {
  try {
    const settings = getGlobalSettings()
    return settings.autoUpdateEnabled !== false
  } catch {
    return true // default to enabled
  }
}

export function stopAutoUpdater() {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}
