interface Window {
  api: {
    listProjects(): Promise<unknown>
    listSessions(encodedName: string): Promise<unknown>
    loadSession(filePath: string): Promise<unknown>
    scanCodebase(projectPath: string): Promise<unknown>
    onSessionUpdate(callback: (data: unknown) => void): () => void
    gitLog(projectPath: string): Promise<unknown>
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
  }
}
