import type { ClaudeAction } from './actions'

export type NodeType =
  | 'directory' | 'file' | 'class' | 'function'
  | 'method' | 'type' | 'enum' | 'interface' | 'struct'

export interface CodebaseNode {
  id: string
  type: NodeType
  name: string
  path: string
  parent?: string
  children: string[]
  language?: string
  startLine?: number
  endLine?: number
  actions: ClaudeAction[]
}
