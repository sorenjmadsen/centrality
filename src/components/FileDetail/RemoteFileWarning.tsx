import React from 'react'
import { AlertTriangle } from 'lucide-react'

export function RemoteFileWarning({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-5 w-80 flex flex-col gap-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-zinc-200">Remote file</p>
            <p className="text-xs text-zinc-400 mt-1.5">
              This file lives on a remote server and can't be opened in a local editor.
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="self-end px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
