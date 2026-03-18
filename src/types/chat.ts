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
  }
}

export interface ChatExchange {
  id: string
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  actions: ClaudeAction[]
  affectedNodes: string[]
}

export interface PlaybackState {
  isPlaying: boolean
  speed: 1 | 2 | 4
  currentExchangeIndex: number
  highlightedNodes: Set<string>
  cumulativeActions: ClaudeAction[]
}
