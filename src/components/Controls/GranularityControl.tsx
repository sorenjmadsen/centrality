import React from 'react'
import { useUiStore } from '../../stores/ui-store'

export function GranularityControl() {
  const { granularity, setGranularity } = useUiStore()

  return (
    <div className="flex items-center gap-1 bg-zinc-800 rounded p-0.5">
      {(['files', 'symbols'] as const).map(g => (
        <button
          key={g}
          onClick={() => setGranularity(g)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            granularity === g
              ? 'bg-zinc-600 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {g === 'files' ? 'Files' : 'Symbols'}
        </button>
      ))}
    </div>
  )
}
