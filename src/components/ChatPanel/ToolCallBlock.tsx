import React, { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { ToolCallEntry } from '../../types/session'
import { useUiStore } from '../../stores/tab-stores'
import { DiffViewer } from '../Diff/DiffViewer'

const TOOL_COLORS: Record<string, string> = {
  Read:      'text-blue-400 border-blue-800',
  Write:     'text-green-400 border-green-800',
  Edit:      'text-yellow-400 border-yellow-800',
  MultiEdit: 'text-yellow-400 border-yellow-800',
  Bash:      'text-purple-400 border-purple-800',
  Glob:      'text-zinc-400 border-zinc-700',
  Grep:      'text-zinc-400 border-zinc-700',
  LS:        'text-zinc-400 border-zinc-700',
  Agent:     'text-cyan-400 border-cyan-800',
}

interface ToolCallBlockProps {
  toolCall: ToolCallEntry
}

export function ToolCallBlock({ toolCall }: ToolCallBlockProps) {
  const [open, setOpen] = useState(false)
  const [inlineDiff, setInlineDiff] = useState<string | null>(null)
  const { setSelectedNode } = useUiStore()
  const colors = TOOL_COLORS[toolCall.toolName] ?? 'text-zinc-400 border-zinc-700'

  const filePath = toolCall.input['file_path'] as string | undefined
  const isEditTool = toolCall.toolName === 'Edit' || toolCall.toolName === 'MultiEdit'
  const oldStr = toolCall.input['old_string'] as string | undefined
  const newStr = toolCall.input['new_string'] as string | undefined

  function handleFileClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (filePath) setSelectedNode(filePath)
  }

  async function handleToggle() {
    setOpen(o => !o)
    // Generate inline diff on first open for Edit/MultiEdit
    if (!open && isEditTool && oldStr !== undefined && newStr !== undefined && inlineDiff === null) {
      const rel = filePath ? filePath.split('/').slice(-3).join('/') : 'file'
      const diff = await window.api.gitInlineDiff(oldStr, newStr, rel) as string
      setInlineDiff(diff)
    }
  }

  return (
    <div className={`rounded border text-xs my-1 ${colors.split(' ')[1]}`}>
      <button
        onClick={e => { e.stopPropagation(); handleToggle() }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left ${colors.split(' ')[0]}`}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="font-mono font-semibold">{toolCall.toolName}</span>
        {filePath && (
          <span
            className="text-zinc-500 truncate hover:text-zinc-300 cursor-pointer"
            onClick={handleFileClick}
            title={filePath}
          >
            {filePath.split('/').slice(-2).join('/')}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-2 py-1.5 space-y-1">
          <div className="text-zinc-500 font-mono text-[10px]">
            {Object.entries(toolCall.input)
              .filter(([k]) => k !== 'content' && k !== 'new_string' && k !== 'old_string')
              .map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-zinc-600">{k}:</span>
                  <span className="text-zinc-400 break-all">{String(v).slice(0, 200)}</span>
                </div>
              ))}
          </div>
          {isEditTool && inlineDiff && (
            <div className="mt-1.5">
              <DiffViewer unified={inlineDiff} />
            </div>
          )}
          {toolCall.result !== undefined && (
            <div className="border-t border-zinc-800 pt-1 text-zinc-500 font-mono text-[10px] max-h-32 overflow-y-auto scrollable">
              <span className="text-zinc-600">result: </span>
              {toolCall.result.slice(0, 500)}{toolCall.result.length > 500 ? '…' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
