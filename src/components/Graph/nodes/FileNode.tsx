import React from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { FileText, ArrowUpRight } from 'lucide-react'
import { ActionBadge, ACTION_BORDER } from '../overlays/ActionBadge'
import { useUiStore } from '../../../stores/tab-stores'
import type { NodeData } from '../../../lib/graph-layout'

export function FileNode({ id, data, selected }: NodeProps) {
  const d = data as NodeData
  const { setSelectedNode, setFileDetailOpen } = useUiStore()
  const borderColor = d.activeAction
    ? ACTION_BORDER[d.activeAction]
    : 'border-zinc-700'

  const counts: Record<string, number> = {}
  for (const a of d.actions) {
    counts[a.type] = (counts[a.type] ?? 0) + 1
  }
  const badgeTypes = Object.keys(counts)
  const hasActions = badgeTypes.length > 0

  function handleDetailClick(e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedNode(id)
    setFileDetailOpen(true)
  }

  return (
    <div
      className={`relative overflow-visible rounded-md border px-2 py-1.5 text-base bg-zinc-900 text-zinc-300
        transition-colors cursor-default group
        ${selected ? 'ring-1 ring-white/30' : ''}
        ${borderColor}
      `}
    >
      {d.isPulsing && <div className="pulse-ring" style={{ animationDelay: `${d.pulseDelay}ms` }} />}
      {d.gitPulsing && <div className="pulse-ring-git" />}
      <div className="flex items-center gap-1.5">
        <FileText size={15} className="text-zinc-500 shrink-0" />
        <span className="truncate flex-1">{d.label}</span>
        {hasActions && (
          <button
            onClick={handleDetailClick}
            className="p-1 rounded text-zinc-500 hover:text-accent hover:bg-zinc-800 transition-colors shrink-0"
            title="View file actions"
          >
            <ArrowUpRight size={20} />
          </button>
        )}
      </div>
      {badgeTypes.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {badgeTypes.map(type => (
            <ActionBadge key={type} actionType={type} count={counts[type]} />
          ))}
        </div>
      )}
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  )
}
