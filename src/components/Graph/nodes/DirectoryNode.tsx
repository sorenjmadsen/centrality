import React from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Folder } from 'lucide-react'
import type { NodeData } from '../../../lib/graph-layout'
import { ACTION_BORDER } from '../overlays/ActionBadge'

export function DirectoryNode({ data, selected }: NodeProps) {
  const d = data as NodeData
  const borderColor = d.isCompare
    ? 'border-orange-600'
    : d.activeAction
      ? ACTION_BORDER[d.activeAction]
      : 'border-zinc-700'

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-base font-medium
        bg-zinc-900/80 text-zinc-400 transition-colors cursor-default
        ${selected ? 'ring-1 ring-zinc-400' : ''}
        ${d.isPulsing ? 'node-pulse' : ''}
        ${borderColor}
      `}
    >
      <Folder size={16} className="text-zinc-500 shrink-0" />
      <span className="truncate">{d.label}</span>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  )
}
