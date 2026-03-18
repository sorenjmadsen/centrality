import React, { useEffect } from 'react'
import { useSessionStore } from '../../stores/session-store'
import { useChatStore } from '../../stores/chat-store'
import { useCodebaseStore } from '../../stores/codebase-store'
import { useUiStore } from '../../stores/ui-store'
import { useGitStore } from '../../stores/git-store'
import { useCompareStore } from '../../stores/compare-store'
import type { ChatExchange } from '../../types/chat'
import type { ClaudeAction } from '../../types/actions'
import type { GitCommit } from '../../types/git'

export function SessionPicker() {
  const { projects, sessions, loadProjects, loadSessions, isLoadingSession, loadSession } = useSessionStore()
  const { setExchanges } = useChatStore()
  const { scanProject } = useCodebaseStore()
  const { loadCommits, setCommits, clear: clearGit } = useGitStore()
  const compareStore = useCompareStore()
  const {
    selectedProjectEncoded, selectedProjectPath,
    selectedSessionPath,
    setSelectedProject, setSelectedSession,
  } = useUiStore()

  useEffect(() => { loadProjects() }, [])

  useEffect(() => {
    if (!selectedProjectEncoded || !selectedProjectPath) return
    loadSessions(selectedProjectEncoded)
    scanProject(selectedProjectPath)
    clearGit()
    loadCommits(selectedProjectPath)
    window.api.gitWatch(selectedProjectPath)
    compareStore.clear()
  }, [selectedProjectEncoded, selectedProjectPath])

  useEffect(() => {
    if (!selectedSessionPath) return
    // Load actions into session-store
    loadSession(selectedSessionPath)
    // Load exchanges into chat-store
    window.api.loadSession(selectedSessionPath).then((result: unknown) => {
      const r = result as { exchanges: ChatExchange[]; actions: ClaudeAction[] }
      setExchanges(r.exchanges)
    })
  }, [selectedSessionPath])

  // Listen for live git HEAD changes
  useEffect(() => {
    const cleanup = window.api.onGitHeadChanged((data: unknown) => {
      setCommits(data as GitCommit[])
    })
    return cleanup
  }, [])

  // Listen for live session updates from chokidar watcher
  useEffect(() => {
    const cleanup = window.api.onSessionUpdate((data: unknown) => {
      const d = data as { filePath: string; exchanges: ChatExchange[]; actions: ClaudeAction[] }
      if (d.filePath === selectedSessionPath) {
        setExchanges(d.exchanges)
        loadSession(selectedSessionPath!)
      }
    })
    return cleanup
  }, [selectedSessionPath])

  return (
    <div className="flex items-center gap-2">
      <select
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200
          focus:outline-none focus:border-zinc-500 max-w-[220px]"
        value={selectedProjectEncoded ?? ''}
        onChange={e => {
          const encoded = e.target.value
          if (!encoded) return
          const project = projects.find(p => p.encodedName === encoded)
          if (project) setSelectedProject(encoded, project.projectPath)
        }}
      >
        <option value="">Select project…</option>
        {projects.map(p => (
          <option key={p.encodedName} value={p.encodedName}>
            {p.displayName.split('/').slice(-2).join('/')}
          </option>
        ))}
      </select>

      <select
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200
          focus:outline-none focus:border-zinc-500 max-w-[200px]"
        value={selectedSessionPath ?? ''}
        onChange={e => { if (e.target.value) setSelectedSession(e.target.value) }}
        disabled={sessions.length === 0}
      >
        <option value="">Select session…</option>
        {sessions.map(s => (
          <option key={s.sessionId} value={s.filePath}>
            {s.sessionId.slice(0, 8)}… {new Date(s.mtime).toLocaleDateString()}
          </option>
        ))}
      </select>

      {selectedProjectPath && sessions.length > 0 && (
        <>
          <span className="text-[10px] text-zinc-600 shrink-0">Compare:</span>
          <select
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200
              focus:outline-none focus:border-zinc-500 max-w-[160px]"
            value={compareStore.compareSessionPath ?? ''}
            onChange={e => {
              const val = e.target.value
              compareStore.setCompareSession(val || null, selectedProjectPath)
            }}
          >
            <option value="">None</option>
            {sessions
              .filter(s => s.filePath !== selectedSessionPath)
              .map(s => (
                <option key={s.sessionId} value={s.filePath}>
                  {s.sessionId.slice(0, 8)}… {new Date(s.mtime).toLocaleDateString()}
                </option>
              ))}
          </select>
        </>
      )}

      {isLoadingSession && (
        <span className="text-xs text-zinc-500 animate-pulse">Loading…</span>
      )}
    </div>
  )
}
