import { useTabsStore } from '../stores/tabs-store'
import { useTabCacheStore } from '../stores/tab-cache-store'
import { tabStoreMap, createTabStores } from '../stores/tab-stores'
import { useDirectoryFilterStore } from '../stores/directory-filter-store'
import type { ClaudeAction } from '../types/actions'
import type { ChatExchange, ChatMarker } from '../types/chat'
import type { CodebaseNode, DirTreeNode } from '../types/codebase'
import type { GitCommit } from '../types/git'

const FILE_COUNT_THRESHOLD = 5000

// Dedup in-flight codebase scans across tabs: if Tab 2 opens the same project
// while Tab 1's scan is still running, Tab 2 awaits the same promise instead
// of launching a redundant second scan that serializes behind the first.
const scanningProjects = new Map<string, Promise<{ nodes: Map<string, CodebaseNode>; rootIds: string[] }>>()

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
      // ── Codebase ─────────────────────────────────────────────────────────
      // 1. Another tab already finished loading this project → reuse directly.
      // 2. Another tab's scan is still in flight → await that promise (no duplicate scan).
      // 3. No scan started yet → kick off a new one and register it for dedup.
      // restoredFromCache is only ever set true by the cache-hit path above (which
      // also pre-populates the graph store). In the non-cached path we never
      // pre-seed the graph, so the layout effect must always run — leave it false.
      let scanPromise = scanningProjects.get(params.projectPath)

      if (!scanPromise) {
        // Check for a tab that already has results
        let sharedNodes: Map<string, CodebaseNode> | null = null
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
          scanPromise = Promise.resolve({ nodes: sharedNodes, rootIds: sharedRootIds })
        } else {
          // Pre-scan: count files and prompt filter dialog for large projects
          tabStores.codebase.getState().clear()
          tabStores.codebase.setState({ isLoading: true })

          try {
            const countResult = await window.api.countDirectoryTree(params.projectPath) as {
              root: DirTreeNode
              totalFiles: number
            }
            const settings = await window.api.getProjectSettings(params.projectEncoded) as {
              excludePatterns: string[]
              gitHistoryDays: number | null
            }

            if (countResult.totalFiles > FILE_COUNT_THRESHOLD) {
              try {
                const newPatterns = await useDirectoryFilterStore.getState().promptFilter({
                  projectPath: params.projectPath,
                  encodedName: params.projectEncoded,
                  dirTree: countResult.root,
                  totalFiles: countResult.totalFiles,
                  currentExcludePatterns: settings.excludePatterns,
                })
                await window.api.setProjectSettings(params.projectEncoded, {
                  ...settings,
                  excludePatterns: newPatterns,
                })
              } catch {
                // User cancelled — don't scan
                tabStores.codebase.setState({ isLoading: false })
                return
              }
            }
          } catch {
            // Count failed — proceed with scan anyway
          }

          // Start a fresh scan and register it so concurrent opens share it
          const p = window.api.scanCodebase(params.projectPath, params.projectEncoded)
            .then((raw: unknown) => {
              const nodes = new Map((raw as CodebaseNode[]).map(n => [n.id, n]))
              const rootIds = (raw as CodebaseNode[]).filter(n => n.parent == null).map(n => n.id)
              return { nodes, rootIds }
            })
            .finally(() => scanningProjects.delete(params.projectPath))
          scanningProjects.set(params.projectPath, p)
          scanPromise = p
        }
      }

      scanPromise.then(({ nodes, rootIds }) => {
        tabStores.codebase.setState({ nodes, rootIds, isLoading: false })
        useTabCacheStore.getState().patch(params.sessionPath, { codebaseNodes: nodes, codebaseRootIds: rootIds })
      })

      // ── Sessions list ─────────────────────────────────────────────────────
      window.api.listSessions(params.projectEncoded).then((raw: unknown) => {
        const sessions = raw as import('../stores/session-store').SessionInfo[]
        useTabCacheStore.getState().patch(params.sessionPath, { sessions })
        tabStores.session.setState({ sessions })
      })

      // ── Git commits ───────────────────────────────────────────────────────
      // Reuse commits from another tab for the same project if available,
      // otherwise load (and share the result when done).
      let sharedCommits: GitCommit[] | null = null
      for (const [tid, stores] of tabStoreMap) {
        if (tid !== newTabId &&
            stores.ui.getState().selectedProjectPath === params.projectPath &&
            stores.git.getState().commits.length > 0) {
          sharedCommits = stores.git.getState().commits
          break
        }
      }

      if (sharedCommits) {
        tabStores.git.setState({ commits: sharedCommits })
        useTabCacheStore.getState().patch(params.sessionPath, { commits: sharedCommits })
      } else {
        tabStores.git.getState().clear()
        tabStores.git.getState().loadCommits(params.projectPath, params.projectEncoded).then(() => {
          const { commits } = tabStores.git.getState()
          useTabCacheStore.getState().patch(params.sessionPath, { commits })
        })
      }

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
