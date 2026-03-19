import React, { useState } from 'react'
import { GitCommit as GitCommitIcon, ChevronRight, ChevronDown } from 'lucide-react'
import type { GitCommit } from '../../types/git'
import { useGitStore, useUiStore } from '../../stores/tab-stores'
import { DiffViewer } from '../Diff/DiffViewer'

interface GitCommitMarkerProps {
  commit: GitCommit
}

export function GitCommitMarker({ commit }: GitCommitMarkerProps) {
  const [open, setOpen] = useState(false)
  const { selectedCommitHash, commitDiffs, selectCommit } = useGitStore()
  const { selectedProjectPath, setSelectedExchange, setPlaybackIndex } = useUiStore()
  const isSelected = selectedCommitHash === commit.hash
  const diff = commitDiffs.get(commit.hash)

  async function handleClick() {
    const newHash = isSelected ? null : commit.hash
    // Clear exchange selection when selecting a git commit
    if (newHash) { setSelectedExchange(null); setPlaybackIndex(null) }
    await selectCommit(newHash, selectedProjectPath ?? '')
  }

  async function handleExpand(e: React.MouseEvent) {
    e.stopPropagation()
    setOpen(o => !o)
    if (!open && !diff) {
      setSelectedExchange(null); setPlaybackIndex(null)
      await selectCommit(commit.hash, selectedProjectPath ?? '')
    }
  }

  return (
    <div
      className={`rounded border transition-all cursor-pointer select-none
        ${isSelected
          ? 'border-violet-600/60 bg-violet-950/20'
          : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/40'
        }`}
      onClick={handleClick}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <GitCommitIcon size={11} className="text-violet-400 shrink-0" />

        <span className="font-mono text-[10px] text-violet-300 shrink-0">{commit.shortHash}</span>

        <span className="text-[11px] text-zinc-300 truncate flex-1">{commit.message}</span>

        <span className="text-[10px] text-zinc-600 shrink-0">
          {new Date(commit.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>

        <button
          onClick={handleExpand}
          className="text-zinc-600 hover:text-zinc-300 shrink-0"
        >
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      </div>

      {/* Changed files + diff */}
      {open && (
        <div className="border-t border-zinc-800 px-2 py-1.5 space-y-1.5">
          <div className="text-[10px] text-zinc-500">
            <span className="text-zinc-600 mr-1">by</span>{commit.author}
            <span className="text-zinc-600 mx-1">·</span>
            {commit.changedFiles.length} file{commit.changedFiles.length !== 1 ? 's' : ''}
          </div>

          {commit.changedFiles.length > 0 && (
            <div className="space-y-0.5">
              {commit.changedFiles.slice(0, 12).map(f => (
                <div key={f} className="font-mono text-[10px] text-zinc-500 truncate">
                  {f}
                </div>
              ))}
              {commit.changedFiles.length > 12 && (
                <div className="text-[10px] text-zinc-600">
                  +{commit.changedFiles.length - 12} more…
                </div>
              )}
            </div>
          )}

          {diff && <DiffViewer unified={diff.unified} />}
          {!diff && (
            <div className="text-[10px] text-zinc-600 italic">Loading diff…</div>
          )}
        </div>
      )}
    </div>
  )
}
