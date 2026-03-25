import { contextBridge, ipcRenderer } from 'electron'

export type IpcChannels =
  | 'settings:get-project'
  | 'settings:set-project'
  | 'settings:get-global'
  | 'settings:set-global'
  | 'projects:list'
  | 'session:list'
  | 'session:load'
  | 'session:watch'
  | 'codebase:scan'
  | 'codebase:watch'
  | 'codebase:unwatch'
  | 'dep:scan'
  | 'export:markdown'
  | 'export:screenshot'

contextBridge.exposeInMainWorld('api', {
  getProjectSettings: (encodedName: string) => ipcRenderer.invoke('settings:get-project', encodedName),
  setProjectSettings: (encodedName: string, settings: unknown) => ipcRenderer.invoke('settings:set-project', encodedName, settings),
  getGlobalSettings: () => ipcRenderer.invoke('settings:get-global'),
  setGlobalSettings: (settings: unknown) => ipcRenderer.invoke('settings:set-global', settings),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  listSessions: (encodedName: string) => ipcRenderer.invoke('session:list', encodedName),
  loadSession: (sessionPath: string) => ipcRenderer.invoke('session:load', sessionPath),
  scanCodebase: (projectPath: string, encodedName: string) => ipcRenderer.invoke('codebase:scan', projectPath, encodedName),
  onSessionUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('session:update', (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('session:update')
  },
  watchCodebase: (projectPath: string, encodedName: string) =>
    ipcRenderer.invoke('codebase:watch', projectPath, encodedName),
  unwatchCodebase: (projectPath: string) =>
    ipcRenderer.invoke('codebase:unwatch', projectPath),
  onCodebaseUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('codebase:update', (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('codebase:update')
  },
  gitLog: (projectPath: string, encodedName: string) => ipcRenderer.invoke('git:log', projectPath, encodedName),
  gitDiff: (projectPath: string, commitHash: string) => ipcRenderer.invoke('git:diff', projectPath, commitHash),
  gitInlineDiff: (oldStr: string, newStr: string, filePath: string) => ipcRenderer.invoke('git:inline-diff', oldStr, newStr, filePath),
  gitWatch: (projectPath: string) => ipcRenderer.invoke('git:watch', projectPath),
  onGitHeadChanged: (callback: (commits: unknown) => void) => {
    ipcRenderer.on('git:head-changed', (_event, commits) => callback(commits))
    return () => ipcRenderer.removeAllListeners('git:head-changed')
  },
  depScan: (projectPath: string, filePaths: string[]) =>
    ipcRenderer.invoke('dep:scan', projectPath, filePaths),
  exportMarkdown: (
    projectPath: string,
    sessionPath: string,
    exchanges: Array<{
      index: number
      userText: string
      assistantText: string
      actions: Array<{ toolName: string; filePath?: string }>
    }>
  ) => ipcRenderer.invoke('export:markdown', projectPath, sessionPath, exchanges),
  exportScreenshot: () => ipcRenderer.invoke('export:screenshot'),
})

// Type declaration lives in src/env.d.ts for the renderer
