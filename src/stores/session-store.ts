import { create } from 'zustand'
import type { ClaudeAction } from '../types/actions'

export interface ProjectInfo {
  encodedName: string
  projectPath: string
  displayName: string
}

export interface SessionInfo {
  sessionId: string
  filePath: string
  mtime: number
}

interface SessionStore {
  projects: ProjectInfo[]
  sessions: SessionInfo[]
  actions: ClaudeAction[]
  isLoadingProjects: boolean
  isLoadingSession: boolean

  loadProjects(): Promise<void>
  loadSessions(encodedName: string): Promise<void>
  loadSession(filePath: string): Promise<void>
}

export const useSessionStore = create<SessionStore>(set => ({
  projects: [],
  sessions: [],
  actions: [],
  isLoadingProjects: false,
  isLoadingSession: false,

  loadProjects: async () => {
    set({ isLoadingProjects: true })
    try {
      const projects = await window.api.listProjects() as ProjectInfo[]
      set({ projects })
    } finally {
      set({ isLoadingProjects: false })
    }
  },

  loadSessions: async (encodedName: string) => {
    const sessions = await window.api.listSessions(encodedName) as SessionInfo[]
    set({ sessions })
  },

  loadSession: async (filePath: string) => {
    set({ isLoadingSession: true, actions: [] })
    try {
      const result = await window.api.loadSession(filePath) as { actions: ClaudeAction[] }
      set({ actions: result.actions })
    } finally {
      set({ isLoadingSession: false })
    }
  },
}))
