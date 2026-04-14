import React from 'react'
import { useUiStore } from '../../stores/tab-stores'
import { FileDetailPanel } from './FileDetailPanel'

export function FileDetailModal() {
  const { isFileDetailOpen, setFileDetailOpen } = useUiStore()

  if (!isFileDetailOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => setFileDetailOpen(false)}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <FileDetailPanel onClose={() => setFileDetailOpen(false)} />
      </div>
    </div>
  )
}
