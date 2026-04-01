import React, { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useUiStore, useChatStore } from '../../stores/tab-stores'
import { getContextWindow, computeExchangeCost, ACTION_HEX, TOKEN_HEX } from '../../lib/token-utils'
import type { ChatExchange } from '../../types/chat'
import type { ClaudeAction } from '../../types/actions'

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

interface ExchangeStats {
  totalContext: number  // input + cacheRead + cacheWrite
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
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
  const totalContext = input + cacheRead + cacheWrite

  const actionCounts: Record<string, number> = {}
  for (const action of exchange.actions as ClaudeAction[]) {
    const type = action.type
    actionCounts[type] = (actionCounts[type] ?? 0) + 1
  }
  const totalActions = Object.values(actionCounts).reduce((s, c) => s + c, 0)

  const cost = usage ? computeExchangeCost(usage, model) : 0

  return { totalContext, input, cacheRead, cacheWrite, output, actionCounts, totalActions, cost, model }
}

function TokenBar({ stats, contextWindow }: { stats: ExchangeStats; contextWindow: number }) {
  const totalFill = Math.min(stats.totalContext / contextWindow, 1)
  const outputFill = Math.min(stats.output / contextWindow, 1)

  // Within the context fill, proportion each segment
  const cacheReadPct = stats.totalContext > 0 ? (stats.cacheRead / stats.totalContext) * totalFill * 100 : 0
  const cacheWritePct = stats.totalContext > 0 ? (stats.cacheWrite / stats.totalContext) * totalFill * 100 : 0
  const inputPct = stats.totalContext > 0 ? (stats.input / stats.totalContext) * totalFill * 100 : 0
  const outputPct = outputFill * 100

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 bg-zinc-800 rounded-sm overflow-hidden flex">
        {cacheReadPct > 0 && (
          <div style={{ width: `${cacheReadPct}%`, background: TOKEN_HEX.cacheRead }} />
        )}
        {cacheWritePct > 0 && (
          <div style={{ width: `${cacheWritePct}%`, background: TOKEN_HEX.cacheWrite }} />
        )}
        {inputPct > 0 && (
          <div style={{ width: `${inputPct}%`, background: TOKEN_HEX.input }} />
        )}
        {outputPct > 0 && (
          <div style={{ width: `${outputPct}%`, background: TOKEN_HEX.output, opacity: 0.6 }} />
        )}
      </div>
      <span className="text-xs text-zinc-500 tabular-nums w-24 shrink-0 text-right">
        {fmt(stats.totalContext)} / {fmt(contextWindow)} ({Math.round((stats.totalContext / contextWindow) * 100)}%)
      </span>
    </div>
  )
}

function ActionBar({ stats }: { stats: ExchangeStats }) {
  if (stats.totalActions === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-zinc-800/60 rounded-sm" />
        <span className="text-xs text-zinc-700 w-24 shrink-0 text-right">no actions</span>
      </div>
    )
  }

  const segments = Object.entries(stats.actionCounts).map(([type, count]) => ({
    type,
    pct: (count / stats.totalActions) * 100,
    color: ACTION_HEX[type] ?? '#71717a',
  }))

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-800 rounded-sm overflow-hidden flex">
        {segments.map(seg => (
          <div
            key={seg.type}
            style={{ width: `${seg.pct}%`, background: seg.color }}
            title={`${seg.type}: ${stats.actionCounts[seg.type]}`}
          />
        ))}
      </div>
      <span className="text-xs text-zinc-600 w-24 shrink-0 text-right">
        {stats.totalActions} action{stats.totalActions !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

type ViewMode = 'tokens' | 'actions'

export function ContextBreakdownModal() {
  const { isContextBreakdownOpen, setContextBreakdownOpen } = useUiStore()
  const { exchanges } = useChatStore()
  const [view, setView] = useState<ViewMode>('tokens')

  const allStats = useMemo(() => exchanges.map(computeStats), [exchanges])

  const contextWindow = useMemo(() => {
    const model = exchanges.find(e => e.assistantMessage.model)?.assistantMessage.model
    return getContextWindow(model)
  }, [exchanges])

  const summary = useMemo(() => {
    const withUsage = allStats.filter(s => s.totalContext > 0)
    if (withUsage.length === 0) return null
    const peak = Math.max(...withUsage.map(s => s.totalContext))
    const avg = withUsage.reduce((s, c) => s + c.totalContext, 0) / withUsage.length
    const totalCost = allStats.reduce((s, c) => s + c.cost, 0)
    const model = exchanges.find(e => e.assistantMessage.model)?.assistantMessage.model
    return { peak, avg, totalCost, model }
  }, [allStats, exchanges])

  if (!isContextBreakdownOpen) return null

  const avgPct = summary ? (summary.avg / contextWindow) * 100 : 0

  const tokenLegend = [
    { label: 'Cache read',  color: TOKEN_HEX.cacheRead },
    { label: 'Cache write', color: TOKEN_HEX.cacheWrite },
    { label: 'Input',       color: TOKEN_HEX.input },
    { label: 'Output',      color: TOKEN_HEX.output },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => setContextBreakdownOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[680px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-zinc-200">Context Breakdown</h2>
            <div className="flex items-center gap-3">
              {/* Toggle */}
              <div className="flex items-center rounded-md bg-zinc-800 p-0.5 text-xs">
                {(['tokens', 'actions'] as ViewMode[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-2.5 py-1 rounded transition-colors capitalize ${
                      view === v
                        ? 'bg-zinc-600 text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setContextBreakdownOpen(false)}
                className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          {summary && (
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span>{summary.model ?? 'claude'} · {fmt(contextWindow)} token window</span>
              <span>Peak: {fmt(summary.peak)} ({Math.round((summary.peak / contextWindow) * 100)}%)</span>
              <span>Avg: {fmt(Math.round(summary.avg))} ({Math.round(avgPct)}%)</span>
              <span>~${summary.totalCost.toFixed(3)}</span>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-5 py-2 border-b border-zinc-800/60 shrink-0 flex items-center gap-3 text-xs text-zinc-600 flex-wrap">
          {view === 'tokens'
            ? tokenLegend.map(({ label, color }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
                  {label}
                </span>
              ))
            : Object.entries(ACTION_HEX).map(([type, color]) => (
                <span key={type} className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                  {type}
                </span>
              ))
          }
        </div>

        {/* Exchange list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
          {exchanges.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-8">No exchanges loaded.</p>
          )}
          {exchanges.map((exchange, idx) => {
            const stats = allStats[idx]
            return (
              <div key={exchange.id} className="relative">
                {/* Avg line (tokens view only) */}
                {view === 'tokens' && summary && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-zinc-600/50 pointer-events-none"
                    style={{ left: `calc(${avgPct}% * (100% - 6rem) / 100)` }}
                    title={`avg: ${fmt(Math.round(summary.avg))}`}
                  />
                )}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-zinc-600 tabular-nums w-6 shrink-0 text-right">#{idx + 1}</span>
                  <span className="text-xs text-zinc-600 truncate flex-1">
                    {exchange.userMessage.textContent.slice(0, 60) || '—'}
                  </span>
                  {stats.cost > 0 && (
                    <span className="text-xs text-zinc-700 shrink-0">~${stats.cost.toFixed(3)}</span>
                  )}
                </div>
                <div className="pl-8">
                  {view === 'tokens'
                    ? <TokenBar stats={stats} contextWindow={contextWindow} />
                    : <ActionBar stats={stats} />
                  }
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
