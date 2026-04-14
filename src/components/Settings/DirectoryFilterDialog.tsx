import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, X } from 'lucide-react'
import { useDirectoryFilterStore } from '../../stores/directory-filter-store'
import type { DirTreeNode } from '../../types/codebase'

/** Collect all directory relPaths in the tree (excluding the root "") */
function collectAllDirPaths(node: DirTreeNode): string[] {
  const paths: string[] = []
  for (const child of node.children) {
    paths.push(child.relPath)
    paths.push(...collectAllDirPaths(child))
  }
  return paths
}

/** Get all descendant dir relPaths (not including the node itself) */
function getDescendantPaths(node: DirTreeNode): string[] {
  const paths: string[] = []
  for (const child of node.children) {
    paths.push(child.relPath)
    paths.push(...getDescendantPaths(child))
  }
  return paths
}

/**
 * Compute the effective included file count for a node, given a set of
 * unchecked directories.  A directory's files are excluded if it is
 * itself unchecked OR any ancestor is unchecked.
 */
function computeIncludedFiles(node: DirTreeNode, unchecked: Set<string>): number {
  if (unchecked.has(node.relPath)) return 0
  let count = node.fileCount
  for (const child of node.children) {
    count += computeIncludedFiles(child, unchecked)
  }
  return count
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate'

function getCheckState(node: DirTreeNode, unchecked: Set<string>): CheckState {
  if (unchecked.has(node.relPath)) return 'unchecked'
  if (node.children.length === 0) return 'checked'

  let allChecked = true
  let allUnchecked = true
  for (const child of node.children) {
    const cs = getCheckState(child, unchecked)
    if (cs !== 'checked') allChecked = false
    if (cs !== 'unchecked') allUnchecked = false
  }
  if (allChecked) return 'checked'
  if (allUnchecked) return 'unchecked'
  return 'indeterminate'
}

function formatCount(n: number): string {
  return n.toLocaleString()
}

// ── Tree Item ────────────────────────────────────────────────────────────────

interface TreeItemProps {
  node: DirTreeNode
  depth: number
  uncheckedDirs: Set<string>
  expandedDirs: Set<string>
  onToggleCheck(relPath: string, node: DirTreeNode): void
  onToggleExpand(relPath: string): void
}

function DirectoryTreeItem({ node, depth, uncheckedDirs, expandedDirs, onToggleCheck, onToggleExpand }: TreeItemProps) {
  const checkboxRef = useRef<HTMLInputElement>(null)
  const checkState = getCheckState(node, uncheckedDirs)
  const isExpanded = expandedDirs.has(node.relPath)
  const hasChildren = node.children.length > 0

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = checkState === 'indeterminate'
    }
  }, [checkState])

  return (
    <>
      <div
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-zinc-800/60 rounded transition-colors cursor-pointer select-none"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => hasChildren && onToggleExpand(node.relPath)}
      >
        {/* Expand chevron */}
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {hasChildren ? (
            isExpanded
              ? <ChevronDown size={14} className="text-zinc-500" />
              : <ChevronRight size={14} className="text-zinc-500" />
          ) : null}
        </span>

        {/* Checkbox */}
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={checkState === 'checked' || checkState === 'indeterminate'}
          onChange={() => onToggleCheck(node.relPath, node)}
          onClick={e => e.stopPropagation()}
          className="accent-accent shrink-0"
        />

        {/* Folder icon */}
        {isExpanded && hasChildren
          ? <FolderOpen size={14} className="text-zinc-400 shrink-0" />
          : <Folder size={14} className="text-zinc-400 shrink-0" />
        }

        {/* Name */}
        <span className="text-xs text-zinc-200 truncate">{node.name}</span>

        {/* File count */}
        <span className="text-xs text-zinc-500 ml-auto shrink-0">
          {formatCount(node.totalFileCount)} file{node.totalFileCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && node.children
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(child => (
          <DirectoryTreeItem
            key={child.relPath}
            node={child}
            depth={depth + 1}
            uncheckedDirs={uncheckedDirs}
            expandedDirs={expandedDirs}
            onToggleCheck={onToggleCheck}
            onToggleExpand={onToggleExpand}
          />
        ))
      }
    </>
  )
}

// ── Main Dialog ──────────────────────────────────────────────────────────────

export function DirectoryFilterDialog() {
  const { isOpen, dirTree, totalFiles, currentExcludePatterns, resolve, reject } =
    useDirectoryFilterStore()

  // Track which dirs are unchecked (excluded)
  const [uncheckedDirs, setUncheckedDirs] = useState<Set<string>>(new Set())
  // Track which dirs are expanded in the tree
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  // Initialize state when dialog opens
  useEffect(() => {
    if (!isOpen || !dirTree) return

    // Pre-uncheck directories that match current exclude patterns
    const allPaths = collectAllDirPaths(dirTree)
    const initialUnchecked = new Set<string>()
    for (const pat of currentExcludePatterns) {
      for (const p of allPaths) {
        if (p === pat || p.startsWith(pat + '/')) {
          initialUnchecked.add(p)
        }
      }
    }
    setUncheckedDirs(initialUnchecked)

    // Start with all directories collapsed
    setExpandedDirs(new Set())
  }, [isOpen, dirTree, currentExcludePatterns])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') reject()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, reject])

  const handleToggleCheck = useCallback((relPath: string, node: DirTreeNode) => {
    setUncheckedDirs(prev => {
      const next = new Set(prev)
      const descendants = getDescendantPaths(node)

      if (prev.has(relPath)) {
        // Re-include this dir and all descendants
        next.delete(relPath)
        for (const d of descendants) next.delete(d)
      } else {
        // Exclude this dir and all descendants
        next.add(relPath)
        for (const d of descendants) next.add(d)
      }
      return next
    })
  }, [])

  const handleToggleExpand = useCallback((relPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(relPath)) next.delete(relPath)
      else next.add(relPath)
      return next
    })
  }, [])

  const includedFiles = useMemo(() => {
    if (!dirTree) return 0
    return computeIncludedFiles(dirTree, uncheckedDirs)
  }, [dirTree, uncheckedDirs])

  const handleContinue = useCallback(() => {
    if (!dirTree) return

    // Preserve existing non-directory patterns (user-added globs, file patterns)
    const allDirPaths = new Set(collectAllDirPaths(dirTree))
    const preserved = currentExcludePatterns.filter(p => !allDirPaths.has(p))

    // Only add top-level unchecked dirs (not descendants whose parent is already unchecked)
    const newPatterns: string[] = []
    for (const dir of uncheckedDirs) {
      // Skip if a parent dir is already unchecked
      const parts = dir.split('/')
      let parentUnchecked = false
      for (let i = 1; i < parts.length; i++) {
        if (uncheckedDirs.has(parts.slice(0, i).join('/'))) {
          parentUnchecked = true
          break
        }
      }
      if (!parentUnchecked) {
        newPatterns.push(dir)
      }
    }

    resolve([...preserved, ...newPatterns])
  }, [dirTree, uncheckedDirs, currentExcludePatterns, resolve])

  if (!isOpen || !dirTree) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[560px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Large Project Detected</h2>
            <p className="text-xs text-zinc-500 mt-1">
              This project contains {formatCount(totalFiles)} files. Select which directories to scan.
            </p>
          </div>
          <button
            onClick={() => reject()}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable tree */}
        <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
          {dirTree.children
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(child => (
              <DirectoryTreeItem
                key={child.relPath}
                node={child}
                depth={0}
                uncheckedDirs={uncheckedDirs}
                expandedDirs={expandedDirs}
                onToggleCheck={handleToggleCheck}
                onToggleExpand={handleToggleExpand}
              />
            ))
          }
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-700">
          <span className="text-xs text-zinc-500">
            Scanning {formatCount(includedFiles)} of {formatCount(totalFiles)} files
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => reject()}
              className="px-4 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleContinue}
              disabled={includedFiles === 0}
              className="px-4 py-1.5 text-xs bg-accent-deep hover:bg-accent text-white rounded transition-colors disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
