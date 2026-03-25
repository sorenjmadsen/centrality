import React, { useState } from 'react'
import {
  FilePen, FilePlus, FileSearch, Terminal, Search, Bot,
  ChevronDown, ChevronRight, Globe,
} from 'lucide-react'
import type { ToolCallEntry } from '../../types/session'
import { ToolCallBlock } from './ToolCallBlock'
import { useUiStore } from '../../stores/tab-stores'

interface ChangeGroup {
  label: string
  icon: React.ReactNode
  color: string
  items: string[]
}

function groupToolCalls(toolCalls: ToolCallEntry[]): ChangeGroup[] {
  const edited = new Set<string>()
  const created = new Set<string>()
  const read = new Set<string>()
  const commands: string[] = []
  const searches: string[] = []
  const agents: string[] = []
  const web: string[] = []

  for (const tc of toolCalls) {
    const fp = tc.input['file_path'] as string | undefined
    const short = fp ? fp.split('/').slice(-2).join('/') : null

    switch (tc.toolName) {
      case 'Edit':
      case 'MultiEdit':
        if (short) edited.add(short)
        break
      case 'Write':
        if (short) created.add(short)
        break
      case 'Read':
        if (short) read.add(short)
        break
      case 'Bash': {
        const cmd = tc.input['command'] as string | undefined
        if (cmd) commands.push(cmd.slice(0, 80).split('\n')[0])
        break
      }
      case 'Grep': {
        const pattern = tc.input['pattern'] as string | undefined
        if (pattern) searches.push(`grep: ${pattern.slice(0, 60)}`)
        break
      }
      case 'Glob': {
        const pattern = tc.input['pattern'] as string | undefined
        if (pattern) searches.push(`glob: ${pattern.slice(0, 60)}`)
        break
      }
      case 'LS': {
        const path = tc.input['path'] as string | undefined
        if (path) searches.push(`ls: ${path.slice(0, 60)}`)
        break
      }
      case 'Agent': {
        const desc = tc.input['description'] as string | undefined
        agents.push(desc?.slice(0, 80) ?? 'sub-agent')
        break
      }
      case 'WebFetch':
      case 'WebSearch': {
        const url = (tc.input['url'] ?? tc.input['query']) as string | undefined
        web.push(url?.slice(0, 80) ?? tc.toolName)
        break
      }
    }
  }

  const groups: ChangeGroup[] = []

  if (edited.size > 0)
    groups.push({
      label: 'Modified',
      icon: <FilePen size={11} />,
      color: 'text-yellow-400',
      items: [...edited],
    })

  if (created.size > 0)
    groups.push({
      label: 'Created',
      icon: <FilePlus size={11} />,
      color: 'text-green-400',
      items: [...created],
    })

  if (read.size > 0)
    groups.push({
      label: 'Read',
      icon: <FileSearch size={11} />,
      color: 'text-blue-400',
      items: [...read],
    })

  if (commands.length > 0)
    groups.push({
      label: 'Ran',
      icon: <Terminal size={11} />,
      color: 'text-purple-400',
      items: commands,
    })

  if (searches.length > 0)
    groups.push({
      label: 'Searched',
      icon: <Search size={11} />,
      color: 'text-zinc-400',
      items: searches,
    })

  if (agents.length > 0)
    groups.push({
      label: 'Agents',
      icon: <Bot size={11} />,
      color: 'text-cyan-400',
      items: agents,
    })

  if (web.length > 0)
    groups.push({
      label: 'Web',
      icon: <Globe size={11} />,
      color: 'text-sky-400',
      items: web,
    })

  return groups
}

interface ExchangeChangeSummaryProps {
  toolCalls: ToolCallEntry[]
}

export function ExchangeChangeSummary({ toolCalls }: ExchangeChangeSummaryProps) {
  const [showRaw, setShowRaw] = useState(false)
  const { setSelectedNode } = useUiStore()

  if (toolCalls.length === 0) return null

  const groups = groupToolCalls(toolCalls)

  if (groups.length === 0) return null

  return (
    <div className="mt-1.5 space-y-1">
      {/* Grouped summary */}
      <div className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 space-y-1">
        {groups.map(group => (
          <div key={group.label} className="flex items-start gap-1.5 text-xs min-w-0">
            <span className={`mt-0.5 shrink-0 ${group.color}`}>{group.icon}</span>
            <span className={`shrink-0 font-medium w-14 ${group.color}`}>{group.label}</span>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-zinc-400 font-mono leading-snug min-w-0 overflow-hidden">
              {group.items.map((item, i) => {
                // For file items (Modified/Created/Read), make them clickable
                const isFile = group.label === 'Modified' || group.label === 'Created' || group.label === 'Read'
                return isFile ? (
                  <span
                    key={i}
                    className="hover:text-zinc-200 cursor-pointer truncate max-w-full"
                    onClick={e => { e.stopPropagation(); setSelectedNode(item) }}
                    title={item}
                  >
                    {item}
                  </span>
                ) : (
                  <span key={i} className="text-zinc-500 break-all">{item}</span>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Raw tool calls toggle */}
      <button
        className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400"
        onClick={e => { e.stopPropagation(); setShowRaw(r => !r) }}
      >
        {showRaw ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
      </button>

      {showRaw && (
        <div className="space-y-0.5">
          {toolCalls.map(tc => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  )
}
