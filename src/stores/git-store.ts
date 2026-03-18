import { create } from 'zustand'
import type { GitCommit, GitDiff } from '../types/git'

interface GitStore {
  commits: GitCommit[]
  isLoading: boolean
  selectedCommitHash: string | null
  commitDiffs: Map<string, GitDiff>   // hash → diff (cache)
  highlightedFiles: Set<string>       // relative paths highlighted by selected commit

  loadCommits(projectPath: string): Promise<void>
  selectCommit(hash: string | null, projectPath: string): Promise<void>
  setCommits(commits: GitCommit[]): void
  clear(): void
}

export const useGitStore = create<GitStore>((set, get) => ({
  commits: [],
  isLoading: false,
  selectedCommitHash: null,
  commitDiffs: new Map(),
  highlightedFiles: new Set(),

  loadCommits: async (projectPath: string) => {
    set({ isLoading: true })
    try {
      const raw = await window.api.gitLog(projectPath) as GitCommit[]
      set({ commits: raw })
    } finally {
      set({ isLoading: false })
    }
  },

  selectCommit: async (hash: string | null, projectPath: string) => {
    if (!hash) {
      set({ selectedCommitHash: null, highlightedFiles: new Set() })
      return
    }

    const { commits, commitDiffs } = get()
    const commit = commits.find(c => c.hash === hash)
    set({
      selectedCommitHash: hash,
      highlightedFiles: new Set(commit?.changedFiles ?? []),
    })

    // Fetch diff if not cached
    if (!commitDiffs.has(hash)) {
      try {
        const diff = await window.api.gitDiff(projectPath, hash) as GitDiff
        const next = new Map(get().commitDiffs)
        next.set(hash, diff)
        set({ commitDiffs: next })
      } catch { /* ignore */ }
    }
  },

  setCommits: (commits) => set({ commits }),

  clear: () => set({
    commits: [],
    selectedCommitHash: null,
    commitDiffs: new Map(),
    highlightedFiles: new Set(),
  }),
}))
