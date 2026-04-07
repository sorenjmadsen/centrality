import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Clock, FolderOpen, Settings, TerminalSquare } from 'lucide-react'
import centralityLogo from '../../assets/centrality-logo-512.png'
import { useSessionStore, type ProjectInfo, type SessionInfo } from '../../stores/session-store'
import { useTabsStore } from '../../stores/tabs-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useOpenSession } from '../../lib/use-open-session'

export function Dashboard() {
  const { projects, loadProjects, isLoadingProjects } = useSessionStore()
  const { recentProjects, openSettings } = useTabsStore()
  const { globalSettings, loadGlobalSettings } = useSettingsStore()
  const openSession = useOpenSession()

  useEffect(() => { loadGlobalSettings() }, [loadGlobalSettings])

  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [projectSessions, setProjectSessions] = useState<Record<string, SessionInfo[]>>({})
  const [loadingSessions, setLoadingSessions] = useState<string | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadSessionsForProject = async (project: ProjectInfo) => {
    if (projectSessions[project.encodedName]) return
    setLoadingSessions(project.encodedName)
    try {
      const sessions = await window.api.listSessions(project.encodedName) as SessionInfo[]
      setProjectSessions(prev => ({ ...prev, [project.encodedName]: sessions }))
    } finally {
      setLoadingSessions(null)
    }
  }

  const handleProjectExpand = async (project: ProjectInfo) => {
    if (expandedProject === project.encodedName) {
      setExpandedProject(null)
      return
    }
    setExpandedProject(project.encodedName)
    await loadSessionsForProject(project)
  }

  const handleResumeSession = async (
    e: React.MouseEvent,
    project: ProjectInfo,
    session: SessionInfo,
  ) => {
    e.stopPropagation()
    const result = await window.api.resumeSession({
      sessionId: session.sessionId,
      projectPath: project.projectPath,
    })
    if (!result.ok) {
      console.error('Resume failed:', result.error)
      alert(`Could not resume session: ${result.error}`)
    }
  }

  const handleOpenSession = (project: ProjectInfo, session: SessionInfo) => {
    openSession({
      projectEncoded: project.encodedName,
      projectPath: project.projectPath,
      projectDisplayName: project.displayName,
      sessionPath: session.filePath,
      sessionId: session.sessionId,
      mtime: session.mtime,
    })
  }

  const handleOpenRecent = async (encodedName: string, sessionPath: string, sessionId: string, mtime: number) => {
    const project = projects.find(p => p.encodedName === encodedName)
    if (!project) return
    openSession({
      projectEncoded: project.encodedName,
      projectPath: project.projectPath,
      projectDisplayName: project.displayName,
      sessionPath,
      sessionId,
      mtime,
    })
  }

  // Sort: recent projects first, then alphabetical
  const sortedProjects = [...projects].sort((a, b) => {
    const ai = recentProjects.findIndex(r => r.encodedName === a.encodedName)
    const bi = recentProjects.findIndex(r => r.encodedName === b.encodedName)
    if (ai !== -1 && bi === -1) return -1
    if (ai === -1 && bi !== -1) return 1
    if (ai !== -1 && bi !== -1) return ai - bi
    return a.displayName.localeCompare(b.displayName)
  })

  return (
    <div className="flex-1 overflow-y-auto scrollable bg-zinc-950">
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-0 mb-1">
            <img src={centralityLogo} alt="Centrality" className="w-8 h-8" />
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Centrality</h1>
            <div className="flex-1" />
            <button
              onClick={openSettings}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
            >
              <Settings size={13} />
              <span>Settings</span>
            </button>
          </div>
          <p className="text-sm text-zinc-500 ml-[26px]">
            A live map of your codebase that connects you to how Claude Code navigates and modifies your projects
          </p>
        </div>

        {/* Recent section */}
        {recentProjects.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Recent
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {recentProjects.slice(0, 4).map(recent => {
                const shortName = recent.displayName.split('/').slice(-2).join('/')
                const lastDate = new Date(recent.lastOpened).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric',
                })
                return (
                  <button
                    key={recent.encodedName}
                    onClick={() => handleOpenRecent(
                      recent.encodedName,
                      recent.lastSessionPath,
                      recent.lastSessionId,
                      recent.lastSessionMtime,
                    )}
                    className="flex items-start gap-3 p-3.5 rounded-lg bg-zinc-900 border border-zinc-800
                      hover:border-zinc-600 hover:bg-zinc-800/60 text-left transition-all group"
                  >
                    <FolderOpen
                      size={15}
                      className="text-accent shrink-0 mt-0.5 transition-colors"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200 truncate leading-snug">
                        {shortName}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-zinc-500 text-xs">
                        <Clock size={10} />
                        <span>{lastDate}</span>
                        <span className="text-zinc-700">·</span>
                        <span className="font-mono">{recent.lastSessionId.slice(0, 7)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* All projects */}
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            All Projects
          </h2>

          {isLoadingProjects ? (
            <div className="text-sm text-zinc-600 animate-pulse py-4">Scanning {globalSettings.claudeDir ?? '~/.claude'}/projects/…</div>
          ) : sortedProjects.length === 0 ? (
            <div className="text-sm text-zinc-600 py-4">
              No projects found in <code className="text-zinc-500">{globalSettings.claudeDir ?? '~/.claude'}/projects/</code>
            </div>
          ) : (
            <div className="space-y-1">
              {sortedProjects.map(project => {
                const isExpanded = expandedProject === project.encodedName
                const sessions = projectSessions[project.encodedName] ?? []
                const isLoading = loadingSessions === project.encodedName
                const shortName = project.displayName.split('/').slice(-2).join('/')

                return (
                  <div
                    key={project.encodedName}
                    className="rounded-lg overflow-hidden border border-zinc-800/80"
                  >
                    {/* Project row */}
                    <button
                      onClick={() => handleProjectExpand(project)}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-zinc-900
                        hover:bg-zinc-800/60 text-left transition-colors"
                    >
                      <span className="text-zinc-600 shrink-0">
                        {isExpanded
                          ? <ChevronDown size={13} />
                          : <ChevronRight size={13} />
                        }
                      </span>
                      <FolderOpen size={13} className="text-zinc-500 shrink-0" />
                      <span className="text-sm text-zinc-300 flex-1 truncate">{shortName}</span>
                      {isLoading && (
                        <span className="text-xs text-zinc-600 animate-pulse">Loading…</span>
                      )}
                    </button>

                    {/* Sessions list */}
                    {isExpanded && !isLoading && sessions.length > 0 && (
                      <div className="border-t border-zinc-800/80 bg-zinc-950 divide-y divide-zinc-800/40">
                        {sessions.map(session => {
                          const dt = new Date(session.mtime)
                          const dateStr = dt.toLocaleDateString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })
                          const timeStr = dt.toLocaleTimeString(undefined, {
                            hour: '2-digit', minute: '2-digit',
                          })
                          const isRemote = project.projectPath.startsWith('ssh:')
                          const platformSupported = window.api.platform === 'darwin' || window.api.platform === 'win32'
                          const resumeDisabled = isRemote || !platformSupported
                          return (
                            <div
                              key={session.sessionId}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleOpenSession(project, session)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  handleOpenSession(project, session)
                                }
                              }}
                              className="w-full flex items-center gap-3 pl-10 pr-4 py-2 hover:bg-zinc-900
                                text-left transition-colors group cursor-pointer"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-mono text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
                                  {session.sessionId.slice(0, 8)}…
                                </span>
                              </div>
                              <span className="text-xs text-zinc-600 shrink-0">
                                {dateStr} · {timeStr}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleResumeSession(e, project, session)}
                                disabled={resumeDisabled}
                                title={
                                  !platformSupported
                                    ? 'Resume is only supported on macOS and Windows'
                                    : isRemote
                                      ? 'Remote resume not yet supported'
                                      : 'Resume this session in Terminal'
                                }
                                className="shrink-0 p-1.5 rounded hover:bg-zinc-800 text-zinc-500
                                  hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent
                                  disabled:cursor-not-allowed transition-colors"
                              >
                                <TerminalSquare className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {isExpanded && !isLoading && sessions.length === 0 && (
                      <div className="border-t border-zinc-800/80 bg-zinc-950 px-10 py-3 text-xs text-zinc-600">
                        No sessions found
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
