export enum ActionType {
  READ = 'read',
  CREATED = 'created',
  EDITED = 'edited',
  DELETED = 'deleted',
  EXECUTED = 'executed',
  SEARCHED = 'searched',
  SPAWNED_AGENT = 'spawned'
}

export type ToolName =
  | 'Read' | 'Write' | 'Edit' | 'MultiEdit' | 'Bash'
  | 'Glob' | 'Grep' | 'LS' | 'Agent' | 'WebFetch'
  | 'WebSearch' | 'TodoRead' | 'TodoWrite' | 'NotebookRead' | 'NotebookEdit'

export interface ClaudeAction {
  id: string
  sessionId: string
  timestamp: string
  type: ActionType
  filePath?: string
  symbolName?: string
  toolName: ToolName
  input: Record<string, unknown>
  parentActionId?: string
}
