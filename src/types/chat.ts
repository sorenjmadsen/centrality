import type { ClaudeAction } from './actions'
import type { ToolCallEntry } from './session'

export interface ChatMessage {
  id: string
  parentId?: string
  role: 'user' | 'assistant'
  timestamp: string
  textContent: string
  toolCalls: ToolCallEntry[]
  model?: string
  tokenUsage?: {
    input: number
    output: number
    cacheRead?: number
    cacheWrite?: number
  }
}

export interface ChatExchange {
  id: string
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  actions: ClaudeAction[]
  affectedNodes: string[]
}

export interface ChatMarker {
  id: string
  type: 'compaction' | 'model_switch' | 'command'
  timestamp: string
  details?: string   // command name or model change description
  output?: string    // command stdout (for 'command' type)
}

export interface PlaybackState {
  isPlaying: boolean
  speed: 1 | 2 | 4
  currentExchangeIndex: number
  highlightedNodes: Set<string>
  cumulativeActions: ClaudeAction[]
}
