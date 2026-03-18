import { contextBridge, ipcRenderer } from 'electron'

export type IpcChannels =
  | 'projects:list'
  | 'session:list'
  | 'session:load'
  | 'session:watch'
  | 'codebase:scan'
  | 'dep:scan'
  | 'export:markdown'
  | 'export:screenshot'

contextBridge.exposeInMainWorld('api', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  listSessions: (projectPath: string) => ipcRenderer.invoke('session:list', projectPath),
  loadSession: (sessionPath: string) => ipcRenderer.invoke('session:load', sessionPath),
  scanCodebase: (projectPath: string) => ipcRenderer.invoke('codebase:scan', projectPath),
  onSessionUpdate: (callback: (data: unknown) => void) => {
    ipcRenderer.on('session:update', (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('session:update')
  },
  gitLog: (projectPath: string) => ipcRenderer.invoke('git:log', projectPath),
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
