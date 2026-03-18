import { create } from 'zustand'
import type { ChatExchange } from '../types/chat'
import type { ClaudeAction } from '../types/actions'

interface CompareStore {
  compareSessionPath: string | null
  compareExchanges: ChatExchange[]
  compareActions: ClaudeAction[]
  compareNodeIds: Set<string>
  setCompareSession(path: string | null, projectPath: string): Promise<void>
  clear(): void
}

function toRelative(absolutePath: string, projectPath: string): string {
  if (absolutePath.startsWith(projectPath)) {
    return absolutePath.slice(projectPath.length).replace(/^\//, '')
  }
  return absolutePath
}

export const useCompareStore = create<CompareStore>((set) => ({
  compareSessionPath: null,
  compareExchanges: [],
  compareActions: [],
  compareNodeIds: new Set(),

  async setCompareSession(path: string | null, projectPath: string) {
    if (!path) {
      set({
        compareSessionPath: null,
        compareExchanges: [],
        compareActions: [],
        compareNodeIds: new Set(),
      })
      return
    }

    const result = await window.api.loadSession(path) as {
      exchanges: ChatExchange[]
      actions: ClaudeAction[]
    }

    const nodeIds = new Set<string>()
    for (const ex of result.exchanges) {
      for (const node of ex.affectedNodes) {
        nodeIds.add(toRelative(node, projectPath))
      }
    }

    set({
      compareSessionPath: path,
      compareExchanges: result.exchanges,
      compareActions: result.actions,
      compareNodeIds: nodeIds,
    })
  },

  clear() {
    set({
      compareSessionPath: null,
      compareExchanges: [],
      compareActions: [],
      compareNodeIds: new Set(),
    })
  },
}))
