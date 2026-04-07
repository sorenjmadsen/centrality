import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Settings, Wifi, Download, Upload, FolderOpen } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import type { GlobalSettings } from '../../types/settings'
import { DEFAULT_GLOBAL_SETTINGS } from '../../types/settings'
import { THEMES, applyTheme, getTheme } from '../../lib/themes'
import type { ThemeName } from '../../lib/themes'

type SettingsTab = 'general' | 'remote' | 'configuration'

// ─── Toggle ─────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange(v: boolean): void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent',
        'transition-colors focus-visible:outline-none cursor-pointer',
        checked ? 'bg-accent' : 'bg-zinc-700',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
          'transform transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="py-5 border-b border-zinc-800 last:border-0">
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{title}</h3>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── General Tab ─────────────────────────────────────────────────────────────

function GeneralTab({ draft, onChange }: { draft: GlobalSettings; onChange(patch: Partial<GlobalSettings>): void }) {
  const [dirWarning, setDirWarning] = useState<string | null>(null)

  async function handlePickDirectory() {
    const result = await window.api.pickDirectory()
    if (!result) return
    setDirWarning(result.warning)
    onChange({ claudeDir: result.path })
  }

  function handleDirInput(value: string) {
    setDirWarning(null)
    onChange({ claudeDir: value.trim() || null })
  }

  return (
    <div>
      <Section
        title="System"
        description="Control how Centrality behaves on your machine."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-zinc-300">Launch at login</div>
              <div className="text-xs text-zinc-500 mt-0.5">Automatically open Centrality when you log in</div>
            </div>
            <Toggle checked={draft.launchAtLogin} onChange={v => onChange({ launchAtLogin: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-zinc-300">Show dock icon</div>
              <div className="text-xs text-zinc-500 mt-0.5">Display Centrality in the macOS dock</div>
            </div>
            <Toggle checked={draft.showDockIcon} onChange={v => onChange({ showDockIcon: v })} />
          </div>
        </div>
      </Section>

      <Section
        title="Claude Directory"
        description="Override the default location where Claude Code stores its project sessions."
      >
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={draft.claudeDir ?? ''}
            onChange={e => handleDirInput(e.target.value)}
            placeholder="~/.claude  (default)"
            className={[
              'flex-1 bg-zinc-800 border rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none font-mono',
              dirWarning ? 'border-yellow-700 focus:border-yellow-600' : 'border-zinc-700 focus:border-zinc-500',
            ].join(' ')}
          />
          <button
            onClick={handlePickDirectory}
            title="Browse…"
            className="flex items-center justify-center w-8 h-8 shrink-0 bg-zinc-800 border border-zinc-700 rounded hover:border-zinc-500 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <FolderOpen size={14} />
          </button>
          {draft.claudeDir && (
            <button
              onClick={() => { setDirWarning(null); onChange({ claudeDir: null }) }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5 rounded hover:bg-zinc-800"
            >
              Reset
            </button>
          )}
        </div>
        {dirWarning ? (
          <p className="text-xs text-yellow-600 mt-2">⚠ {dirWarning}</p>
        ) : (
          <p className="text-xs text-zinc-600 mt-2">
            Leave empty to use the default <code className="text-zinc-500">~/.claude</code> directory.
          </p>
        )}
      </Section>

      <Section
        title="Color Theme"
        description="Customize the Centrality interface appearance."
      >
        <div className="flex gap-3">
          {THEMES.map(theme => {
            const isSelected = draft.colorTheme === theme.name
            // Pick representative colors for the mini preview
            const previewBg = theme.zinc?.['950'] ?? '#09090b'
            const previewPanel = theme.zinc?.['900'] ?? '#18181b'
            const previewBorder = theme.zinc?.['700'] ?? '#3f3f46'
            return (
              <button
                key={theme.name}
                onClick={() => {
                  applyTheme(getTheme(theme.name as ThemeName))
                  onChange({ colorTheme: theme.name as ThemeName })
                }}
                className={[
                  'flex-1 rounded-lg border-2 p-3 text-left transition-all',
                  isSelected
                    ? 'border-accent'
                    : 'border-zinc-700 hover:border-zinc-500',
                ].join(' ')}
              >
                {/* Mini preview */}
                <div
                  className="w-full h-12 rounded mb-2.5 overflow-hidden relative"
                  style={{ backgroundColor: previewBg, border: `1px solid ${previewBorder}` }}
                >
                  {/* Simulated panel strip */}
                  <div
                    className="absolute inset-y-0 right-0 w-2/5"
                    style={{ backgroundColor: previewPanel, borderLeft: `1px solid ${previewBorder}` }}
                  />
                  {/* Accent dot */}
                  <div
                    className="absolute bottom-2 left-2 w-2 h-2 rounded-full"
                    style={{ backgroundColor: theme.accent }}
                  />
                  {/* Accent bar (simulated top bar) */}
                  <div
                    className="absolute top-0 inset-x-0 h-1.5"
                    style={{ backgroundColor: previewPanel, borderBottom: `1px solid ${previewBorder}` }}
                  />
                </div>
                <div className="text-xs font-medium text-zinc-300">{theme.label}</div>
                {isSelected && (
                  <div className="text-accent text-[10px] mt-0.5 font-medium">Active</div>
                )}
              </button>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

// ─── Remote Tab ───────────────────────────────────────────────────────────────

function RemoteTab() {
  return (
    <div>
      <Section
        title="SSH Connection"
        description="Connect Centrality to Claude Code sessions running on a remote machine over SSH."
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Host</label>
            <input
              type="text"
              disabled
              placeholder="user@hostname"
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded px-3 py-1.5 text-sm text-zinc-500 placeholder-zinc-600 font-mono cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">SSH Key Path</label>
            <input
              type="text"
              disabled
              placeholder="~/.ssh/id_rsa"
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded px-3 py-1.5 text-sm text-zinc-500 placeholder-zinc-600 font-mono cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Remote Claude Directory</label>
            <input
              type="text"
              disabled
              placeholder="~/.claude/projects"
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded px-3 py-1.5 text-sm text-zinc-500 placeholder-zinc-600 font-mono cursor-not-allowed"
            />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-4 py-3 flex items-center gap-3">
          <Wifi size={15} className="text-zinc-500 shrink-0" />
          <div className="text-sm text-zinc-500">
            Remote session support is coming soon. SSH tunneling will let you view Claude Code sessions from any machine.
          </div>
        </div>
      </Section>
    </div>
  )
}

// ─── Configuration Tab ────────────────────────────────────────────────────────

function ConfigurationTab({ onReset }: { onReset(): void }) {
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const { loadGlobalSettings, saveGlobalSettings } = useSettingsStore()

  async function handleExport() {
    setExportStatus('idle')
    try {
      const result = await window.api.exportSettings()
      setExportStatus(result.success ? 'success' : 'idle')
    } catch {
      setExportStatus('error')
    }
    setTimeout(() => setExportStatus('idle'), 2500)
  }

  async function handleImport() {
    setImportStatus('idle')
    try {
      const result = await window.api.importSettings() as GlobalSettings | null
      if (!result) return
      await saveGlobalSettings({ ...DEFAULT_GLOBAL_SETTINGS, ...result })
      await loadGlobalSettings()
      setImportStatus('success')
    } catch {
      setImportStatus('error')
    }
    setTimeout(() => setImportStatus('idle'), 2500)
  }

  return (
    <div>
      <Section
        title="Export Settings"
        description="Save your current Centrality global settings to a JSON file."
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded hover:border-zinc-500 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <Upload size={13} />
            Export settings…
          </button>
          {exportStatus === 'success' && <span className="text-xs text-green-400">Saved</span>}
          {exportStatus === 'error' && <span className="text-xs text-red-400">Export failed</span>}
        </div>
      </Section>

      <Section
        title="Import Settings"
        description="Load settings from a previously exported Centrality JSON file."
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            className="flex items-center gap-2 px-4 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded hover:border-zinc-500 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            <Download size={13} />
            Import settings…
          </button>
          {importStatus === 'success' && <span className="text-xs text-green-400">Settings applied</span>}
          {importStatus === 'error' && <span className="text-xs text-red-400">Import failed</span>}
        </div>
      </Section>

      <Section
        title="Reset"
        description="Restore all global settings to their factory defaults."
      >
        <button
          onClick={onReset}
          className="px-4 py-1.5 text-sm border border-red-900/60 rounded text-red-400 hover:bg-red-950/40 hover:border-red-700 transition-colors"
        >
          Reset to defaults
        </button>
      </Section>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [draft, setDraft] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { loadGlobalSettings, saveGlobalSettings } = useSettingsStore()

  useEffect(() => {
    loadGlobalSettings().then(s => setDraft({ ...DEFAULT_GLOBAL_SETTINGS, ...s }))
  }, [loadGlobalSettings])

  const scheduleSave = useCallback((updated: GlobalSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      await saveGlobalSettings(updated)
      setSaveStatus('saved')
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
    }, 500)
  }, [saveGlobalSettings])

  function handleChange(patch: Partial<GlobalSettings>) {
    const updated = { ...draft, ...patch }
    setDraft(updated)
    scheduleSave(updated)
  }

  async function handleReset() {
    setDraft(DEFAULT_GLOBAL_SETTINGS)
    await saveGlobalSettings(DEFAULT_GLOBAL_SETTINGS)
    setSaveStatus('saved')
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings size={13} /> },
    { id: 'remote', label: 'Remote', icon: <Wifi size={13} /> },
    { id: 'configuration', label: 'Configuration', icon: <Download size={13} /> },
  ]

  return (
    <div className="flex-1 overflow-y-auto scrollable bg-zinc-950">
      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Settings</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Manage Centrality preferences</p>
          </div>
          {saveStatus === 'saved' && (
            <span className="text-xs text-zinc-500 animate-pulse">Saved</span>
          )}
        </div>

        {/* Inner tab bar */}
        <div className="flex gap-1 mb-8 border-b border-zinc-800">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-sm relative transition-colors',
                activeTab === tab.id
                  ? 'text-zinc-100 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent'
                  : 'text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'general' && (
          <GeneralTab draft={draft} onChange={handleChange} />
        )}
        {activeTab === 'remote' && (
          <RemoteTab />
        )}
        {activeTab === 'configuration' && (
          <ConfigurationTab onReset={handleReset} />
        )}
      </div>
    </div>
  )
}
