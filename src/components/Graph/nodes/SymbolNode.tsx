import React from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { NodeData } from '../../../lib/graph-layout'
import { ACTION_BORDER } from '../overlays/ActionBadge'

// Icon characters for each symbol kind
const KIND_ICON: Record<string, string> = {
  class: 'C',
  struct: 'S',
  interface: 'I',
  enum: 'E',
  function: 'f',
  method: 'm',
  type: 'T',
}

const KIND_COLOR: Record<string, string> = {
  class: 'text-violet-400',
  struct: 'text-violet-300',
  interface: 'text-sky-400',
  enum: 'text-amber-400',
  function: 'text-emerald-400',
  method: 'text-emerald-300',
  type: 'text-pink-400',
}

export function SymbolNode({ data }: NodeProps) {
  const d = data as NodeData
  const kind = d.nodeType as string
  const borderColor = d.dominantAction ? ACTION_BORDER[d.dominantAction] ?? '#52525b' : '#3f3f46'
  const iconColor = KIND_COLOR[kind] ?? 'text-zinc-400'
  const icon = KIND_ICON[kind] ?? '·'

  return (
    <div
      className={`flex items-center gap-1.5 px-2 rounded text-[10px] bg-zinc-900 border${d.isPulsing ? ' node-pulse' : ''}`}
      style={{ borderColor, height: 26 }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <span className={`font-bold font-mono text-[9px] w-3 shrink-0 ${iconColor}`}>{icon}</span>
      <span className="truncate text-zinc-300 leading-none">{d.label}</span>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}
