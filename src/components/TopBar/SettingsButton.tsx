import React, { useState } from 'react'
import { Settings } from 'lucide-react'
import { useUiStore } from '../../stores/tab-stores'
import { ProjectSettingsModal } from '../Settings/ProjectSettingsModal'

export function SettingsButton() {
  const [open, setOpen] = useState(false)
  const selectedProjectEncoded = useUiStore(s => s.selectedProjectEncoded)

  if (!selectedProjectEncoded) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Project settings"
      >
        <Settings size={14} />
      </button>
      {open && (
        <ProjectSettingsModal
          encodedName={selectedProjectEncoded}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
