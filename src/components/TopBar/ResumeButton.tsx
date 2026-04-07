import React from 'react'
import { TerminalSquare } from 'lucide-react'
import { useUiStore } from '../../stores/tab-stores'

export function ResumeButton() {
  const { selectedProjectPath, selectedSessionPath } = useUiStore()

  const isRemote = !!selectedProjectPath?.startsWith('ssh:')
  const platformSupported = window.api.platform === 'darwin' || window.api.platform === 'win32'
  const disabled = !selectedProjectPath || !selectedSessionPath || isRemote || !platformSupported

  async function handleClick() {
    if (!selectedProjectPath || !selectedSessionPath) return
    // sessionPath is <...>/<sessionId>.jsonl — extract the sessionId.
    const base = selectedSessionPath.split('/').pop() ?? ''
    const sessionId = base.replace(/\.jsonl$/, '')
    const result = await window.api.resumeSession({ sessionId, projectPath: selectedProjectPath })
    if (!result.ok) {
      console.error('Resume failed:', result.error)
      alert(`Could not resume session: ${result.error}`)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={
        !platformSupported
          ? 'Resume is only supported on macOS and Windows'
          : isRemote
            ? 'Remote resume not yet supported'
            : 'Resume this session in Terminal'
      }
      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100
        disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed
        transition-colors"
    >
      <TerminalSquare className="w-4 h-4" />
    </button>
  )
}
