/**
 * Per-session cache of all data loaded via IPC.
 * Keyed by sessionPath so closing and reopening a tab reuses the same cache.
 * When a cache entry exists, useOpenSession skips all IPC calls and restores
 * the stores directly from memory.
 */
import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { ClaudeAction } from '../types/actions'
import type { ChatExchange, ChatMarker } from '../types/chat'
import type { CodebaseNode } from '../types/codebase'
import type { GitCommit } from '../types/git'
import type { DepEdge } from './graph-store'
import type { SessionInfo } from './session-store'

export interface TabCacheEntry {
  // From loadSession
  exchanges: ChatExchange[]
  actions: ClaudeAction[]
  markers: ChatMarker[]
  // From listSessions
  sessions: SessionInfo[]
  // From scanCodebase
  codebaseNodes: Map<string, CodebaseNode>
  codebaseRootIds: string[]
  // From depScan (may arrive later — entry is patched when ready)
  depEdges: DepEdge[]
  // From buildGraphFromNodes (saved after first successful render)
  graphNodes: Node[]
  graphEdges: Edge[]
  // From gitLog
  commits: GitCommit[]
}

interface TabCacheStore {
  cache: Map<string, Partial<TabCacheEntry>>
  patch(sessionPath: string, data: Partial<TabCacheEntry>): void
  get(sessionPath: string): Partial<TabCacheEntry> | undefined
  delete(sessionPath: string): void
}

export const useTabCacheStore = create<TabCacheStore>((set, get) => ({
  cache: new Map(),

  patch: (sessionPath, data) => {
    set(state => {
      const next = new Map(state.cache)
      next.set(sessionPath, { ...next.get(sessionPath), ...data })
      return { cache: next }
    })
  },

  get: sessionPath => get().cache.get(sessionPath),

  delete: sessionPath => {
    set(state => {
      const next = new Map(state.cache)
      next.delete(sessionPath)
      return { cache: next }
    })
  },
}))
