import React, { useEffect, useRef, useMemo } from 'react'
import { Play, Pause, SkipBack, SkipForward, ChevronFirst, ChevronLast } from 'lucide-react'
import { useUiStore, useChatStore } from '../../stores/tab-stores'

const SPARKLINE_H = 20
const SPARKLINE_COLOR = '#a1a1aa'

function computeExchangeCost(usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): number {
  return (
    usage.input * 3 +
    usage.output * 15 +
    (usage.cacheRead ?? 0) * 0.3 +
    (usage.cacheWrite ?? 0) * 3.75
  ) / 1_000_000
}

function TokenSparkline({ exchanges }: { exchanges: { assistantMessage: { tokenUsage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number } } }[] }) {
  // Compute cumulative costs
  const costs = useMemo(() => {
    let cumulative = 0
    return exchanges.map(ex => {
      const usage = ex.assistantMessage.tokenUsage
      if (usage) {
        cumulative += computeExchangeCost(usage)
      }
      return cumulative
    })
  }, [exchanges])

  if (costs.length < 2) return null

  const maxCost = costs[costs.length - 1] ?? 0
  if (maxCost === 0) return null

  const n = costs.length
  const W = 100 // viewBox width percent
  const points = costs
    .map((c, i) => {
      const x = (i / (n - 1)) * W
      const y = SPARKLINE_H - (c / maxCost) * SPARKLINE_H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const totalCost = maxCost.toFixed(4)

  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs text-zinc-600 shrink-0 w-14">~${totalCost}</span>
      <svg
        viewBox={`0 0 ${W} ${SPARKLINE_H}`}
        preserveAspectRatio="none"
        className="flex-1 h-5"
        style={{ height: SPARKLINE_H }}
      >
        <polyline
          points={points}
          fill="none"
          stroke={SPARKLINE_COLOR}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

export function PlaybackControls() {
  const { exchanges } = useChatStore()
  const {
    playbackIndex, isPlaying, playbackSpeed,
    setPlaybackIndex, setPlaying, setPlaybackSpeed, setSelectedExchange,
    stepForward, stepBack,
  } = useUiStore()

  const maxIndex = Math.max(0, exchanges.length - 1)
  const currentDisplay = playbackIndex === null ? exchanges.length : playbackIndex + 1
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-advance timer
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!isPlaying) return
    const ms = 1500 / playbackSpeed
    intervalRef.current = setInterval(() => {
      const { playbackIndex: idx } = useUiStore.getState()
      const nextIdx = idx === null ? 0 : idx + 1
      if (nextIdx > maxIndex) {
        useUiStore.getState().setPlaying(false)
        useUiStore.getState().setPlaybackIndex(maxIndex)
      } else {
        useUiStore.getState().setPlaybackIndex(nextIdx)
      }
    }, ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isPlaying, playbackSpeed, maxIndex])

  if (exchanges.length === 0) return null

  const sliderValue = playbackIndex === null ? exchanges.length : playbackIndex

  return (
    <div className="border-t border-zinc-800 px-3 py-2 bg-zinc-900/50 shrink-0">
      {/* Token sparkline */}
      <TokenSparkline exchanges={exchanges} />

      {/* Scrubber */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs text-zinc-600 tabular-nums w-14 shrink-0">
          {currentDisplay}/{exchanges.length}
        </span>
        <input
          type="range" min={0} max={exchanges.length} value={sliderValue}
          onChange={e => {
            const val = parseInt(e.target.value)
            setPlaybackIndex(val >= exchanges.length ? null : val)
            setPlaying(false)
          }}
          className="flex-1 h-1 accent-zinc-400 cursor-pointer"
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-0.5">
        <button onClick={() => { setPlaybackIndex(0); setPlaying(false) }}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors" title="Reset">
          <ChevronFirst size={14} />
        </button>
        <button onClick={() => stepBack(maxIndex)}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors" title="Step back">
          <SkipBack size={14} />
        </button>
        <button
          onClick={() => setPlaying(!isPlaying)}
          className="p-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors mx-0.5"
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button onClick={() => stepForward(maxIndex)}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors" title="Step forward">
          <SkipForward size={14} />
        </button>
        <button onClick={() => { setPlaybackIndex(maxIndex); setSelectedExchange(exchanges[maxIndex]?.id ?? null); setPlaying(false) }}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors" title="Go to last">
          <ChevronLast size={14} />
        </button>

        {/* Speed */}
        <div className="ml-auto flex items-center gap-0.5">
          {([1, 2, 4] as const).map(s => (
            <button key={s} onClick={() => setPlaybackSpeed(s)}
              className={`px-1.5 py-0.5 rounded text-xs font-mono transition-colors
                ${playbackSpeed === s ? 'bg-zinc-600 text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
