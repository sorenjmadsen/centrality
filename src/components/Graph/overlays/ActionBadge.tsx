import React from 'react'
import { Eye, FilePlus, FilePen, Trash2, Terminal, Search, Bot } from 'lucide-react'

const ACTION_CONFIG: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
  read:     { Icon: Eye,      color: 'text-blue-400',   bg: 'bg-blue-900/80' },
  created:  { Icon: FilePlus, color: 'text-green-400',  bg: 'bg-green-900/80' },
  edited:   { Icon: FilePen,  color: 'text-yellow-400', bg: 'bg-yellow-900/80' },
  deleted:  { Icon: Trash2,   color: 'text-red-400',    bg: 'bg-red-900/80' },
  executed: { Icon: Terminal, color: 'text-purple-400', bg: 'bg-purple-900/80' },
  searched: { Icon: Search,   color: 'text-zinc-400',   bg: 'bg-zinc-700/80' },
  spawned:  { Icon: Bot,      color: 'text-cyan-400',   bg: 'bg-cyan-900/80' },
}

export const ACTION_BORDER: Record<string, string> = {
  read:     'border-blue-500',
  created:  'border-green-500',
  edited:   'border-yellow-500',
  deleted:  'border-red-500',
  executed: 'border-purple-500',
  searched: 'border-zinc-500',
  spawned:  'border-cyan-500',
}

interface ActionBadgeProps {
  actionType: string
  count?: number
}

export function ActionBadge({ actionType, count }: ActionBadgeProps) {
  const config = ACTION_CONFIG[actionType]
  if (!config) return null
  const { Icon, color, bg } = config

  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium ${bg} ${color}`}>
      <Icon size={10} />
      {count && count > 1 ? <span>{count}</span> : null}
    </span>
  )
}
