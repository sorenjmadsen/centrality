/**
 * Per-tab isolated Zustand stores using React Context.
 *
 * Each tab gets its own store instances so switching tabs is just a CSS
 * display property change — no React re-renders of SessionView components.
 *
 * Usage (inside SessionView and its children):
 *   import { useUiStore, useChatStore, ... } from '../stores/tab-stores'
 *
 * External (non-React) access:
 *   import { tabStoreMap } from '../stores/tab-stores'
 *   tabStoreMap.get(tabId)?.ui.setState({ ... })
 */

import React, { createContext, useContext, useMemo } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { StoreApi } from 'zustand/vanilla'
import type { Node, Edge } from '@xyflow/react'
import type { ChatExchange, ChatMarker } from '../types/chat'
import type { ClaudeAction } from '../types/actions'
import type { CodebaseNode } from '../types/codebase'
import type { GitCommit, GitDiff } from '../types/git'
import type { DepEdge } from './graph-store'
import type { SessionInfo } from './session-store'

// ─── Store State Types ───────────────────────────────────────────────────────

export interface UiStore {
  selectedProjectEncoded: string | null
  selectedProjectPath: string | null
  selectedSessionPath: string | null
  selectedNodeId: string | null
  selectedExchangeId: string | null
  playbackIndex: number | null
  activeNodeIds: Set<string>
  actionTypeFilter: Set<string>
  granularity: 'files' | 'symbols'
  isContextBreakdownOpen: boolean
  setSelectedProject(encoded: string, projectPath: string): void
  setSelectedSession(path: string): void
  setSelectedNode(id: string | null): void
  setSelectedExchange(id: string | null): void
  setPlaybackIndex(i: number | null): void
  setActiveNodeIds(ids: Set<string>): void
  toggleActionTypeFilter(type: string): void
  clearActionTypeFilter(): void
  setGranularity(g: 'files' | 'symbols'): void
  setContextBreakdownOpen(v: boolean): void
}

export interface ChatStore {
  exchanges: ChatExchange[]
  markers: ChatMarker[]
  isLoading: boolean
  setExchanges(exchanges: ChatExchange[], markers?: ChatMarker[]): void
  clear(): void
}

export interface TabSessionStore {
  sessions: SessionInfo[]
  actions: ClaudeAction[]
  isLoadingSession: boolean
}

export interface CodebaseStore {
  nodes: Map<string, CodebaseNode>
  rootIds: string[]
  isLoading: boolean
  restoredFromCache: boolean
  scanProject(projectPath: string, encodedName: string): Promise<void>
  clear(): void
}

export interface GraphStore {
  nodes: Node[]
  edges: Edge[]
  depEdges: DepEdge[]
  setNodes(nodes: Node[]): void
  setEdges(edges: Edge[]): void
  setGraph(nodes: Node[], edges: Edge[]): void
  setDepEdges(edges: DepEdge[]): void
}

export interface GitStore {
  commits: GitCommit[]
  isLoading: boolean
  selectedCommitHash: string | null
  commitDiffs: Map<string, GitDiff>
  highlightedFiles: Set<string>
  loadCommits(projectPath: string, encodedName: string): Promise<void>
  selectCommit(hash: string | null, projectPath: string): Promise<void>
  setCommits(commits: GitCommit[]): void
  clear(): void
}

export interface SearchResult {
  exchangeId: string
  snippet: string
}

export interface SearchStore {
  query: string
  results: SearchResult[]
  activeIdx: number
  search(q: string, exchanges: ChatExchange[]): void
  nextResult(): void
  prevResult(): void
  clearSearch(): void
}

// ─── Bundle Type ─────────────────────────────────────────────────────────────

export interface TabStores {
  ui: StoreApi<UiStore>
  chat: StoreApi<ChatStore>
  session: StoreApi<TabSessionStore>
  codebase: StoreApi<CodebaseStore>
  graph: StoreApi<GraphStore>
  git: StoreApi<GitStore>
  search: StoreApi<SearchStore>
}

// ─── Individual Store Factories ───────────────────────────────────────────────

function makeUiStore(): StoreApi<UiStore> {
  return createStore<UiStore>(set => ({
    selectedProjectEncoded: null,
    selectedProjectPath: null,
    selectedSessionPath: null,
    selectedNodeId: null,
    selectedExchangeId: null,
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
    toggleActionTypeFilter: type => set(s => {
      const next = new Set(s.actionTypeFilter)
      next.has(type) ? next.delete(type) : next.add(type)
      return { actionTypeFilter: next }
    }),
    clearActionTypeFilter: () => set({ actionTypeFilter: new Set() }),
    setGranularity: g => set({ granularity: g }),
    setContextBreakdownOpen: v => set({ isContextBreakdownOpen: v }),
  }))
}

function makeChatStore(): StoreApi<ChatStore> {
  return createStore<ChatStore>(set => ({
    exchanges: [],
    markers: [],
    isLoading: false,
    setExchanges: (exchanges, markers = []) => set({ exchanges, markers }),
    clear: () => set({ exchanges: [], markers: [] }),
  }))
}

function makeSessionStore(): StoreApi<TabSessionStore> {
  return createStore<TabSessionStore>(() => ({
    sessions: [],
    actions: [],
    isLoadingSession: false,
  }))
}

function makeCodebaseStore(): StoreApi<CodebaseStore> {
  return createStore<CodebaseStore>(set => ({
    nodes: new Map(),
    rootIds: [],
    isLoading: false,
    restoredFromCache: false,

    scanProject: async (projectPath: string, encodedName: string) => {
      set({ isLoading: true, nodes: new Map(), rootIds: [] })
      try {
        const raw = await window.api.scanCodebase(projectPath, encodedName) as CodebaseNode[]
        const nodes = new Map(raw.map(n => [n.id, n]))
        const rootIds = raw.filter(n => n.parent == null).map(n => n.id)
        set({ nodes, rootIds })
      } finally {
        set({ isLoading: false })
      }
    },

    clear: () => set({ nodes: new Map(), rootIds: [], restoredFromCache: false }),
  }))
}

function makeGraphStore(): StoreApi<GraphStore> {
  return createStore<GraphStore>(set => ({
    nodes: [],
    edges: [],
    depEdges: [],
    setNodes: nodes => set({ nodes }),
    setEdges: edges => set({ edges }),
    setGraph: (nodes, edges) => set({ nodes, edges }),
    setDepEdges: depEdges => set({ depEdges }),
  }))
}

function makeGitStore(): StoreApi<GitStore> {
  return createStore<GitStore>((set, get) => ({
    commits: [],
    isLoading: false,
    selectedCommitHash: null,
    commitDiffs: new Map(),
    highlightedFiles: new Set(),

    loadCommits: async (projectPath: string, encodedName: string) => {
      set({ isLoading: true })
      try {
        set({ commits: await window.api.gitLog(projectPath, encodedName) as GitCommit[] })
      } finally {
        set({ isLoading: false })
      }
    },

    selectCommit: async (hash: string | null, projectPath: string) => {
      if (!hash) { set({ selectedCommitHash: null, highlightedFiles: new Set() }); return }
      const { commits, commitDiffs } = get()
      const commit = commits.find(c => c.hash === hash)
      set({ selectedCommitHash: hash, highlightedFiles: new Set(commit?.changedFiles ?? []) })
      if (!commitDiffs.has(hash)) {
        try {
          const diff = await window.api.gitDiff(projectPath, hash) as GitDiff
          const next = new Map(get().commitDiffs)
          next.set(hash, diff)
          set({ commitDiffs: next })
        } catch { /* ignore */ }
      }
    },

    setCommits: commits => set({ commits }),
    clear: () => set({ commits: [], selectedCommitHash: null, commitDiffs: new Map(), highlightedFiles: new Set() }),
  }))
}

function getSnippet(text: string, query: string, maxLen = 80): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, maxLen)
  const start = Math.max(0, idx - 20)
  const end = Math.min(text.length, idx + query.length + 40)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

function makeSearchStore(): StoreApi<SearchStore> {
  return createStore<SearchStore>((set, get) => ({
    query: '',
    results: [],
    activeIdx: 0,

    search(q: string, exchanges: ChatExchange[]) {
      if (!q.trim()) { set({ query: q, results: [], activeIdx: 0 }); return }
      const lower = q.toLowerCase()
      const results: SearchResult[] = []
      for (const ex of exchanges) {
        const userText = ex.userMessage.textContent
        const assistantText = ex.assistantMessage.textContent
        const toolInputs = ex.assistantMessage.toolCalls.map(tc => JSON.stringify(tc.input)).join(' ')
        const combined = `${userText} ${assistantText} ${toolInputs}`
        if (combined.toLowerCase().includes(lower)) {
          let snippet = ''
          if (userText.toLowerCase().includes(lower)) snippet = getSnippet(userText, q)
          else if (assistantText.toLowerCase().includes(lower)) snippet = getSnippet(assistantText, q)
          else snippet = getSnippet(toolInputs, q)
          results.push({ exchangeId: ex.id, snippet })
        }
      }
      set({ query: q, results, activeIdx: 0 })
    },

    nextResult() {
      const { results, activeIdx } = get()
      if (results.length > 0) set({ activeIdx: (activeIdx + 1) % results.length })
    },
    prevResult() {
      const { results, activeIdx } = get()
      if (results.length > 0) set({ activeIdx: (activeIdx - 1 + results.length) % results.length })
    },
    clearSearch() { set({ query: '', results: [], activeIdx: 0 }) },
  }))
}

/** Creates a fresh set of per-tab store instances. */
export function createTabStores(): TabStores {
  return {
    ui: makeUiStore(),
    chat: makeChatStore(),
    session: makeSessionStore(),
    codebase: makeCodebaseStore(),
    graph: makeGraphStore(),
    git: makeGitStore(),
    search: makeSearchStore(),
  }
}

// ─── Module-level map (for non-React access, e.g. useOpenSession) ─────────────

export const tabStoreMap = new Map<string, TabStores>()

// ─── React Context ────────────────────────────────────────────────────────────

interface TabCtx {
  tabId: string
  stores: TabStores
}

const TabStoresContext = createContext<TabCtx | null>(null)

function useTabCtx(): TabCtx {
  const ctx = useContext(TabStoresContext)
  if (!ctx) throw new Error('Tab store hook called outside <TabStoresProvider>')
  return ctx
}

export function TabStoresProvider({ tabId, children }: { tabId: string; children: React.ReactNode }) {
  const stores = useMemo(() => {
    if (!tabStoreMap.has(tabId)) tabStoreMap.set(tabId, createTabStores())
    return tabStoreMap.get(tabId)!
  }, [tabId])

  const ctx = useMemo<TabCtx>(() => ({ tabId, stores }), [tabId, stores])
  return <TabStoresContext.Provider value={ctx}>{children}</TabStoresContext.Provider>
}

/** Returns the current tab's raw store instances (for imperative access in hooks/effects). */
export function useTabStores(): TabStores {
  return useTabCtx().stores
}

/** Returns the current tab's ID (for viewport/scroll save keyed by tab). */
export function useTabId(): string {
  return useTabCtx().tabId
}

// ─── Per-tab React hooks ─────────────────────────────────────────────────────
// Same names as the global store hooks — SessionView components just change import path.

type Selector<S, T> = (s: S) => T

function sel<S, T>(store: StoreApi<S>, selector?: Selector<S, T>): T {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStore(store, (selector ?? (s => s as unknown as T)) as Selector<S, T>)
}

export function useUiStore(): UiStore
export function useUiStore<T>(selector: Selector<UiStore, T>): T
export function useUiStore<T>(selector?: Selector<UiStore, T>): UiStore | T {
  return sel(useTabCtx().stores.ui, selector)
}

export function useChatStore(): ChatStore
export function useChatStore<T>(selector: Selector<ChatStore, T>): T
export function useChatStore<T>(selector?: Selector<ChatStore, T>): ChatStore | T {
  return sel(useTabCtx().stores.chat, selector)
}

export function useSessionStore(): TabSessionStore
export function useSessionStore<T>(selector: Selector<TabSessionStore, T>): T
export function useSessionStore<T>(selector?: Selector<TabSessionStore, T>): TabSessionStore | T {
  return sel(useTabCtx().stores.session, selector)
}

export function useCodebaseStore(): CodebaseStore
export function useCodebaseStore<T>(selector: Selector<CodebaseStore, T>): T
export function useCodebaseStore<T>(selector?: Selector<CodebaseStore, T>): CodebaseStore | T {
  return sel(useTabCtx().stores.codebase, selector)
}

export function useGraphStore(): GraphStore
export function useGraphStore<T>(selector: Selector<GraphStore, T>): T
export function useGraphStore<T>(selector?: Selector<GraphStore, T>): GraphStore | T {
  return sel(useTabCtx().stores.graph, selector)
}

export function useGitStore(): GitStore
export function useGitStore<T>(selector: Selector<GitStore, T>): T
export function useGitStore<T>(selector?: Selector<GitStore, T>): GitStore | T {
  return sel(useTabCtx().stores.git, selector)
}

export function useSearchStore(): SearchStore
export function useSearchStore<T>(selector: Selector<SearchStore, T>): T
export function useSearchStore<T>(selector?: Selector<SearchStore, T>): SearchStore | T {
  return sel(useTabCtx().stores.search, selector)
}
