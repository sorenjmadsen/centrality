import React from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { FileText } from 'lucide-react'
import { ActionBadge, ACTION_BORDER } from '../overlays/ActionBadge'
import type { NodeData } from '../../../lib/graph-layout'

export function FileNode({ data, selected }: NodeProps) {
  const d = data as NodeData
  const borderColor = d.isCompare
    ? 'border-orange-600'
    : d.activeAction
      ? ACTION_BORDER[d.activeAction]
      : 'border-zinc-700'

  const counts: Record<string, number> = {}
  for (const a of d.actions) {
    counts[a.type] = (counts[a.type] ?? 0) + 1
  }
  const badgeTypes = Object.keys(counts)

  return (
    <div
      className={`rounded-md border px-2 py-1.5 text-xs bg-zinc-900 text-zinc-300
        transition-colors cursor-default
        ${selected ? 'ring-1 ring-white/30' : ''}
        ${d.isPulsing ? 'node-pulse' : ''}
        ${borderColor}
      `}
    >
      <div className="flex items-center gap-1.5">
        <FileText size={11} className="text-zinc-500 shrink-0" />
        <span className="truncate flex-1">{d.label}</span>
      </div>
      {badgeTypes.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {badgeTypes.map(type => (
            <ActionBadge key={type} actionType={type} count={counts[type]} />
          ))}
        </div>
      )}
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  )
}
