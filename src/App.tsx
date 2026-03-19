import React, { useCallback, useRef, useState } from 'react'
import { FilterBar } from './components/TopBar/FilterBar'
import { SearchBar } from './components/TopBar/SearchBar'
import { ExportMenu } from './components/TopBar/ExportMenu'
import { CodebaseGraph } from './components/Graph/CodebaseGraph'
import { ChatPanel } from './components/ChatPanel/ChatPanel'
import { PlaybackControls } from './components/ChatPanel/PlaybackControls'
import { useGraphSync } from './lib/use-graph-sync'
import { GranularityControl } from './components/Controls/GranularityControl'
import { TabBar } from './components/TabBar/TabBar'
import { Dashboard } from './components/Dashboard/Dashboard'
import { useTabsStore } from './stores/tabs-store'
import { tabStoreMap, TabStoresProvider, useUiStore, useSessionStore, useCompareStore } from './stores/tab-stores'
import type { GitCommit } from './types/git'
import type { ChatExchange } from './types/chat'
import type { ClaudeAction } from './types/actions'

const MIN_CHAT_WIDTH = 280
const MAX_CHAT_WIDTH = 800
const DEFAULT_CHAT_WIDTH = 400

function SessionView(): React.ReactElement {
  useGraphSync()

  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH)
  const chatPanelRef = useRef<HTMLDivElement>(null)

  const { selectedProjectPath, selectedSessionPath } = useUiStore()
  const { sessions } = useSessionStore()
  const compareStore = useCompareStore()

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
        {/* Compare session picker */}
        {selectedProjectPath && sessions.length > 0 && (
          <>
            <span className="text-sm text-zinc-600 shrink-0">Compare:</span>
            <select
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200
                focus:outline-none focus:border-zinc-500 max-w-[160px]"
              value={compareStore.compareSessionPath ?? ''}
              onChange={e => {
                compareStore.setCompareSession(e.target.value || null, selectedProjectPath)
              }}
            >
              <option value="">None</option>
              {sessions
                .filter(s => s.filePath !== selectedSessionPath)
                .map(s => (
                  <option key={s.sessionId} value={s.filePath}>
                    {s.sessionId.slice(0, 8)}… {new Date(s.mtime).toLocaleDateString()}
                  </option>
                ))}
            </select>
            <div className="h-4 w-px bg-zinc-700 shrink-0" />
          </>
        )}

        <GranularityControl />
        <div className="h-4 w-px bg-zinc-700 shrink-0" />
        <FilterBar />
        <div className="flex-1" />
        <SearchBar />
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
          <PlaybackControls />
        </div>
      </div>
    </>
  )
}

function AppInner(): React.ReactElement {
  const { tabs, activeTabId } = useTabsStore()

  // Live git HEAD listener — updates all mounted tabs for the affected project
  React.useEffect(() => {
    return window.api.onGitHeadChanged((data: unknown) => {
      const commits = data as GitCommit[]
      for (const [, stores] of tabStoreMap) {
        stores.git.getState().setCommits(commits)
      }
    })
  }, [])

  // Live session update listener — finds the matching tab and updates it
  React.useEffect(() => {
    return window.api.onSessionUpdate((data: unknown) => {
      const d = data as { filePath: string; exchanges: ChatExchange[]; actions: ClaudeAction[] }
      for (const [, stores] of tabStoreMap) {
        if (stores.ui.getState().selectedSessionPath === d.filePath) {
          stores.chat.getState().setExchanges(d.exchanges)
          stores.session.setState({ actions: d.actions })
        }
      }
    })
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <TabBar />

      {/* Dashboard — shown when no tab is active */}
      {activeTabId === null && <Dashboard />}

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
