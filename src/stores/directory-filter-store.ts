import { create } from 'zustand'
import type { DirTreeNode } from '../types/codebase'

interface PromiseCallbacks {
  resolve: (patterns: string[]) => void
  reject: () => void
}

interface DirectoryFilterStore {
  isOpen: boolean
  dirTree: DirTreeNode | null
  totalFiles: number
  projectPath: string | null
  encodedName: string | null
  currentExcludePatterns: string[]
  /** @internal */
  _callbacks: PromiseCallbacks | null

  /**
   * Opens the dialog and returns a promise that resolves with the chosen
   * excludePatterns when the user clicks Continue, or rejects on Cancel.
   */
  promptFilter(params: {
    projectPath: string
    encodedName: string
    dirTree: DirTreeNode
    totalFiles: number
    currentExcludePatterns: string[]
  }): Promise<string[]>

  /** Called by the dialog when user clicks Continue */
  resolve(patterns: string[]): void
  /** Called by the dialog on Cancel / Escape */
  reject(): void
  close(): void
}

export const useDirectoryFilterStore = create<DirectoryFilterStore>((set, get) => ({
  isOpen: false,
  dirTree: null,
  totalFiles: 0,
  projectPath: null,
  encodedName: null,
  currentExcludePatterns: [],
  _callbacks: null,

  promptFilter(params) {
    return new Promise<string[]>((resolve, reject) => {
      set({
        isOpen: true,
        dirTree: params.dirTree,
        totalFiles: params.totalFiles,
        projectPath: params.projectPath,
        encodedName: params.encodedName,
        currentExcludePatterns: params.currentExcludePatterns,
        _callbacks: { resolve, reject },
      })
    })
  },

  resolve(patterns) {
    const cb = get()._callbacks
    set({ isOpen: false, dirTree: null, _callbacks: null })
    cb?.resolve(patterns)
  },

  reject() {
    const cb = get()._callbacks
    set({ isOpen: false, dirTree: null, _callbacks: null })
    cb?.reject()
  },

  close() {
    set({ isOpen: false, dirTree: null, _callbacks: null })
  },
}))
