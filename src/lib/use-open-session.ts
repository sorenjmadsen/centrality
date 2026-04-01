import { useTabsStore } from '../stores/tabs-store'
import { useTabCacheStore } from '../stores/tab-cache-store'
import { tabStoreMap, createTabStores } from '../stores/tab-stores'
import type { ClaudeAction } from '../types/actions'
import type { ChatExchange, ChatMarker } from '../types/chat'

export interface OpenSessionParams {
  projectEncoded: string
  projectPath: string
  projectDisplayName: string
  sessionPath: string
  sessionId: string
  mtime: number
}

export function useOpenSession() {
  const { openTab, recordRecentProject } = useTabsStore()

  return async (params: OpenSessionParams) => {
    openTab(params)
    recordRecentProject({
      encodedName: params.projectEncoded,
      projectPath: params.projectPath,
      displayName: params.projectDisplayName,
      lastSessionPath: params.sessionPath,
      lastSessionId: params.sessionId,
      lastSessionMtime: params.mtime,
    })

    const newTabId = useTabsStore.getState().activeTabId!

    // Ensure per-tab stores exist for this tab (may already exist if tab was open)
    if (!tabStoreMap.has(newTabId)) tabStoreMap.set(newTabId, createTabStores())
    const tabStores = tabStoreMap.get(newTabId)!

    // If this tab already has session data loaded, just switching via CSS is sufficient
    if (tabStores.session.getState().actions.length > 0 ||
        tabStores.chat.getState().exchanges.length > 0) {
      return
    }

    const cached = useTabCacheStore.getState().get(params.sessionPath)

    // ── Cache hit: restore everything from memory, zero IPC calls ──────────
    if (cached?.exchanges && cached?.actions && cached?.codebaseNodes) {
      const savedUi = useTabsStore.getState().tabViewState[newTabId] ?? {}

      tabStores.ui.setState({
        selectedProjectEncoded: params.projectEncoded,
        selectedProjectPath: params.projectPath,
        selectedSessionPath: params.sessionPath,
        selectedNodeId: 'selectedNodeId' in savedUi ? savedUi.selectedNodeId ?? null : null,
        selectedExchangeId: 'selectedExchangeId' in savedUi ? savedUi.selectedExchangeId ?? null : null,
        playbackIndex: 'playbackIndex' in savedUi ? savedUi.playbackIndex ?? null : null,
        activeNodeIds: new Set(),
        actionTypeFilter: savedUi.actionTypeFilter ?? new Set(),
        granularity: savedUi.granularity ?? 'files',
      })
      tabStores.session.setState({
        actions: cached.actions,
        sessions: cached.sessions ?? [],
        isLoadingSession: false,
      })
      tabStores.codebase.setState({
        nodes: cached.codebaseNodes,
        rootIds: cached.codebaseRootIds ?? [],
        restoredFromCache: true,
      })
      if (cached.graphNodes?.length) {
        tabStores.graph.setState({
          nodes: cached.graphNodes,
          edges: cached.graphEdges ?? [],
          depEdges: cached.depEdges ?? [],
        })
      }
      tabStores.git.setState({ commits: cached.commits ?? [] })
      tabStores.chat.getState().setExchanges(cached.exchanges, cached.markers ?? [])
      return
    }

    // ── Cache miss: first open, full IPC load ─────────────────────────────
    const prevProjectPath = tabStores.ui.getState().selectedProjectPath
    const sameProject = prevProjectPath === params.projectPath

    tabStores.ui.getState().setSelectedProject(params.projectEncoded, params.projectPath)
    tabStores.chat.getState().clear()
    tabStores.session.setState({ actions: [], isLoadingSession: true })

    if (sameProject) {
      // Reuse codebase, commits, and sessions already in this tab's stores
      const { nodes, rootIds } = tabStores.codebase.getState()
      const { commits } = tabStores.git.getState()
      const { sessions } = tabStores.session.getState()
      useTabCacheStore.getState().patch(params.sessionPath, {
        codebaseNodes: nodes, codebaseRootIds: rootIds, commits, sessions,
      })
    } else {
      // Check if another open tab for the same project already has codebase data
      let sharedNodes: Map<string, import('../types/codebase').CodebaseNode> | null = null
      let sharedRootIds: string[] | null = null
      for (const [tid, stores] of tabStoreMap) {
        if (tid !== newTabId &&
            stores.ui.getState().selectedProjectPath === params.projectPath &&
            stores.codebase.getState().nodes.size > 0) {
          sharedNodes = stores.codebase.getState().nodes
          sharedRootIds = stores.codebase.getState().rootIds
          break
        }
      }

      if (sharedNodes && sharedRootIds) {
        tabStores.codebase.setState({
          nodes: sharedNodes,
          rootIds: sharedRootIds,
          restoredFromCache: true,
        })
        useTabCacheStore.getState().patch(params.sessionPath, {
          codebaseNodes: sharedNodes,
          codebaseRootIds: sharedRootIds,
        })
      } else {
        tabStores.codebase.getState().clear()
        tabStores.codebase.getState().scanProject(params.projectPath, params.projectEncoded).then(() => {
          const { nodes, rootIds } = tabStores.codebase.getState()
          useTabCacheStore.getState().patch(params.sessionPath, { codebaseNodes: nodes, codebaseRootIds: rootIds })
        })
      }

      // listSessions
      window.api.listSessions(params.projectEncoded).then((raw: unknown) => {
        const sessions = raw as import('../stores/session-store').SessionInfo[]
        useTabCacheStore.getState().patch(params.sessionPath, { sessions })
        tabStores.session.setState({ sessions })
      })

      // Git
      tabStores.git.getState().clear()
      tabStores.git.getState().loadCommits(params.projectPath, params.projectEncoded).then(() => {
        const { commits } = tabStores.git.getState()
        useTabCacheStore.getState().patch(params.sessionPath, { commits })
      })
      window.api.gitWatch(params.projectPath)
      window.api.watchCodebase(params.projectPath, params.projectEncoded)
    }

    tabStores.ui.getState().setSelectedSession(params.sessionPath)

    try {
      const result = await window.api.loadSession(params.sessionPath) as {
        exchanges: ChatExchange[]
        actions: ClaudeAction[]
        markers?: ChatMarker[]
      }
      const markers = result.markers ?? []

      useTabCacheStore.getState().patch(params.sessionPath, {
        exchanges: result.exchanges,
        actions: result.actions,
        markers,
      })

      tabStores.chat.getState().setExchanges(result.exchanges, markers)
      tabStores.session.setState({ actions: result.actions })
    } finally {
      tabStores.session.setState({ isLoadingSession: false })
    }
  }
}
