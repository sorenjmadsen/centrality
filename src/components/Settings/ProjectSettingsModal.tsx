import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { useTabStores, useUiStore } from '../../stores/tab-stores'
import type { ProjectSettings, GlobalSettings } from '../../types/settings'
import { DEFAULT_PROJECT_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../../types/settings'

interface Props {
  encodedName: string
  onClose(): void
}

type Tab = 'project' | 'global'

export function ProjectSettingsModal({ encodedName, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('project')
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(DEFAULT_PROJECT_SETTINGS)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS)
  const [patternInput, setPatternInput] = useState('')
  const [saving, setSaving] = useState(false)

  const { loadProjectSettings, saveProjectSettings, loadGlobalSettings, saveGlobalSettings } = useSettingsStore()
  const tabStores = useTabStores()
  const { selectedProjectPath } = useUiStore()

  useEffect(() => {
    loadProjectSettings(encodedName).then(setProjectSettings)
    loadGlobalSettings().then(setGlobalSettings)
  }, [encodedName, loadProjectSettings, loadGlobalSettings])

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
    try {
      await saveProjectSettings(encodedName, projectSettings)
      await saveGlobalSettings(globalSettings)
      // Re-scan with new settings applied
      if (selectedProjectPath) {
        tabStores.codebase.getState().scanProject(selectedProjectPath, encodedName)
        tabStores.git.getState().loadCommits(selectedProjectPath, encodedName)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[480px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700">
          {(['project', 'global'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-xs font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'text-zinc-100 border-b-2 border-blue-500 -mb-px'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {activeTab === 'project' ? (
            <>
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
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-zinc-300">Default (200 most recent commits)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gitHistory"
                      checked={projectSettings.gitHistoryDays !== null}
                      onChange={() => setProjectSettings(s => ({ ...s, gitHistoryDays: 30 }))}
                      className="accent-blue-500"
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

              {/* Accent Color */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-2">
                  Accent Color
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="accentColor"
                      checked={projectSettings.accentColor === null}
                      onChange={() => setProjectSettings(s => ({ ...s, accentColor: null }))}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-zinc-300">Default</span>
                    <span className="w-4 h-4 rounded-full bg-blue-500 inline-block" />
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="accentColor"
                      checked={projectSettings.accentColor !== null}
                      onChange={() => setProjectSettings(s => ({ ...s, accentColor: '#6366f1' }))}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-zinc-300">Custom:</span>
                    <input
                      type="color"
                      value={projectSettings.accentColor ?? '#6366f1'}
                      onChange={e => setProjectSettings(s => ({ ...s, accentColor: e.target.value }))}
                      onClick={() => {
                        if (projectSettings.accentColor === null) {
                          setProjectSettings(s => ({ ...s, accentColor: '#6366f1' }))
                        }
                      }}
                      className="w-8 h-6 rounded cursor-pointer bg-transparent border-0"
                    />
                    <span className="text-xs text-zinc-500 font-mono">
                      {projectSettings.accentColor ?? '#6366f1'}
                    </span>
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Claude Directory */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-2">
                  Claude Directory
                </label>
                <p className="text-xs text-zinc-500 mb-3">
                  Override the default Claude projects directory (<code className="text-zinc-400">~/.claude/projects</code>).
                  Leave blank to use the default.
                </p>
                <input
                  type="text"
                  value={globalSettings.claudeDir ?? ''}
                  onChange={e => setGlobalSettings(s => ({
                    ...s,
                    claudeDir: e.target.value.trim() || null,
                  }))}
                  placeholder="~/.claude/projects"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                />
                <p className="text-xs text-zinc-600 mt-2">Takes effect after restarting the app.</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & Rescan'}
          </button>
        </div>
      </div>
    </div>
  )
}
