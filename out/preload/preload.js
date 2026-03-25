"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  getProjectSettings: (encodedName) => electron.ipcRenderer.invoke("settings:get-project", encodedName),
  setProjectSettings: (encodedName, settings) => electron.ipcRenderer.invoke("settings:set-project", encodedName, settings),
  getGlobalSettings: () => electron.ipcRenderer.invoke("settings:get-global"),
  setGlobalSettings: (settings) => electron.ipcRenderer.invoke("settings:set-global", settings),
  listProjects: () => electron.ipcRenderer.invoke("projects:list"),
  listSessions: (encodedName) => electron.ipcRenderer.invoke("session:list", encodedName),
  loadSession: (sessionPath) => electron.ipcRenderer.invoke("session:load", sessionPath),
  scanCodebase: (projectPath, encodedName) => electron.ipcRenderer.invoke("codebase:scan", projectPath, encodedName),
  onSessionUpdate: (callback) => {
    electron.ipcRenderer.on("session:update", (_event, data) => callback(data));
    return () => electron.ipcRenderer.removeAllListeners("session:update");
  },
  gitLog: (projectPath, encodedName) => electron.ipcRenderer.invoke("git:log", projectPath, encodedName),
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
