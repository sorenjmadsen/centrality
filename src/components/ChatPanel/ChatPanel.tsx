import React, { useEffect, useRef, useMemo } from 'react'
import { useChatStore, useUiStore, useGitStore, useSearchStore, useTabId } from '../../stores/tab-stores'
import { useTabsStore } from '../../stores/tabs-store'
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

function computeCost(exchange: ChatExchange): number {
  const usage = exchange.assistantMessage.tokenUsage
  if (!usage) return 0
  return (usage.input * 3 + usage.output * 15) / 1_000_000
}

export function ChatPanel() {
  const { exchanges } = useChatStore()
  const { commits } = useGitStore()
  const { selectedExchangeId, playbackIndex, setSelectedExchange, setPlaybackIndex } = useUiStore()
  const { results, activeIdx } = useSearchStore()
  const tabId = useTabId()
  const saveTabViewState = useTabsStore(s => s.saveTabViewState)
  const scrollRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const timeline = useMemo(() => buildTimeline(exchanges, commits), [exchanges, commits])

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

  // Scroll to active item
  const activeId = playbackIndex !== null
    ? exchanges[playbackIndex]?.id
    : activeSearchId ?? selectedExchangeId

  useEffect(() => {
    if (!activeId) return
    const el = itemRefs.current.get(activeId)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

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
    <div ref={scrollRef} className="h-full overflow-y-auto" onScroll={handleScroll}>
      <div className="flex flex-col gap-1 p-2">
        {timeline.map((item, i) => {
          if (item.kind === 'commit') {
            return (
              <div key={`commit-${item.commit.hash}`} className="px-1">
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
          )
        })}
      </div>
    </div>
  )
}
