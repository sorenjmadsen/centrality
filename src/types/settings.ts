export interface ProjectSettings {
  /** Additional dirs/files to exclude beyond the hardcoded EXCLUDE set */
  excludePatterns: string[]
  /** Load git commits from this many days back. null = use default --max-count=10 */
  gitHistoryDays: number | null
}

export interface GlobalSettings {
  /** Override for the Claude base directory. null = ~/.claude */
  claudeDir: string | null
  /** Launch the app automatically at login */
  launchAtLogin: boolean
  /** Show the app in the macOS dock */
  showDockIcon: boolean
  /** UI color theme (placeholder — not yet applied) */
  colorTheme: 'dark' | 'system'
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  excludePatterns: [],
  gitHistoryDays: null,
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  claudeDir: null,
  launchAtLogin: false,
  showDockIcon: true,
  colorTheme: 'dark',
}
