import React, { useMemo, useState, useEffect } from 'react'
import { X, Info } from 'lucide-react'
import { useUiStore, useChatStore } from '../../stores/tab-stores'
import { computeExchangeCost, tokensFromChars, ATTRIBUTION_HEX, ATTRIBUTION_LABELS } from '../../lib/token-utils'
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

// ─── Attribution types ────────────────────────────────────────────────────────

interface ClaudeMdFile {
  scope: string  // 'global' | 'project' | 'directory'
  path: string
  chars: number
}

type AttributionKey = keyof typeof ATTRIBUTION_HEX

interface ToolBreakdown {
  reads:   number
  writes:  number
  bash:    number
  search:  number
  agents:  number
}

const TOOL_BREAKDOWN_META: { key: keyof ToolBreakdown; label: string; color: string }[] = [
  { key: 'reads',  label: 'Read',   color: '#60a5fa' }, // blue-400
  { key: 'writes', label: 'Write',  color: '#facc15' }, // yellow-400
  { key: 'bash',   label: 'Bash',   color: '#c084fc' }, // purple-400
  { key: 'search', label: 'Search', color: '#a1a1aa' }, // zinc-400
  { key: 'agents', label: 'Agent',  color: '#22d3ee' }, // cyan-400
]

function toolTokens(tc: { toolName: string; input: Record<string, unknown>; result?: string }): number {
  return tokensFromChars(JSON.stringify(tc.input).length) + tokensFromChars(tc.result?.length ?? 0)
}

function classifyTool(toolName: string): keyof ToolBreakdown {
  if (toolName === 'Read') return 'reads'
  if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) return 'writes'
  if (toolName === 'Bash') return 'bash'
  if (['Glob', 'Grep', 'LS'].includes(toolName)) return 'search'
  if (toolName === 'Agent') return 'agents'
  return 'bash' // catch-all for WebFetch, WebSearch, Todo*, Notebook*, etc.
}

interface ExchangeAttribution {
  userText: number
  toolIO: number
  toolBreakdown: ToolBreakdown
  thinking: number
  claudeMd: number
  skills: number
  atMentions: number
  teamOverhead: number
  atMentionCount: number
  inputTotal: number
  outputTotal: number
}

function computeAttribution(
  exchange: ChatExchange,
  claudeMdTokens: number,
  prevInputTotal: number,
): ExchangeAttribution {
  // Use context size (final API call) for the attribution breakdown, not the
  // total-billed sum. This answers "what was in the context at the end?"
  const ctx = exchange.assistantMessage.contextUsage ?? exchange.assistantMessage.tokenUsage
  const inputTotal = (ctx?.input ?? 0) + (ctx?.cacheRead ?? 0) + (ctx?.cacheWrite ?? 0)
  const outputTotal = ctx?.output ?? 0

  const userText = tokensFromChars(exchange.userMessage.textContent.length)

  const toolBreakdown: ToolBreakdown = { reads: 0, writes: 0, bash: 0, search: 0, agents: 0 }
  for (const tc of exchange.assistantMessage.toolCalls) {
    toolBreakdown[classifyTool(tc.toolName)] += toolTokens(tc)
  }
  const toolIO = Object.values(toolBreakdown).reduce((s, n) => s + n, 0)

  const thinking = tokensFromChars(exchange.assistantMessage.thinkingChars ?? 0)

  const atMatches = exchange.userMessage.textContent.match(/@[\w./\\-]+/g) ?? []
  const atMentionCount = atMatches.length
  const skills = 0
  const atMentions = 0

  // History = the previous exchange's full context (it's entirely carried forward).
  // For the first exchange there is no prior context, so fall back to residual.
  const teamOverhead = prevInputTotal > 0
    ? prevInputTotal
    : Math.max(0, inputTotal - userText - toolIO - claudeMdTokens)

  return {
    userText,
    toolIO,
    toolBreakdown,
    thinking,
    claudeMd: claudeMdTokens,
    skills,
    atMentions,
    teamOverhead,
    atMentionCount,
    inputTotal,
    outputTotal,
  }
}

// ─── Attribution stacked bar ──────────────────────────────────────────────────

const INPUT_ATTR_KEYS: AttributionKey[] = ['claudeMd', 'toolIO', 'userText']

function AttributionBar({ attr }: { attr: ExchangeAttribution }) {
  const segments = INPUT_ATTR_KEYS.map(k => ({
    key: k,
    tokens: attr[k as keyof ExchangeAttribution] as number,
    color: ATTRIBUTION_HEX[k],
    label: ATTRIBUTION_LABELS[k],
  }))
  // Use full context as the denominator so segments show their real share
  const contextTotal = attr.inputTotal
  if (contextTotal === 0) return <div className="h-2.5 rounded bg-zinc-800 w-full" />

  return (
    <div className="h-2.5 rounded overflow-hidden w-full bg-zinc-800 flex">
      {segments.map(seg => {
        const pct = (seg.tokens / contextTotal) * 100
        if (pct < 0.3) return null
        return (
          <div
            key={seg.key}
            title={`${seg.label}: ~${fmt(seg.tokens)} tokens (${pct.toFixed(1)}% of context)`}
            style={{ width: `${pct}%`, background: seg.color, flexShrink: 0 }}
          />
        )
      })}
    </div>
  )
}

function Cell({ tokens, color }: { tokens: number; color: string }) {
  return (
    <span className="text-xs tabular-nums text-right" style={{ color: tokens > 0 ? color : undefined }}>
      {tokens > 0 ? fmt(tokens) : <span className="text-zinc-800">—</span>}
    </span>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type ModalTab = 'totals' | 'attribution'

export function ContextBreakdownModal() {
  const { isContextBreakdownOpen, setContextBreakdownOpen, setSelectedExchange, setPlaybackIndex, selectedProjectPath } = useUiStore()
  const { exchanges } = useChatStore()

  const [activeTab, setActiveTab] = useState<ModalTab>('totals')
  const [claudeMdFiles, setClaudeMdFiles] = useState<ClaudeMdFile[]>([])

  // Load CLAUDE.md file sizes when attribution tab is opened
  useEffect(() => {
    if (!isContextBreakdownOpen || !selectedProjectPath) return
    window.api.readClaudeMd(selectedProjectPath)
      .then(raw => setClaudeMdFiles(raw as ClaudeMdFile[]))
      .catch(() => setClaudeMdFiles([]))
  }, [isContextBreakdownOpen, selectedProjectPath])

  const claudeMdTotalChars = claudeMdFiles.reduce((s, f) => s + f.chars, 0)
  const claudeMdTokens = tokensFromChars(claudeMdTotalChars)

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

  const allAttribution = useMemo(() => {
    const result: ExchangeAttribution[] = []
    for (let i = 0; i < exchanges.length; i++) {
      const prevInputTotal = i > 0 ? result[i - 1].inputTotal : 0
      result.push(computeAttribution(exchanges[i], claudeMdTokens, prevInputTotal))
    }
    return result
  }, [exchanges, claudeMdTokens])

  // Summary cards are derived from the final exchange's context — so all numbers
  // share the same denominator and add up to the peak context size.
  const peakAttr = allAttribution.at(-1)

  if (!isContextBreakdownOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => setContextBreakdownOpen(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[1020px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-200">Session Breakdown</h2>
            <button
              onClick={() => setContextBreakdownOpen(false)}
              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-0.5 mb-3">
            {(['totals', 'attribution'] as ModalTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'px-3 py-1 text-xs rounded transition-colors capitalize',
                  activeTab === tab
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300',
                ].join(' ')}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Totals tab summary cards */}
          {activeTab === 'totals' && (
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
          )}
        </div>

        {/* ── Totals tab ── */}
        {activeTab === 'totals' && (
          <div className="overflow-y-auto flex-1 px-5 py-3 space-y-px">
            {exchanges.length === 0 && (
              <p className="text-zinc-600 text-sm text-center py-8">No exchanges loaded.</p>
            )}

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
        )}

        {/* ── Attribution tab ── */}
        {activeTab === 'attribution' && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Summary cards — final exchange's context breakdown, all numbers share one denominator */}
            <div className="px-5 py-3 border-b border-zinc-800 shrink-0">
              {peakAttr && (
                <>
                  {/* Row 1: System + User text */}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {(['claudeMd', 'userText'] as const).map(k => {
                      const tokens = peakAttr[k as keyof ExchangeAttribution] as number
                      const pct = peakAttr.inputTotal > 0 ? ((tokens / peakAttr.inputTotal) * 100).toFixed(0) : '—'
                      return (
                        <div key={k} className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2.5 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ATTRIBUTION_HEX[k] }} />
                            <span className="text-xs text-zinc-500 uppercase tracking-wide">{ATTRIBUTION_LABELS[k]}</span>
                          </div>
                          <span className="text-base font-semibold text-zinc-100 tabular-nums">{fmt(tokens)}</span>
                          <span className="text-xs text-zinc-600">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                  {/* Row 2: tool breakdown — matches table columns */}
                  <div className="grid grid-cols-5 gap-2 mb-2">
                    {TOOL_BREAKDOWN_META.map(m => {
                      const tokens = peakAttr.toolBreakdown[m.key]
                      const pct = peakAttr.inputTotal > 0 ? ((tokens / peakAttr.inputTotal) * 100).toFixed(0) : '—'
                      return (
                        <div key={m.key} className="bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2.5 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                            <span className="text-xs text-zinc-500 uppercase tracking-wide">{m.label}</span>
                          </div>
                          <span className="text-base font-semibold text-zinc-100 tabular-nums">{fmt(tokens)}</span>
                          <span className="text-xs text-zinc-600">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-600">
                    <span>
                      peak context{' '}
                      <span className="text-zinc-400 font-medium tabular-nums">{fmt(peakAttr.inputTotal)}</span>
                      {' '}tokens · final exchange
                    </span>
                    <div className="flex items-center gap-1">
                      <Info size={10} />
                      <span>estimated</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Per-turn rows */}
            <div className="overflow-y-auto flex-1 px-5 py-3">
              {exchanges.length === 0 && (
                <p className="text-zinc-600 text-sm text-center py-8">No exchanges loaded.</p>
              )}

              {exchanges.length > 0 && (
                <div className="grid grid-cols-[20px_1fr_64px_60px_60px_60px_60px_60px_64px_68px] gap-x-4 px-2 pb-1 text-xs text-zinc-600 uppercase tracking-wide">
                  <span>#</span>
                  <span>Message</span>
                  <div className="flex items-center justify-end gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ATTRIBUTION_HEX.claudeMd }} />
                    <span>{ATTRIBUTION_LABELS.claudeMd}</span>
                  </div>
                  {TOOL_BREAKDOWN_META.map(m => (
                    <div key={m.key} className="flex items-center justify-end gap-1">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.color }} />
                      <span>{m.label}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-end gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ATTRIBUTION_HEX.userText }} />
                    <span>User</span>
                  </div>
                  <span className="text-right">Context</span>
                </div>
              )}

              {exchanges.map((exchange, idx) => {
                const attr = allAttribution[idx]
                return (
                  <div
                    key={exchange.id}
                    className="grid grid-cols-[20px_1fr_64px_60px_60px_60px_60px_60px_64px_68px] gap-x-4 px-2 py-1.5 rounded-md hover:bg-zinc-800/40 transition-colors items-baseline cursor-pointer"
                    onClick={() => {
                      setSelectedExchange(exchange.id)
                      setPlaybackIndex(idx)
                      setContextBreakdownOpen(false)
                    }}
                  >
                    <span className="text-xs text-zinc-600 tabular-nums text-right">{idx + 1}</span>
                    <span className="text-xs text-zinc-400 truncate">
                      {exchange.userMessage.textContent.slice(0, 50) || '—'}
                    </span>
                    {/* CLAUDE.md */}
                    <Cell tokens={attr.claudeMd} color={ATTRIBUTION_HEX.claudeMd} />
                    {/* Tool breakdown */}
                    {TOOL_BREAKDOWN_META.map(m => (
                      <Cell key={m.key} tokens={attr.toolBreakdown[m.key]} color={m.color} />
                    ))}
                    {/* User text */}
                    <Cell tokens={attr.userText} color={ATTRIBUTION_HEX.userText} />
                    {/* Context total */}
                    <span className="text-xs text-zinc-400 tabular-nums text-right">
                      {attr.inputTotal > 0 ? fmt(attr.inputTotal) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
