interface Window {
  api: {
    platform: string
    getProjectSettings(encodedName: string): Promise<unknown>
    setProjectSettings(encodedName: string, settings: unknown): Promise<void>
    getGlobalSettings(): Promise<unknown>
    setGlobalSettings(settings: unknown): Promise<void>
    listProjects(): Promise<unknown>
    listSessions(encodedName: string): Promise<unknown>
    loadSession(filePath: string): Promise<unknown>
    readClaudeMd(projectPath: string): Promise<unknown>
    scanCodebase(projectPath: string, encodedName: string): Promise<unknown>
    onSessionUpdate(callback: (data: unknown) => void): () => void
    watchCodebase(projectPath: string, encodedName: string): Promise<void>
    unwatchCodebase(projectPath: string): Promise<void>
    onCodebaseUpdate(callback: (data: unknown) => void): () => void
    gitLog(projectPath: string, encodedName: string): Promise<unknown>
    gitDiff(projectPath: string, commitHash: string): Promise<unknown>
    gitInlineDiff(oldStr: string, newStr: string, filePath: string): Promise<unknown>
    gitWatch(projectPath: string): Promise<void>
    onGitHeadChanged(callback: (commits: unknown) => void): () => void
    depScan(projectPath: string, filePaths: string[]): Promise<unknown>
    exportMarkdown(
      projectPath: string,
      sessionPath: string,
      exchanges: Array<{
        index: number
        userText: string
        assistantText: string
        actions: Array<{ toolName: string; filePath?: string }>
      }>
    ): Promise<unknown>
    exportScreenshot(): Promise<unknown>
    exportSettings(): Promise<{ success: boolean; cancelled: boolean }>
    importSettings(): Promise<unknown>
    pickDirectory(): Promise<{ path: string; warning: string | null } | null>
  }
}
