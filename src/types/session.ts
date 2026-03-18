import type { ToolName } from './actions'

export interface ToolCallEntry {
  id: string
  toolName: ToolName
  input: Record<string, unknown>
  result?: string
  affectedFiles: string[]
}

export interface JSONLEntry {
  type: 'user' | 'assistant' | 'summary'
  uuid: string
  parentUuid?: string
  timestamp: string
  sessionId: string
  message: {
    id: string
    role: 'user' | 'assistant'
    model?: string
    content: ContentBlock[]
    stop_reason?: 'end_turn' | 'tool_use'
    usage?: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
    }
  }
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: ToolName; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }
