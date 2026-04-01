import React, { useMemo } from 'react'
import { X } from 'lucide-react'
import { useUiStore, useChatStore } from '../../stores/tab-stores'
import { computeExchangeCost } from '../../lib/token-utils'
import type { ChatExchange } from '../../types/chat'
import type { ClaudeAction } from '../../types/actions'

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

interface ExchangeStats {
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
  totalTokens: number
  actionCounts: Record<string, number>
  totalActions: number
  cost: number
  model?: string
}

function computeStats(exchange: ChatExchange): ExchangeStats {
  const usage = exchange.assistantMessage.tokenUsage
  const model = exchange.assistantMessage.model
  const input = usage?.input ?? 0
  const cacheRead = usage?.cacheRead ?? 0
  const cacheWrite = usage?.cacheWrite ?? 0
  const output = usage?.output ?? 0
  const totalTokens = input + cacheRead + cacheWrite + output

  const actionCounts: Record<string, number> = {}
  for (const action of exchange.actions as ClaudeAction[]) {
    actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1
  }
  const totalActions = Object.values(actionCounts).reduce((s, c) => s + c, 0)
  const cost = usage ? computeExchangeCost(usage, model) : 0

  return { input, cacheRead, cacheWrite, output, totalTokens, actionCounts, totalActions, cost, model }
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500 uppercase tracking-wide">{label}</span>
      <span className="text-lg font-semibold text-zinc-100 tabular-nums">{value}</span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  )
}

export function ContextBreakdownModal() {
  const { isContextBreakdownOpen, setContextBreakdownOpen, setSelectedExchange, setPlaybackIndex } = useUiStore()
  const { exchanges } = useChatStore()

  const allStats = useMemo(() => exchanges.map(computeStats), [exchanges])

  const summary = useMemo(() => {
    const totalCost = allStats.reduce((s, c) => s + c.cost, 0)
    const totalInput = allStats.reduce((s, c) => s + c.input, 0)
    const totalCacheRead = allStats.reduce((s, c) => s + c.cacheRead, 0)
    const totalCacheWrite = allStats.reduce((s, c) => s + c.cacheWrite, 0)
    const totalOutput = allStats.reduce((s, c) => s + c.output, 0)
    const totalTokens = totalInput + totalCacheRead + totalCacheWrite + totalOutput
    const totalActions = allStats.reduce((s, c) => s + c.totalActions, 0)
    return { totalCost, totalInput, totalCacheRead, totalCacheWrite, totalOutput, totalTokens, totalActions }
  }, [allStats])

  if (!isContextBreakdownOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => setContextBreakdownOpen(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[680px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Session Breakdown</h2>
            <button
              onClick={() => setContextBreakdownOpen(false)}
              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Summary stat cards */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Total Cost" value={`$${summary.totalCost.toFixed(2)}`} />
            <StatCard
              label="Total Tokens"
              value={fmt(summary.totalTokens)}
              sub={`${fmt(summary.totalCacheRead)} cache read`}
            />
            <StatCard label="Exchanges" value={`${exchanges.length}`} />
            <StatCard label="Actions" value={`${summary.totalActions}`} />
          </div>
        </div>

        {/* Per-exchange rows */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-px">
          {exchanges.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-8">No exchanges loaded.</p>
          )}

          {/* Column headers */}
          {exchanges.length > 0 && (
            <div className="grid grid-cols-[24px_1fr_64px_80px_80px_48px] gap-3 px-2 pb-1 text-xs text-zinc-600 uppercase tracking-wide">
              <span>#</span>
              <span>Message</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Tokens</span>
              <span className="text-right">Cache read</span>
              <span className="text-right">Actions</span>
            </div>
          )}

          {exchanges.map((exchange, idx) => {
            const s = allStats[idx]
            return (
              <div
                key={exchange.id}
                className="grid grid-cols-[24px_1fr_64px_80px_80px_48px] gap-3 px-2 py-2 rounded-md hover:bg-zinc-800/40 transition-colors items-baseline cursor-pointer"
                onClick={() => {
                  setSelectedExchange(exchange.id)
                  setPlaybackIndex(idx)
                  setContextBreakdownOpen(false)
                }}
              >
                <span className="text-xs text-zinc-600 tabular-nums text-right">{idx + 1}</span>
                <span className="text-xs text-zinc-400 truncate">
                  {exchange.userMessage.textContent.slice(0, 60) || '—'}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums text-right">
                  {s.cost > 0 ? `$${s.cost.toFixed(3)}` : '—'}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums text-right">
                  {s.totalTokens > 0 ? fmt(s.totalTokens) : '—'}
                </span>
                <span className="text-xs text-zinc-500 tabular-nums text-right">
                  {s.cacheRead > 0 ? fmt(s.cacheRead) : '—'}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums text-right">
                  {s.totalActions > 0 ? s.totalActions : '—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
