import { create } from 'zustand'

interface UiStore {
  selectedProjectEncoded: string | null
  selectedProjectPath: string | null
  selectedSessionPath: string | null
  selectedNodeId: string | null
  selectedExchangeId: string | null

  // Incrementing nonce — bumped when something requests the graph pan/zoom to focusNodeId
  focusNodeId: string | null
  focusNodeNonce: number
  focusNode(id: string): void

  // Playback index — null = show all exchanges; set by clicking an exchange
  playbackIndex: number | null

  // Active nodes for the current playback exchange (for pulse animation)
  activeNodeIds: Set<string>

  // Filters
  actionTypeFilter: Set<string>  // empty = show all action types

  // Granularity
  granularity: 'files' | 'symbols'
  setGranularity(g: 'files' | 'symbols'): void

  // Context breakdown modal
  isContextBreakdownOpen: boolean
  setContextBreakdownOpen(v: boolean): void

  setSelectedProject(encoded: string, projectPath: string): void
  setSelectedSession(path: string): void
  setSelectedNode(id: string | null): void
  setSelectedExchange(id: string | null): void

  setPlaybackIndex(i: number | null): void
  setActiveNodeIds(ids: Set<string>): void

  toggleActionTypeFilter(type: string): void
  clearActionTypeFilter(): void
}

export const useUiStore = create<UiStore>((set) => ({
  selectedProjectEncoded: null,
  selectedProjectPath: null,
  selectedSessionPath: null,
  selectedNodeId: null,
  selectedExchangeId: null,
  focusNodeId: null,
  focusNodeNonce: 0,
  focusNode: id => set(s => ({ focusNodeId: id, focusNodeNonce: s.focusNodeNonce + 1, selectedNodeId: id })),
  playbackIndex: null,
  activeNodeIds: new Set(),
  actionTypeFilter: new Set(),
  granularity: 'files',
  isContextBreakdownOpen: false,

  setSelectedProject: (encoded, projectPath) => set({
    selectedProjectEncoded: encoded,
    selectedProjectPath: projectPath,
    selectedSessionPath: null,
    selectedNodeId: null,
    selectedExchangeId: null,
    playbackIndex: null,
    activeNodeIds: new Set(),
  }),

  setSelectedSession: path => set({
    selectedSessionPath: path,
    playbackIndex: null,
    activeNodeIds: new Set(),
  }),

  setSelectedNode: id => set({ selectedNodeId: id }),
  setSelectedExchange: id => set({ selectedExchangeId: id }),

  setPlaybackIndex: i => set({ playbackIndex: i }),
  setActiveNodeIds: ids => set({ activeNodeIds: ids }),

  setContextBreakdownOpen: v => set({ isContextBreakdownOpen: v }),

  toggleActionTypeFilter: type => set(s => {
    const next = new Set(s.actionTypeFilter)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    return { actionTypeFilter: next }
  }),

  clearActionTypeFilter: () => set({ actionTypeFilter: new Set() }),

  setGranularity: g => set({ granularity: g }),
}))
