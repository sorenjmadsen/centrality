import React from 'react'
import { SessionPicker } from './components/TopBar/SessionPicker'
import { FilterBar } from './components/TopBar/FilterBar'
import { SearchBar } from './components/TopBar/SearchBar'
import { ExportMenu } from './components/TopBar/ExportMenu'
import { CodebaseGraph } from './components/Graph/CodebaseGraph'
import { ChatPanel } from './components/ChatPanel/ChatPanel'
import { PlaybackControls } from './components/ChatPanel/PlaybackControls'
import { useGraphSync } from './lib/use-graph-sync'
import { GranularityControl } from './components/Controls/GranularityControl'

function AppInner(): React.ReactElement {
  useGraphSync()

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-3 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <span className="text-xs font-semibold text-zinc-400 shrink-0">Claude Vertex</span>
        <SessionPicker />
        <div className="h-4 w-px bg-zinc-700 shrink-0" />
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

        {/* Chat panel */}
        <div className="w-[400px] shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-zinc-800 text-[11px] font-semibold text-zinc-500 uppercase tracking-wide shrink-0">
            Conversation
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel />
          </div>
          <PlaybackControls />
        </div>
      </div>
    </div>
  )
}

export default function App(): React.ReactElement {
  return <AppInner />
}
