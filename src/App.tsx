import React, { useCallback, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { FilterBar } from './components/TopBar/FilterBar'
import { SearchBar } from './components/TopBar/SearchBar'
import { ExportMenu } from './components/TopBar/ExportMenu'
import { SettingsButton } from './components/TopBar/SettingsButton'
import { ContextBreakdownButton } from './components/TopBar/ContextBreakdownButton'
import { CodebaseGraph } from './components/Graph/CodebaseGraph'
import { ChatPanel } from './components/ChatPanel/ChatPanel'
import { ContextBreakdownModal } from './components/ChatPanel/ContextBreakdownModal'
import { useGraphSync } from './lib/use-graph-sync'
import { GranularityControl } from './components/Controls/GranularityControl'
import { TabBar } from './components/TabBar/TabBar'
import { Dashboard } from './components/Dashboard/Dashboard'
import { SettingsPage } from './components/Settings/SettingsPage'
import { useTabsStore } from './stores/tabs-store'
import { tabStoreMap, TabStoresProvider, useUiStore, useSessionStore, useChatStore } from './stores/tab-stores'
import type { GitCommit } from './types/git'
import type { ChatExchange, ChatMarker } from './types/chat'
import type { ClaudeAction } from './types/actions'
import type { CodebaseNode } from './types/codebase'

const MIN_CHAT_WIDTH = 280
const MAX_CHAT_WIDTH = 800
const DEFAULT_CHAT_WIDTH = 400

function SessionView(): React.ReactElement {
  useGraphSync()

  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH)
  const chatPanelRef = useRef<HTMLDivElement>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const { selectedSessionPath } = useUiStore()
  const { setExchanges } = useChatStore()
  const { sessions: _sessions } = useSessionStore()

  const handleRefresh = useCallback(async () => {
    if (!selectedSessionPath || isRefreshing) return
    setIsRefreshing(true)
    try {
      const result = await window.api.loadSession(selectedSessionPath) as {
        exchanges: ChatExchange[]
        actions: ClaudeAction[]
        markers?: ChatMarker[]
      }
      setExchanges(result.exchanges, result.markers ?? [])
      // Also update session actions in the tab store
      for (const [, stores] of tabStoreMap) {
        if (stores.ui.getState().selectedSessionPath === selectedSessionPath) {
          stores.session.setState({ actions: result.actions })
        }
      }
    } finally {
      setIsRefreshing(false)
    }
  }, [selectedSessionPath, isRefreshing, setExchanges])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX
    const startWidth = chatWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX
      const next = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
      if (chatPanelRef.current) chatPanelRef.current.style.width = `${next}px`
    }

    const onMouseUp = (e: MouseEvent) => {
      const delta = startX - e.clientX
      setChatWidth(Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta)))
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [chatWidth])

  return (
    <>
      {/* Tool bar */}
      <header className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <GranularityControl />
        <div className="h-4 w-px bg-zinc-700 shrink-0" />
        <FilterBar />
        <div className="flex-1" />
        <SearchBar />
        <div className="h-4 w-px bg-zinc-700 shrink-0" />
        {selectedSessionPath && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            title="Refresh session"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        )}
        <div className="h-4 w-px bg-zinc-700 shrink-0" />
        <ContextBreakdownButton />
        <SettingsButton />
        <div className="h-4 w-px bg-zinc-700 shrink-0" />
        <ExportMenu />
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <CodebaseGraph />
        </div>

        {/* Resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-zinc-800 hover:bg-zinc-600 active:bg-zinc-500 transition-colors"
          onMouseDown={onMouseDown}
        />

        {/* Chat panel */}
        <div
          ref={chatPanelRef}
          className="shrink-0 bg-zinc-950 flex flex-col overflow-hidden"
          style={{ width: chatWidth }}
        >
          <div className="px-3 py-1.5 border-b border-zinc-800 text-sm font-semibold text-zinc-500 uppercase tracking-wide shrink-0">
            Conversation
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel />
          </div>
        </div>
        <ContextBreakdownModal />
      </div>
    </>
  )
}

function AppInner(): React.ReactElement {
  const tabs = useTabsStore(s => s.tabs)
  const activeTabId = useTabsStore(s => s.activeTabId)
  // Live git HEAD listener — updates all mounted tabs for the affected project
  React.useEffect(() => {
    return window.api.onGitHeadChanged((data: unknown) => {
      const commits = data as GitCommit[]
      for (const [, stores] of tabStoreMap) {
        stores.git.getState().setCommits(commits)
      }
    })
  }, [])

  // Live session update listener — finds the matching tab and updates it (dirty check)
  React.useEffect(() => {
    return window.api.onSessionUpdate((data: unknown) => {
      const d = data as { filePath: string; exchanges: ChatExchange[]; actions: ClaudeAction[]; markers?: ChatMarker[] }
      for (const [, stores] of tabStoreMap) {
        const storedPath = stores.ui.getState().selectedSessionPath
        // Strip /private prefix to handle macOS symlink: /private/Users/... vs /Users/...
        const normalizedStored = storedPath?.replace(/^\/private/, '') ?? null
        const normalizedIncoming = d.filePath.replace(/^\/private/, '')
        if (normalizedStored === normalizedIncoming) {
          const last = d.exchanges[d.exchanges.length - 1]
          // Skip if the last exchange is clearly mid-stream: assistant has no text,
          // no tool calls, and no actions yet.
          if (last &&
              !last.assistantMessage.textContent.trim() &&
              last.assistantMessage.toolCalls.length === 0 &&
              last.actions.length === 0) {
            continue
          }

          const current = stores.chat.getState().exchanges
          const currentLast = current[current.length - 1]
          const isNew = d.exchanges.length !== current.length ||
            (last && currentLast && (
              last.id !== currentLast.id ||
              // Also update when existing exchange's content grows (response completed)
              last.assistantMessage.textContent.length > currentLast.assistantMessage.textContent.length ||
              last.assistantMessage.toolCalls.length > currentLast.assistantMessage.toolCalls.length
            ))
          if (isNew) {
            const prevLastId = current[current.length - 1]?.id ?? null
            const prevLastIdx = current.length - 1
            const uiState = stores.ui.getState()
            const userIsAtLatest =
              (uiState.selectedExchangeId === null && uiState.playbackIndex === null) ||
              uiState.selectedExchangeId === prevLastId ||
              uiState.playbackIndex === prevLastIdx
            stores.chat.getState().setExchanges(d.exchanges, d.markers ?? [])
            stores.session.setState({ actions: d.actions })
            if (userIsAtLatest && d.exchanges.length > 0) {
              const newLastIdx = d.exchanges.length - 1
              uiState.setSelectedExchange(d.exchanges[newLastIdx].id)
              uiState.setPlaybackIndex(newLastIdx)
            }
          }
        }
      }
    })
  }, [])

  // Live codebase update listener — rescans triggered by file changes in the project directory
  React.useEffect(() => {
    return window.api.onCodebaseUpdate((data: unknown) => {
      const d = data as { projectPath: string; nodes: CodebaseNode[] }
      for (const [, stores] of tabStoreMap) {
        if (stores.ui.getState().selectedProjectPath === d.projectPath) {
          const nodeMap = new Map(d.nodes.map(n => [n.id, n]))
          const rootIds = d.nodes.filter(n => n.parent == null).map(n => n.id)
          // Set restoredFromCache: false so useGraphSync Effect 1 does not skip the rebuild
          stores.codebase.setState({ nodes: nodeMap, rootIds, restoredFromCache: false })
        }
      }
    })
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <TabBar />

      {/* Dashboard — shown when no tab is active */}
      {activeTabId === null && <Dashboard />}

      {/* Settings page — shown when settings tab is active */}
      {activeTabId === '__settings__' && <SettingsPage />}

      {/* All open tabs — CSS-mounted so switching is zero-render */}
      {tabs.map(tab => (
        <div
          key={tab.id}
          className="flex-1 flex flex-col overflow-hidden"
          style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
        >
          <TabStoresProvider tabId={tab.id}>
            <SessionView />
          </TabStoresProvider>
        </div>
      ))}
    </div>
  )
}

export default function App(): React.ReactElement {
  return <AppInner />
}
