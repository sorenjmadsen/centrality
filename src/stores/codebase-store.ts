import { create } from 'zustand'
import type { CodebaseNode } from '../types/codebase'

interface CodebaseStore {
  nodes: Map<string, CodebaseNode>
  rootIds: string[]
  isLoading: boolean
  /** Set to true when nodes are restored from cache. useGraphSync reads and clears this
   *  to skip the expensive layout rebuild for that render cycle. */
  restoredFromCache: boolean

  scanProject(projectPath: string): Promise<void>
  clear(): void
}

export const useCodebaseStore = create<CodebaseStore>(set => ({
  nodes: new Map(),
  rootIds: [],
  isLoading: false,
  restoredFromCache: false,

  scanProject: async (projectPath: string) => {
    set({ isLoading: true, nodes: new Map(), rootIds: [] })
    try {
      const raw = await window.api.scanCodebase(projectPath) as CodebaseNode[]
      const nodes = new Map(raw.map(n => [n.id, n]))
      // Root nodes are those with no parent
      const rootIds = raw.filter(n => n.parent == null).map(n => n.id)
      set({ nodes, rootIds })
    } finally {
      set({ isLoading: false })
    }
  },

  clear: () => set({ nodes: new Map(), rootIds: [], restoredFromCache: false }),
}))
