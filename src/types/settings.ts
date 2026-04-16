/** Default directories excluded from scanning and watching. Visible in
 *  Project Settings so users can see (and override) what's filtered out. */
export const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  'node_modules', '.git', 'dist', 'build', 'out', '__pycache__',
  '.next', '.nuxt', 'coverage', '.cache', '.venv', 'venv',
  '.mypy_cache', '.pytest_cache', '.ruff_cache',
  'artifacts', 'data', 'dataset', 'datasets', 'raw_data',
  'models', 'weights', 'checkpoints', 'ckpt', 'logs',
  'wandb', 'mlruns', 'runs',
]

export interface ProjectSettings {
  /** Directories/files to exclude from scanning and watching */
  excludePatterns: string[]
  /** Load git commits from this many days back. null = use default --max-count=10 */
  gitHistoryDays: number | null
}

export type SshAuthMethod = 'auto' | 'agent' | 'password' | 'key'

export interface RemoteSettings {
  /** Whether remote mode is enabled */
  enabled: boolean
  /** Hostname or alias from ~/.ssh/config (required) */
  host: string
  /** SSH port. null = default (22 / ssh config) */
  port: number | null
  /** Remote username. empty = current user or ssh config */
  user: string
  /** Auth method selection */
  authMethod: SshAuthMethod
  /** Path to private key file (used when authMethod === 'key') */
  privateKeyPath: string
  /** Passphrase for private key, or password when authMethod === 'password'.
   * NOTE: stored in plaintext in config.json — fine for a local dev tool,
   * document the caveat in the UI. */
  password: string
  /** Remote Claude directory override. empty = ~/.claude on the remote */
  remoteClaudeDir: string
}

export type EditorChoice = 'auto' | 'vscode' | 'cursor' | 'zed' | 'sublime' | 'webstorm' | 'vim' | 'neovim'

export interface GlobalSettings {
  /** Override for the Claude base directory. null = ~/.claude */
  claudeDir: string | null
  /** Launch the app automatically at login */
  launchAtLogin: boolean
  /** Show the app in the macOS dock */
  showDockIcon: boolean
  /** UI color theme */
  colorTheme: 'dark' | 'light' | 'terracotta'
  /** Preferred editor for "Open in Editor" deep linking */
  preferredEditor: EditorChoice
  /** Remote SSH connection settings */
  remote: RemoteSettings
  /** Directories excluded from scanning/watching across all projects */
  defaultExcludePatterns: string[]
  /** Automatically check for and download updates */
  autoUpdateEnabled: boolean
}

export const DEFAULT_REMOTE_SETTINGS: RemoteSettings = {
  enabled: false,
  host: '',
  port: null,
  user: '',
  authMethod: 'auto',
  privateKeyPath: '',
  password: '',
  remoteClaudeDir: '',
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
  preferredEditor: 'auto',
  remote: DEFAULT_REMOTE_SETTINGS,
  defaultExcludePatterns: [...DEFAULT_EXCLUDE_PATTERNS],
  autoUpdateEnabled: true,
}
