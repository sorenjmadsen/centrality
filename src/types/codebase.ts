import type { ClaudeAction } from './actions'

export interface DirTreeNode {
  /** Relative path from project root (empty string for root) */
  relPath: string
  name: string
  /** Number of direct file children in this directory */
  fileCount: number
  /** Recursive total: files in this dir + all subdirs */
  totalFileCount: number
  children: DirTreeNode[]
}

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
