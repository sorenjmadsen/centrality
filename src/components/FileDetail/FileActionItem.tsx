import React, { useState } from 'react'
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react'
import type { ClaudeAction } from '../../types/actions'
import type { ToolCallEntry } from '../../types/session'
import { ActionBadge } from '../Graph/overlays/ActionBadge'
import { DiffViewer } from '../Diff/DiffViewer'
import { useUiStore } from '../../stores/tab-stores'
import { useSettingsStore } from '../../stores/settings-store'

const TOOL_COLORS: Record<string, string> = {
  Read:      'text-blue-400',
  Write:     'text-green-400',
  Edit:      'text-yellow-400',
  MultiEdit: 'text-yellow-400',
  Bash:      'text-purple-400',
  Glob:      'text-zinc-400',
  Grep:      'text-zinc-400',
  LS:        'text-zinc-400',
  Agent:     'text-cyan-400',
}

const RESULT_MAX_LINES = 300

function ResultViewer({ text }: { text: string }) {
  const allLines = text.split('\n')
  const lines = allLines.slice(0, RESULT_MAX_LINES)
  const truncated = allLines.length > RESULT_MAX_LINES
  return (
    <div className="font-mono text-[10px] rounded bg-zinc-950 border border-zinc-800 scrollable overflow-x-auto overflow-y-auto max-h-64 whitespace-pre">
      {lines.map((line, i) => (
        <div key={i} className="px-2 leading-4 text-zinc-400">{line || '\u00A0'}</div>
      ))}
      {truncated && (
        <div className="px-2 py-1 text-zinc-600 italic">...truncated ({allLines.length - RESULT_MAX_LINES} more lines)</div>
      )}
    </div>
  )
}

interface FileActionItemProps {
  action: ClaudeAction
  toolCall?: ToolCallEntry
  exchangeIndex: number
  exchangeId: string
  projectPath: string
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts
  }
}

/** Extract a meaningful line number from an action's input. */
function getLineNumber(action: ClaudeAction): number | undefined {
  const offset = action.input['offset'] as number | undefined
  if (typeof offset === 'number' && offset >= 1) return offset
  const startLine = action.input['start_line'] as number | undefined
  if (typeof startLine === 'number' && startLine >= 1) return startLine
  return undefined
}

export function FileActionItem({ action, toolCall, exchangeIndex, exchangeId, projectPath }: FileActionItemProps) {
  const [open, setOpen] = useState(false)
  const [inlineDiff, setInlineDiff] = useState<string | null>(null)
  const { setSelectedExchange, setPlaybackIndex } = useUiStore()
  const { globalSettings } = useSettingsStore()

  const isEditTool = action.toolName === 'Edit' || action.toolName === 'MultiEdit'
  const oldStr = action.input['old_string'] as string | undefined
  const newStr = action.input['new_string'] as string | undefined
  const toolColor = TOOL_COLORS[action.toolName] ?? 'text-zinc-400'

  function handleExchangeClick(e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedExchange(exchangeId)
    setPlaybackIndex(exchangeIndex)
  }

  async function handleOpenInEditor(e: React.MouseEvent) {
    e.stopPropagation()
    if (!action.filePath) return
    const line = getLineNumber(action)
    const result = await window.api.openInEditor({
      filePath: action.filePath,
      line,
      editor: globalSettings.preferredEditor,
    })
    if (!result.ok) {
      console.warn('Failed to open in editor:', result.error)
    }
  }

  async function handleToggle() {
    setOpen(o => !o)
    if (!open && isEditTool && oldStr !== undefined && newStr !== undefined && inlineDiff === null) {
      const rel = action.filePath ? action.filePath.split('/').slice(-3).join('/') : 'file'
      const diff = await window.api.gitInlineDiff(oldStr, newStr, rel) as string
      setInlineDiff(diff)
    }
  }

  return (
    <div className="border border-zinc-800 rounded text-xs">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-zinc-800/50 transition-colors"
      >
        {open ? <ChevronDown size={11} className="text-zinc-500 shrink-0" /> : <ChevronRight size={11} className="text-zinc-500 shrink-0" />}
        <span className="text-zinc-500 font-mono text-[10px] shrink-0">{formatTime(action.timestamp)}</span>
        <ActionBadge actionType={action.type} />
        <span className={`font-mono font-semibold shrink-0 ${toolColor}`}>{action.toolName}</span>
        <span className="flex-1" />
        <button
          onClick={handleExchangeClick}
          className="text-zinc-600 hover:text-zinc-300 text-[10px] shrink-0 transition-colors"
          title="Jump to exchange in conversation"
        >
          #{exchangeIndex + 1}
        </button>
        {action.filePath && (
          <button
            onClick={handleOpenInEditor}
            className="text-zinc-600 hover:text-zinc-300 shrink-0 transition-colors p-0.5"
            title="Open in editor"
          >
            <ExternalLink size={10} />
          </button>
        )}
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-2 py-1.5 space-y-1">
          {/* Input parameters */}
          <div className="text-zinc-500 font-mono text-[10px]">
            {Object.entries(action.input)
              .filter(([k]) => k !== 'content' && k !== 'new_string' && k !== 'old_string')
              .map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-zinc-600">{k}:</span>
                  <span className="text-zinc-400 break-all">{String(v).slice(0, 200)}</span>
                </div>
              ))}
          </div>

          {/* Inline diff for Edit/MultiEdit */}
          {isEditTool && inlineDiff && (
            <div className="mt-1.5">
              <DiffViewer unified={inlineDiff} />
            </div>
          )}

          {/* Result for other tools */}
          {toolCall?.result !== undefined && !isEditTool && (
            <div className="mt-1">
              <div className="text-zinc-600 font-mono text-[10px] mb-0.5">result:</div>
              <ResultViewer text={toolCall.result} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
