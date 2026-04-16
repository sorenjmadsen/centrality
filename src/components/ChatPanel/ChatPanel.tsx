import React, { useEffect, useRef, useMemo } from 'react'
import { Minimize2, RefreshCcw, Terminal } from 'lucide-react'
import { useChatStore, useUiStore, useGitStore, useSearchStore, useSessionStore, useTabId } from '../../stores/tab-stores'
import { useTabsStore } from '../../stores/tabs-store'
import { ChatMessageBubble } from './ChatMessage'
import { TokenUsagePopover } from './TokenUsagePopover'
import { GitCommitMarker } from './GitCommitMarker'
import type { ChatExchange, ChatMarker } from '../../types/chat'
import type { GitCommit } from '../../types/git'

type TimelineItem =
  | { kind: 'exchange'; exchange: ChatExchange; idx: number }
  | { kind: 'commit'; commit: GitCommit }
  | { kind: 'marker'; marker: ChatMarker }

function buildTimeline(
  exchanges: ChatExchange[],
  commits: GitCommit[],
  markers: ChatMarker[]
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...exchanges.map((exchange, idx) => ({
      kind: 'exchange' as const,
      exchange,
      idx,
    })),
    ...commits.map(commit => ({ kind: 'commit' as const, commit })),
    ...markers.map(marker => ({ kind: 'marker' as const, marker })),
  ]

  items.sort((a, b) => {
    let ta: number, tb: number
    if (a.kind === 'exchange') ta = new Date(a.exchange.userMessage.timestamp).getTime()
    else if (a.kind === 'commit') ta = new Date(a.commit.date).getTime()
    else ta = new Date(a.marker.timestamp).getTime()

    if (b.kind === 'exchange') tb = new Date(b.exchange.userMessage.timestamp).getTime()
    else if (b.kind === 'commit') tb = new Date(b.commit.date).getTime()
    else tb = new Date(b.marker.timestamp).getTime()

    return ta - tb
  })

  return items
}


export function ChatPanel() {
  const { exchanges, markers } = useChatStore()
  const { commits } = useGitStore()
  const { selectedExchangeId, playbackIndex, setSelectedExchange, setPlaybackIndex, selectedProjectPath } = useUiStore()
  const { selectCommit } = useGitStore()
  const { results, activeIdx } = useSearchStore()
  const isLoadingSession = useSessionStore(s => s.isLoadingSession)
  const tabId = useTabId()
  const saveTabViewState = useTabsStore(s => s.saveTabViewState)
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const playbackIndexRef = useRef(playbackIndex)
  playbackIndexRef.current = playbackIndex
  const isLiveRef = useRef(false)

  const timeline = useMemo(() => buildTimeline(exchanges, commits, markers), [exchanges, commits, markers])

  const searchResultIds = useMemo(
    () => new Set(results.map(r => r.exchangeId)),
    [results]
  )
  const activeSearchId = results[activeIdx]?.exchangeId ?? null

  // Restore scroll position when data first loads for this tab
  useEffect(() => {
    if (exchanges.length === 0 || !scrollRef.current || !tabId) return
    const saved = useTabsStore.getState().tabViewState[tabId]?.chatScrollTop
    if (saved !== undefined) scrollRef.current.scrollTop = saved
  }, [exchanges.length === 0 ? 0 : 1]) // fire once when data transitions from empty → loaded

  // When viewing the latest exchange and it gets new content (real-time update),
  // scroll to the bottom so growing content stays visible rather than getting cut off.
  useEffect(() => {
    if (exchanges.length === 0) { isLiveRef.current = false; return }
    if (!isLiveRef.current) { isLiveRef.current = true; return } // skip initial load
    const isViewingLatest = playbackIndexRef.current === exchanges.length - 1
    if (isViewingLatest && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [exchanges])

  // Scroll to active item
  const activeId = playbackIndex !== null
    ? exchanges[playbackIndex]?.id
    : activeSearchId ?? selectedExchangeId

  useEffect(() => {
    if (!activeId) return
    const el = itemRefs.current.get(activeId)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  if (isLoadingSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-500 text-sm">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" />
        </div>
        Loading session…
      </div>
    )
  }

  if (exchanges.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        No session loaded
      </div>
    )
  }

  const handleScroll = () => {
    if (scrollRef.current && tabId) {
      saveTabViewState(tabId, { chatScrollTop: scrollRef.current.scrollTop })
    }
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto scrollable" onScroll={handleScroll}>
      <div className="flex flex-col gap-1 p-2">
        {timeline.map((item, i) => {
          if (item.kind === 'commit') {
            return (
              <div key={`commit-${item.commit.hash}`} className="px-1">
                <GitCommitMarker commit={item.commit} />
              </div>
            )
          }

          if (item.kind === 'marker') {
            const { marker } = item
            if (marker.type === 'command') {
              return (
                <div key={marker.id} className="px-1 py-0.5">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800/60 text-xs text-zinc-500">
                    <Terminal size={10} className="shrink-0 text-zinc-600" />
                    <span className="font-mono text-zinc-400">{marker.details}</span>
                    {marker.output && (
                      <span className="text-zinc-600 truncate ml-1">{marker.output}</span>
                    )}
                  </div>
                </div>
              )
            }

            const isCompaction = marker.type === 'compaction'
            return (
              <div
                key={marker.id}
                className="flex items-center gap-2 px-1 py-0.5"
              >
                <div className={`flex-1 h-px ${isCompaction ? 'bg-amber-800/50' : 'bg-sky-800/50'}`} />
                <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border
                  ${isCompaction
                    ? 'text-amber-600 border-amber-800/50 bg-amber-950/30'
                    : 'text-sky-600 border-sky-800/50 bg-sky-950/30'
                  }`}
                >
                  {isCompaction
                    ? <Minimize2 size={10} />
                    : <RefreshCcw size={10} />
                  }
                  <span>
                    {isCompaction ? 'Context compacted' : `Model: ${marker.details ?? 'changed'}`}
                  </span>
                </div>
                <div className={`flex-1 h-px ${isCompaction ? 'bg-amber-800/50' : 'bg-sky-800/50'}`} />
              </div>
            )
          }

          const { exchange, idx } = item
          const isPlaybackCurrent = playbackIndex !== null && idx === playbackIndex
          const isPlaybackFuture = playbackIndex !== null && idx > playbackIndex
          const isSelected = exchange.id === selectedExchangeId
          const isSearchMatch = searchResultIds.has(exchange.id)
          const isActiveSearch = exchange.id === activeSearchId
          const usage = exchange.assistantMessage.tokenUsage

          return (
            <div
              key={exchange.id}
              ref={el => {
                if (el) itemRefs.current.set(exchange.id, el)
                else itemRefs.current.delete(exchange.id)
              }}
              className={`rounded-lg border p-2 cursor-pointer transition-all
                ${isPlaybackFuture ? 'opacity-25' : ''}
                ${isActiveSearch ? 'ring-2 ring-yellow-400/60' : isSearchMatch ? 'ring-1 ring-yellow-600/40' : ''}
                ${isPlaybackCurrent
                  ? 'border-yellow-600/60 bg-yellow-950/20 shadow-sm shadow-yellow-900/20'
                  : isSelected
                    ? 'border-zinc-600 bg-zinc-800/60'
                    : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/50'
                }
              `}
              onClick={() => {
                const isDeselect = exchange.id === selectedExchangeId
                setSelectedExchange(isDeselect ? null : exchange.id)
                setPlaybackIndex(isDeselect ? null : idx)
                // Clear git commit selection when selecting an exchange
                if (!isDeselect) selectCommit(null, selectedProjectPath ?? '')
              }}
            >
              <ChatMessageBubble message={exchange.userMessage} />
              <div className="my-2 border-t border-zinc-800" />
              <ChatMessageBubble message={exchange.assistantMessage} isHighlighted={isPlaybackCurrent || isSelected} />
              {usage && (
                <div className="mt-1.5 flex items-center text-xs">
                  <TokenUsagePopover usage={usage} model={exchange.assistantMessage.model} hasThinking={exchange.assistantMessage.hasThinking} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
