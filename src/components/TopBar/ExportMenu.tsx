import React, { useState, useRef, useEffect } from 'react'
import { Download } from 'lucide-react'
import { useChatStore, useUiStore } from '../../stores/tab-stores'

export function ExportMenu() {
  const { exchanges } = useChatStore()
  const { selectedProjectPath, selectedSessionPath } = useUiStore()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleExportMarkdown() {
    setOpen(false)
    if (!selectedProjectPath || !selectedSessionPath) return

    const exportItems = exchanges.map((ex, index) => ({
      index,
      userText: ex.userMessage.textContent,
      assistantText: ex.assistantMessage.textContent,
      actions: ex.actions.map(a => ({
        toolName: a.toolName,
        filePath: a.filePath,
      })),
    }))

    const result = await window.api.exportMarkdown(
      selectedProjectPath,
      selectedSessionPath,
      exportItems
    ) as { success: boolean; filePath?: string }

    if (result.success && result.filePath) {
      showToast(`Saved to ${result.filePath}`)
    }
  }

  async function handleScreenshot() {
    setOpen(false)
    const result = await window.api.exportScreenshot() as { success: boolean; filePath?: string }
    if (result.success && result.filePath) {
      showToast(`Saved to ${result.filePath}`)
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded text-sm text-zinc-400
          hover:text-zinc-200 hover:bg-zinc-800 transition-colors border border-transparent
          hover:border-zinc-700"
        title="Export"
      >
        <Download size={14} />
        <span>Export</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700
          rounded shadow-lg min-w-[150px] py-1">
          <button
            onClick={handleExportMarkdown}
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700
              hover:text-zinc-100 transition-colors"
          >
            Export Markdown
          </button>
          <button
            onClick={handleScreenshot}
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700
              hover:text-zinc-100 transition-colors"
          >
            Screenshot
          </button>
        </div>
      )}

      {toast && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-700 border border-zinc-600
          rounded px-3 py-2 text-sm text-zinc-200 whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
