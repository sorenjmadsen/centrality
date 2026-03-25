import React, { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { useTabStores, useUiStore } from '../../stores/tab-stores'
import type { ProjectSettings } from '../../types/settings'
import { DEFAULT_PROJECT_SETTINGS } from '../../types/settings'

interface Props {
  encodedName: string
  onClose(): void
}

export function ProjectSettingsModal({ encodedName, onClose }: Props) {
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS)
  const [patternInput, setPatternInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { loadProjectSettings, saveProjectSettings } = useSettingsStore()
  const tabStores = useTabStores()
  const { selectedProjectPath } = useUiStore()

  useEffect(() => {
    loadProjectSettings(encodedName).then(setProjectSettings)
  }, [encodedName, loadProjectSettings])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function addPattern() {
    const trimmed = patternInput.trim()
    if (!trimmed || projectSettings.excludePatterns.includes(trimmed)) return
    setProjectSettings(s => ({ ...s, excludePatterns: [...s.excludePatterns, trimmed] }))
    setPatternInput('')
  }

  function removePattern(pattern: string) {
    setProjectSettings(s => ({ ...s, excludePatterns: s.excludePatterns.filter(p => p !== pattern) }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveProjectSettings(encodedName, projectSettings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
      return
    }
    // Close first, then trigger rescan (fire-and-forget)
    onClose()
    if (selectedProjectPath) {
      tabStores.codebase.getState().scanProject(selectedProjectPath, encodedName)
      tabStores.git.getState().loadCommits(selectedProjectPath, encodedName)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[480px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-100">Project Settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Exclude Patterns */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Exclude Patterns
            </label>
            <p className="text-xs text-zinc-500 mb-3">
              Additional directories or files to exclude from the graph (adds to built-in list).
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {projectSettings.excludePatterns.map(p => (
                <span
                  key={p}
                  className="flex items-center gap-1 bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded"
                >
                  {p}
                  <button
                    onClick={() => removePattern(p)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={patternInput}
                onChange={e => setPatternInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addPattern() }}
                placeholder="e.g. target, .DS_Store"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={addPattern}
                className="p-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Git History */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Git History
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gitHistory"
                  checked={projectSettings.gitHistoryDays === null}
                  onChange={() => setProjectSettings(s => ({ ...s, gitHistoryDays: null }))}
                  className="accent-accent"
                />
                <span className="text-xs text-zinc-300">Default (200 most recent commits)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gitHistory"
                  checked={projectSettings.gitHistoryDays !== null}
                  onChange={() => setProjectSettings(s => ({ ...s, gitHistoryDays: 30 }))}
                  className="accent-accent"
                />
                <span className="text-xs text-zinc-300">Days back:</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={projectSettings.gitHistoryDays ?? 30}
                  onChange={e => setProjectSettings(s => ({
                    ...s,
                    gitHistoryDays: Math.max(1, parseInt(e.target.value) || 1),
                  }))}
                  onClick={() => {
                    if (projectSettings.gitHistoryDays === null) {
                      setProjectSettings(s => ({ ...s, gitHistoryDays: 30 }))
                    }
                  }}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-zinc-700">
          {error && <span className="text-xs text-red-400 flex-1">{error}</span>}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-accent-deep hover:bg-accent text-white rounded transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Rescan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
