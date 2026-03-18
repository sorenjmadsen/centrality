import React, { useEffect, useRef, useMemo, useState } from 'react'
import { List, useListRef } from 'react-window'
import type { ListImperativeAPI } from 'react-window'
import { useChatStore } from '../../stores/chat-store'
import { useUiStore } from '../../stores/ui-store'
import { useGitStore } from '../../stores/git-store'
import { useSearchStore } from '../../stores/search-store'
import { ChatMessageBubble } from './ChatMessage'
import { GitCommitMarker } from './GitCommitMarker'
import type { ChatExchange } from '../../types/chat'
import type { GitCommit } from '../../types/git'

type TimelineItem =
  | { kind: 'exchange'; exchange: ChatExchange; idx: number }
  | { kind: 'commit'; commit: GitCommit }

function buildTimeline(exchanges: ChatExchange[], commits: GitCommit[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...exchanges.map((exchange, idx) => ({
      kind: 'exchange' as const,
      exchange,
      idx,
    })),
    ...commits.map(commit => ({ kind: 'commit' as const, commit })),
  ]

  items.sort((a, b) => {
    const ta = a.kind === 'exchange'
      ? new Date(a.exchange.userMessage.timestamp).getTime()
      : new Date(a.commit.date).getTime()
    const tb = b.kind === 'exchange'
      ? new Date(b.exchange.userMessage.timestamp).getTime()
      : new Date(b.commit.date).getTime()
    return ta - tb
  })

  return items
}

const COMMIT_HEIGHT = 44
const EXCHANGE_HEIGHT = 160

function computeCost(exchange: ChatExchange): number {
  const usage = exchange.assistantMessage.tokenUsage
  if (!usage) return 0
  return (usage.input * 3 + usage.output * 15) / 1_000_000
}

interface RowData {
  timeline: TimelineItem[]
  selectedExchangeId: string | null
  playbackIndex: number | null
  searchResultIds: Set<string>
  activeSearchId: string | null
  setSelectedExchange: (id: string | null) => void
}

interface RowComponentProps {
  ariaAttributes: {
    'aria-posinset': number
    'aria-setsize': number
    role: 'listitem'
  }
  index: number
  style: React.CSSProperties
}

function makeRowComponent(rowData: RowData) {
  return function RowComponent({ ariaAttributes, index, style }: RowComponentProps) {
    const { timeline, selectedExchangeId, playbackIndex, searchResultIds, activeSearchId, setSelectedExchange } = rowData
    const item = timeline[index]
    if (!item) return null

    if (item.kind === 'commit') {
      return (
        <div {...ariaAttributes} style={{ ...style, padding: '4px 12px' }}>
          <GitCommitMarker commit={item.commit} />
        </div>
      )
    }

    const { exchange, idx } = item
    const isPlaybackCurrent = playbackIndex !== null && idx === playbackIndex
    const isPlaybackFuture = playbackIndex !== null && idx > playbackIndex
    const isSelected = exchange.id === selectedExchangeId
    const isSearchMatch = searchResultIds.has(exchange.id)
    const isActiveSearch = exchange.id === activeSearchId

    const cost = computeCost(exchange)
    const usage = exchange.assistantMessage.tokenUsage

    return (
      <div {...ariaAttributes} style={{ ...style, padding: '4px 12px' }}>
        <div
          className={`rounded-lg border p-2 cursor-pointer transition-all h-full box-border
            ${isPlaybackFuture ? 'opacity-25 pointer-events-none' : ''}
            ${isActiveSearch ? 'ring-2 ring-yellow-400/60' : isSearchMatch ? 'ring-1 ring-yellow-600/40' : ''}
            ${isPlaybackCurrent
              ? 'border-yellow-600/60 bg-yellow-950/20 shadow-sm shadow-yellow-900/20'
              : isSelected
                ? 'border-zinc-600 bg-zinc-800/60'
                : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50'
            }
          `}
          onClick={() => {
            if (isPlaybackFuture) return
            const newId = exchange.id === selectedExchangeId ? null : exchange.id
            setSelectedExchange(newId)
          }}
        >
          <ChatMessageBubble message={exchange.userMessage} />
          <div className="my-2 border-t border-zinc-800" />
          <ChatMessageBubble message={exchange.assistantMessage} isHighlighted={isPlaybackCurrent || isSelected} />
          {usage && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
              <span>{usage.input.toLocaleString()}↓</span>
              <span>{usage.output.toLocaleString()}↑</span>
              <span className="text-zinc-500">~${cost.toFixed(4)}</span>
            </div>
          )}
        </div>
      </div>
    )
  }
}

export function ChatPanel() {
  const { exchanges } = useChatStore()
  const { commits } = useGitStore()
  const { selectedExchangeId, playbackIndex, setSelectedExchange } = useUiStore()
  const { results, activeIdx } = useSearchStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useListRef()
  const [containerHeight, setContainerHeight] = useState(400)

  const timeline = useMemo(() => buildTimeline(exchanges, commits), [exchanges, commits])

  const searchResultIds = useMemo(
    () => new Set(results.map(r => r.exchangeId)),
    [results]
  )
  const activeSearchId = results[activeIdx]?.exchangeId ?? null

  // Measure container height
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setContainerHeight(el.clientHeight)
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setContainerHeight(entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Find active timeline index to scroll to
  const activeId = playbackIndex !== null
    ? exchanges[playbackIndex]?.id
    : activeSearchId ?? selectedExchangeId

  useEffect(() => {
    if (!activeId || !listRef.current) return
    const idx = timeline.findIndex(
      item => item.kind === 'exchange' && item.exchange.id === activeId
    )
    if (idx >= 0) {
      listRef.current.scrollToRow({ index: idx, align: 'smart' })
    }
  }, [activeId, timeline])

  const rowData: RowData = useMemo(() => ({
    timeline,
    selectedExchangeId,
    playbackIndex,
    searchResultIds,
    activeSearchId,
    setSelectedExchange,
  }), [timeline, selectedExchangeId, playbackIndex, searchResultIds, activeSearchId, setSelectedExchange])

  const RowComponent = useMemo(() => makeRowComponent(rowData), [rowData])

  const rowHeight = (index: number) => {
    const item = timeline[index]
    if (!item) return EXCHANGE_HEIGHT
    return item.kind === 'commit' ? COMMIT_HEIGHT : EXCHANGE_HEIGHT
  }

  if (exchanges.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        No session loaded
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full">
      <List
        listRef={listRef}
        rowComponent={RowComponent}
        rowProps={{}}
        rowCount={timeline.length}
        rowHeight={rowHeight}
        style={{ height: containerHeight }}
        overscanCount={5}
      />
    </div>
  )
}
