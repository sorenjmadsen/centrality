import React from 'react'
import { BarChart2 } from 'lucide-react'
import { useUiStore } from '../../stores/tab-stores'

export function ContextBreakdownButton() {
  const { selectedSessionPath, setContextBreakdownOpen } = useUiStore()

  if (!selectedSessionPath) return null

  return (
    <button
      onClick={() => setContextBreakdownOpen(true)}
      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
      title="Context breakdown"
    >
      <BarChart2 size={14} />
    </button>
  )
}
