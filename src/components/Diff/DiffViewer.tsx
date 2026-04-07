import React, { useMemo } from 'react'

interface DiffViewerProps {
  unified: string
  maxLines?: number  // truncate after this many lines (default 200)
}

interface DiffLine {
  kind: 'header' | 'hunk' | 'add' | 'remove' | 'context'
  text: string
}

function parseDiff(unified: string): DiffLine[] {
  return unified.split('\n').map(line => {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
      return { kind: 'header', text: line }
    }
    if (line.startsWith('@@')) return { kind: 'hunk', text: line }
    if (line.startsWith('+')) return { kind: 'add', text: line.slice(1) }
    if (line.startsWith('-')) return { kind: 'remove', text: line.slice(1) }
    return { kind: 'context', text: line.startsWith(' ') ? line.slice(1) : line }
  })
}

export function DiffViewer({ unified, maxLines = 200 }: DiffViewerProps) {
  const lines = useMemo(() => parseDiff(unified).slice(0, maxLines), [unified, maxLines])
  const truncated = unified.split('\n').length > maxLines

  if (!unified.trim()) {
    return <div className="text-zinc-600 text-[10px] italic px-2 py-1">No diff available</div>
  }

  return (
    <div className="font-mono text-[10px] overflow-x-auto overflow-y-auto max-h-72 rounded bg-zinc-950 border border-zinc-800 scrollable">
      <div className="min-w-full w-max">
      {lines.map((line, i) => {
        let bg = ''
        let text = 'text-zinc-400'

        if (line.kind === 'header') { bg = ''; text = 'text-zinc-600' }
        else if (line.kind === 'hunk') { bg = 'bg-blue-950/30'; text = 'text-blue-400' }
        else if (line.kind === 'add') { bg = 'bg-green-950/40'; text = 'text-green-300' }
        else if (line.kind === 'remove') { bg = 'bg-red-950/40'; text = 'text-red-300' }

        const prefix = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : line.kind === 'hunk' ? '' : ' '

        return (
          <div key={i} className={`px-2 whitespace-pre ${bg} ${text} leading-4`}>
            {line.kind !== 'hunk' && (
              <span className="select-none mr-1 opacity-40">{prefix}</span>
            )}
            {line.text}
          </div>
        )
      })}
      {truncated && (
        <div className="px-2 py-1 text-zinc-600 italic">…diff truncated</div>
      )}
      </div>
    </div>
  )
}
