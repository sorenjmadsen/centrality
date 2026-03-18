"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  listProjects: () => electron.ipcRenderer.invoke("projects:list"),
  listSessions: (projectPath) => electron.ipcRenderer.invoke("session:list", projectPath),
  loadSession: (sessionPath) => electron.ipcRenderer.invoke("session:load", sessionPath),
  scanCodebase: (projectPath) => electron.ipcRenderer.invoke("codebase:scan", projectPath),
  onSessionUpdate: (callback) => {
    electron.ipcRenderer.on("session:update", (_event, data) => callback(data));
    return () => electron.ipcRenderer.removeAllListeners("session:update");
  },
  gitLog: (projectPath) => electron.ipcRenderer.invoke("git:log", projectPath),
  gitDiff: (projectPath, commitHash) => electron.ipcRenderer.invoke("git:diff", projectPath, commitHash),
  gitInlineDiff: (oldStr, newStr, filePath) => electron.ipcRenderer.invoke("git:inline-diff", oldStr, newStr, filePath),
  gitWatch: (projectPath) => electron.ipcRenderer.invoke("git:watch", projectPath),
  onGitHeadChanged: (callback) => {
    electron.ipcRenderer.on("git:head-changed", (_event, commits) => callback(commits));
    return () => electron.ipcRenderer.removeAllListeners("git:head-changed");
  },
  depScan: (projectPath, filePaths) => electron.ipcRenderer.invoke("dep:scan", projectPath, filePaths),
  exportMarkdown: (projectPath, sessionPath, exchanges) => electron.ipcRenderer.invoke("export:markdown", projectPath, sessionPath, exchanges),
  exportScreenshot: () => electron.ipcRenderer.invoke("export:screenshot")
});
