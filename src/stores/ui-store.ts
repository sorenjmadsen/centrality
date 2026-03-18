import { create } from 'zustand'

interface UiStore {
  selectedProjectEncoded: string | null
  selectedProjectPath: string | null
  selectedSessionPath: string | null
  selectedNodeId: string | null
  selectedExchangeId: string | null

  // Playback
  playbackIndex: number | null   // null = show all exchanges
  isPlaying: boolean
  playbackSpeed: 1 | 2 | 4

  // Active nodes for the current playback exchange (for pulse animation)
  activeNodeIds: Set<string>

  // Filters
  actionTypeFilter: Set<string>  // empty = show all action types

  // Granularity
  granularity: 'files' | 'symbols'
  setGranularity(g: 'files' | 'symbols'): void

  setSelectedProject(encoded: string, projectPath: string): void
  setSelectedSession(path: string): void
  setSelectedNode(id: string | null): void
  setSelectedExchange(id: string | null): void

  setPlaybackIndex(i: number | null): void
  setPlaying(v: boolean): void
  setPlaybackSpeed(s: 1 | 2 | 4): void
  setActiveNodeIds(ids: Set<string>): void
  stepForward(maxIndex: number): void
  stepBack(maxIndex: number): void

  toggleActionTypeFilter(type: string): void
  clearActionTypeFilter(): void
}

export const useUiStore = create<UiStore>((set, get) => ({
  selectedProjectEncoded: null,
  selectedProjectPath: null,
  selectedSessionPath: null,
  selectedNodeId: null,
  selectedExchangeId: null,
  playbackIndex: null,
  isPlaying: false,
  playbackSpeed: 1,
  activeNodeIds: new Set(),
  actionTypeFilter: new Set(),
  granularity: 'files',

  setSelectedProject: (encoded, projectPath) => set({
    selectedProjectEncoded: encoded,
    selectedProjectPath: projectPath,
    selectedSessionPath: null,
    selectedNodeId: null,
    selectedExchangeId: null,
    playbackIndex: null,
    isPlaying: false,
    activeNodeIds: new Set(),
  }),

  setSelectedSession: path => set({
    selectedSessionPath: path,
    playbackIndex: null,
    isPlaying: false,
    activeNodeIds: new Set(),
  }),

  setSelectedNode: id => set({ selectedNodeId: id }),
  setSelectedExchange: id => set({ selectedExchangeId: id }),

  setPlaybackIndex: i => set({ playbackIndex: i }),
  setPlaying: v => set({ isPlaying: v }),
  setPlaybackSpeed: s => set({ playbackSpeed: s }),
  setActiveNodeIds: ids => set({ activeNodeIds: ids }),

  stepForward: maxIndex => {
    const { playbackIndex } = get()
    const next = playbackIndex === null ? 0 : Math.min(playbackIndex + 1, maxIndex)
    set({ playbackIndex: next })
  },

  stepBack: (maxIndex) => {
    const { playbackIndex } = get()
    if (playbackIndex === null) {
      set({ playbackIndex: maxIndex })
      return
    }
    const prev = Math.max(playbackIndex - 1, 0)
    set({ playbackIndex: prev === 0 && playbackIndex === 0 ? null : prev })
  },

  toggleActionTypeFilter: type => set(s => {
    const next = new Set(s.actionTypeFilter)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    return { actionTypeFilter: next }
  }),

  clearActionTypeFilter: () => set({ actionTypeFilter: new Set() }),

  setGranularity: g => set({ granularity: g }),
}))
