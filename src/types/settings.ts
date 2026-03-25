export interface ProjectSettings {
  /** Additional dirs/files to exclude beyond the hardcoded EXCLUDE set */
  excludePatterns: string[]
  /** Load git commits from this many days back. null = use default --max-count=200 */
  gitHistoryDays: number | null
}

export interface GlobalSettings {
  /** Override for the Claude projects directory. null = ~/.claude/projects */
  claudeDir: string | null
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  excludePatterns: [],
  gitHistoryDays: null,
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  claudeDir: null,
}
