import { create } from 'zustand'

export interface SessionTab {
  id: string
  projectEncoded: string
  projectPath: string
  projectDisplayName: string
  sessionPath: string
  sessionId: string
  mtime: number
}

export interface TabViewState {
  // DOM/viewport state
  chatScrollTop?: number
  graphViewport?: { x: number; y: number; zoom: number }
  // Per-tab UI state from ui-store
  selectedNodeId?: string | null
  selectedExchangeId?: string | null
  playbackIndex?: number | null
  actionTypeFilter?: Set<string>
  granularity?: 'files' | 'symbols'
}

export interface RecentProject {
  encodedName: string
  projectPath: string
  displayName: string
  lastOpened: number
  lastSessionPath: string
  lastSessionId: string
  lastSessionMtime: number
}

const STORAGE_KEY = 'claude-vertex:recent-projects'
const MAX_RECENT = 10

function loadRecent(): RecentProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RecentProject[]) : []
  } catch {
    return []
  }
}

function saveRecent(projects: RecentProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

interface TabsStore {
  tabs: SessionTab[]
  activeTabId: string | null  // null = dashboard
  recentProjects: RecentProject[]
  tabViewState: Record<string, TabViewState>

  setActiveTab(id: string | null): void
  /** Opens (or focuses) a tab. Returns the tab id. */
  openTab(data: Omit<SessionTab, 'id'>): string
  /** Removes a tab without changing activeTabId — caller is responsible for switching. */
  closeTab(id: string): void
  recordRecentProject(p: Omit<RecentProject, 'lastOpened'>): void
  saveTabViewState(id: string, patch: Partial<TabViewState>): void
}

let _seq = 0

export const useTabsStore = create<TabsStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  recentProjects: loadRecent(),
  tabViewState: {},

  setActiveTab: id => set({ activeTabId: id }),

  openTab: data => {
    const { tabs } = get()
    const existing = tabs.find(t => t.sessionPath === data.sessionPath)
    if (existing) {
      set({ activeTabId: existing.id })
      return existing.id
    }
    const id = `tab-${++_seq}`
    set({ tabs: [...tabs, { ...data, id }], activeTabId: id })
    return id
  },

  closeTab: id => {
    set(state => ({ tabs: state.tabs.filter(t => t.id !== id) }))
  },

  saveTabViewState: (id, patch) => {
    set(state => ({
      tabViewState: {
        ...state.tabViewState,
        [id]: { ...state.tabViewState[id], ...patch },
      },
    }))
  },

  recordRecentProject: project => {
    const recent = loadRecent()
    const filtered = recent.filter(r => r.encodedName !== project.encodedName)
    const updated = [{ ...project, lastOpened: Date.now() }, ...filtered].slice(0, MAX_RECENT)
    saveRecent(updated)
    set({ recentProjects: updated })
  },
}))
