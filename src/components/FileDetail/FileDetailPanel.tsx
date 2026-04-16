import React, { useMemo, useState } from 'react'
import { FileText, ExternalLink, X } from 'lucide-react'
import { useUiStore, useChatStore, useCodebaseStore, useSessionStore } from '../../stores/tab-stores'
import { useSettingsStore } from '../../stores/settings-store'
import { ActionBadge } from '../Graph/overlays/ActionBadge'
import { FileActionItem } from './FileActionItem'
import { RemoteFileWarning } from './RemoteFileWarning'
import type { ToolCallEntry } from '../../types/session'

interface ActionIndex {
  exchangeIndex: number
  exchangeId: string
  toolCall?: ToolCallEntry
}

interface FileDetailPanelProps {
  onClose?: () => void
}

export function FileDetailPanel({ onClose }: FileDetailPanelProps) {
  const [showRemoteWarning, setShowRemoteWarning] = useState(false)
  const selectedNodeId = useUiStore(s => s.selectedNodeId)
  const selectedProjectPath = useUiStore(s => s.selectedProjectPath)
  const selectedSessionPath = useUiStore(s => s.selectedSessionPath)
  const node = useCodebaseStore(s => selectedNodeId ? s.nodes.get(selectedNodeId) : undefined)
  const allActions = useSessionStore(s => s.actions)
  const exchanges = useChatStore(s => s.exchanges)
  const { globalSettings } = useSettingsStore()
  const isRemoteSession = selectedSessionPath?.startsWith('ssh:') ?? false

  // Absolute path for this file, used to match against action.filePath
  const absPath = selectedProjectPath && selectedNodeId
    ? `${selectedProjectPath.replace(/\/$/, '')}/${selectedNodeId}`
    : null

  // Build action-to-exchange index: map action ID → { exchangeIndex, exchangeId, toolCall }
  const actionIndex = useMemo(() => {
    const index = new Map<string, ActionIndex>()
    for (let i = 0; i < exchanges.length; i++) {
      const ex = exchanges[i]
      const toolCalls = ex.assistantMessage.toolCalls
      for (let j = 0; j < ex.actions.length; j++) {
        const action = ex.actions[j]
        // Match action to tool call — actions and toolCalls are built from the same
        // JSONL entries in order, so positional matching works
        const tc = toolCalls[j] as ToolCallEntry | undefined
        index.set(action.id, {
          exchangeIndex: i,
          exchangeId: ex.id,
          toolCall: tc,
        })
      }
    }
    return index
  }, [exchanges])

  // Filter session-level actions for this file (by absolute filePath match)
  const fileActions = useMemo(() => {
    if (!absPath) return []
    return allActions
      .filter(a => a.filePath === absPath)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }, [allActions, absPath])

  // Count actions by type for summary bar
  const actionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const action of fileActions) {
      counts.set(action.type, (counts.get(action.type) ?? 0) + 1)
    }
    return counts
  }, [fileActions])

  async function handleOpenInEditor() {
    if (!absPath) return
    if (isRemoteSession) { setShowRemoteWarning(true); return }
    const result = await window.api.openInEditor({
      filePath: absPath,
      editor: globalSettings.preferredEditor,
    })
    if (!result.ok) {
      console.warn('Failed to open in editor:', result.error)
    }
  }

  if (!selectedNodeId) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm px-4 text-center">
        Select a file node on the graph to see its action history
      </div>
    )
  }

  const fileName = node?.name ?? selectedNodeId.split('/').pop() ?? selectedNodeId
  const filePath = node?.path ?? selectedNodeId

  return (
    <>
    {showRemoteWarning && <RemoteFileWarning onClose={() => setShowRemoteWarning(false)} />}
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-zinc-500 shrink-0" />
          <span className="font-semibold text-sm text-zinc-200 truncate">{fileName}</span>
          <span className="flex-1" />
          <button
            onClick={handleOpenInEditor}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-500"
            title="Open in editor"
          >
            <ExternalLink size={10} />
            <span>Open</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate" title={filePath}>
          {filePath}
        </div>
      </div>

      {/* Action summary bar */}
      {actionCounts.size > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-800 shrink-0 flex-wrap">
          {Array.from(actionCounts.entries()).map(([type, count]) => (
            <ActionBadge key={type} actionType={type} count={count} />
          ))}
          <span className="text-[10px] text-zinc-600 ml-1">
            {fileActions.length} action{fileActions.length !== 1 ? 's' : ''} total
          </span>
        </div>
      )}

      {/* Action timeline */}
      <div className="flex-1 overflow-y-auto scrollable">
        <div className="px-2 py-2 space-y-1">
          {fileActions.length === 0 ? (
            <div className="text-zinc-600 text-xs text-center py-4">
              No actions recorded for this file
            </div>
          ) : (
            fileActions.map((action) => {
              const idx = actionIndex.get(action.id)
              return (
                <FileActionItem
                  key={action.id}
                  action={action}
                  toolCall={idx?.toolCall}
                  exchangeIndex={idx?.exchangeIndex ?? 0}
                  exchangeId={idx?.exchangeId ?? ''}
                  projectPath={selectedProjectPath ?? ''}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
    </>
  )
}
