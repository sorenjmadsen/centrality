import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Settings, Wifi, WifiOff, Download, Upload, FolderOpen, ExternalLink, SlidersHorizontal, Loader2, AlertTriangle, Plus, X } from 'lucide-react'
import { useSettingsStore } from '../../stores/settings-store'
import { useSessionStore } from '../../stores/session-store'
import type { GlobalSettings, RemoteSettings, SshAuthMethod } from '../../types/settings'
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_REMOTE_SETTINGS } from '../../types/settings'
import { THEMES, applyTheme, getTheme } from '../../lib/themes'
import type { ThemeName } from '../../lib/themes'
import centralityLogo from '../../assets/centrality-logo-512.png'
import { version } from '../../../package.json'

type SettingsTab = 'general' | 'remote' | 'configuration'

// Persists across SettingsPage mounts so the user's selected tab survives navigation
let lastActiveSettingsTab: SettingsTab = 'general'

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
  const [excludeInput, setExcludeInput] = useState('')

  function addExcludePattern() {
    const trimmed = excludeInput.trim()
    if (!trimmed || draft.defaultExcludePatterns.includes(trimmed)) return
    onChange({ defaultExcludePatterns: [...draft.defaultExcludePatterns, trimmed] })
    setExcludeInput('')
  }

  function removeExcludePattern(pattern: string) {
    onChange({ defaultExcludePatterns: draft.defaultExcludePatterns.filter(p => p !== pattern) })
  }

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

      <Section
        title="Default Exclude Patterns"
        description="Directories excluded from scanning and file watching across all projects."
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {draft.defaultExcludePatterns.map(p => (
            <span
              key={p}
              className="flex items-center gap-1 bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded"
            >
              {p}
              <button
                onClick={() => removeExcludePattern(p)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {draft.defaultExcludePatterns.length === 0 && (
            <span className="text-xs text-zinc-600">No patterns — all directories will be scanned.</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={excludeInput}
            onChange={e => setExcludeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addExcludePattern() }}
            placeholder="e.g. vendor, .DS_Store"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={addExcludePattern}
            className="p-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </Section>
    </div>
  )
}

// ─── Remote Tab ───────────────────────────────────────────────────────────────

const AUTH_METHODS: { value: SshAuthMethod; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto (from SSH config)', hint: 'Use ~/.ssh/config, ssh-agent, or default identity files' },
  { value: 'agent', label: 'SSH Agent', hint: 'Authenticate via the running ssh-agent (SSH_AUTH_SOCK)' },
  { value: 'password', label: 'Password', hint: 'Plain password authentication' },
  { value: 'key', label: 'Private Key', hint: 'Authenticate with a specific private key file' },
]

type TestStatus =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'success'; message: string; banner?: string }
  | { kind: 'error'; message: string }

// Persist the last test result across RemoteTab unmounts so navigating away
// from Settings and back doesn't wipe the Connected/Error indicator.
let lastRemoteTestStatus: TestStatus = { kind: 'idle' }

function RemoteTab({ draft, onChange }: { draft: GlobalSettings; onChange(patch: Partial<GlobalSettings>): void }) {
  const remote: RemoteSettings = draft.remote ?? DEFAULT_REMOTE_SETTINGS
  // If the persisted config says remote is enabled, reflect that in the
  // button on first mount — the main process already spun up the poller at
  // startup, so the user should see Connected without needing to click.
  if (lastRemoteTestStatus.kind === 'idle' && remote.enabled) {
    lastRemoteTestStatus = { kind: 'success', message: `Connected to ${remote.host}` }
  }
  const [status, setStatusState] = useState<TestStatus>(lastRemoteTestStatus)
  const setStatus = (s: TestStatus) => { lastRemoteTestStatus = s; setStatusState(s) }

  function update(patch: Partial<RemoteSettings>) {
    // Editing any field while connected invalidates the active session — the
    // new host/auth may not match what the server watcher is polling. Drop
    // enabled and tear down the SSH client so the user has to reconnect.
    const wasConnected = remote.enabled
    const next = { ...remote, ...patch, enabled: wasConnected ? false : remote.enabled }
    onChange({ remote: next })
    if (wasConnected) { void window.api.sshDisconnect() }
    setStatus({ kind: 'idle' })
  }

  async function handleTest() {
    setStatus({ kind: 'testing' })
    try {
      const res = await window.api.sshTestConnection(remote)
      if (res.success) {
        // Persist remote.enabled = true synchronously so the main process
        // starts routing listings through SSH before we reload projects.
        const nextRemote = { ...remote, enabled: true }
        const nextSettings = { ...draft, remote: nextRemote }
        await useSettingsStore.getState().saveGlobalSettings(nextSettings)
        onChange({ remote: nextRemote })
        setStatus({ kind: 'success', message: res.message, banner: res.banner })
        try { await useSessionStore.getState().loadProjects() } catch { /* noop */ }
      } else {
        setStatus({ kind: 'error', message: res.message })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message ?? 'Connect failed' })
    }
  }

  async function handleDisconnect() {
    // Flip remote.enabled off synchronously so the main process routes
    // projects:list / session:list back to the local filesystem before we
    // refresh the session store. Going through the debounced onChange would
    // leave a ~500ms window where the store still sees the remote config.
    const nextRemote = { ...remote, enabled: false }
    const nextSettings = { ...draft, remote: nextRemote }
    await useSettingsStore.getState().saveGlobalSettings(nextSettings)
    onChange({ remote: nextRemote })
    try { await window.api.sshDisconnect() } catch { /* noop */ }
    setStatus({ kind: 'idle' })
    // Reload local projects into the session store so the Dashboard reflects
    // them immediately instead of showing the stale remote list.
    try { await useSessionStore.getState().loadProjects() } catch { /* noop */ }
  }

  const showKey = remote.authMethod === 'key'
  const showPassword = remote.authMethod === 'password' || remote.authMethod === 'key'
  const passwordLabel = remote.authMethod === 'key' ? 'Key passphrase (optional)' : 'Password'
  const canTest = remote.host.trim().length > 0 && status.kind !== 'testing'

  const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500'

  return (
    <div>
      <Section
        title="SSH Connection"
        description="Connect Centrality to Claude Code sessions running on a remote machine over SSH."
      >
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Host</label>
              <input
                type="text"
                value={remote.host}
                onChange={e => update({ host: e.target.value })}
                placeholder="hostname or ssh config alias"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Port</label>
              <input
                type="number"
                value={remote.port ?? ''}
                onChange={e => {
                  const v = e.target.value.trim()
                  update({ port: v === '' ? null : parseInt(v, 10) || null })
                }}
                placeholder="22"
                className={inputCls + ' w-20'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">User</label>
              <input
                type="text"
                value={remote.user}
                onChange={e => update({ user: e.target.value })}
                placeholder="(optional)"
                className={inputCls + ' w-32'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Authentication</label>
            <select
              value={remote.authMethod}
              onChange={e => update({ authMethod: e.target.value as SshAuthMethod })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              {AUTH_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-xs text-zinc-600 mt-1">
              {AUTH_METHODS.find(m => m.value === remote.authMethod)?.hint}
            </p>
          </div>

          {showKey && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Private Key Path</label>
              <input
                type="text"
                value={remote.privateKeyPath}
                onChange={e => update({ privateKeyPath: e.target.value })}
                placeholder="~/.ssh/id_ed25519"
                className={inputCls}
              />
            </div>
          )}

          {showPassword && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">{passwordLabel}</label>
              <input
                type="password"
                value={remote.password}
                onChange={e => update({ password: e.target.value })}
                placeholder={remote.authMethod === 'key' ? '(leave empty if unencrypted)' : ''}
                className={inputCls}
                autoComplete="new-password"
              />
              <p className="text-xs text-zinc-600 mt-1">
                Kept in memory only — never written to disk. You'll need to re-enter it after restarting Centrality.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Remote Claude Directory</label>
            <input
              type="text"
              value={remote.remoteClaudeDir}
              onChange={e => update({ remoteClaudeDir: e.target.value })}
              placeholder="~/.claude  (default)"
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-5">
          <button
            onClick={status.kind === 'success' ? handleDisconnect : handleTest}
            disabled={status.kind !== 'success' && !canTest}
            className={[
              'flex items-center gap-2 px-4 py-1.5 text-sm border rounded transition-colors',
              status.kind === 'success' || canTest
                ? 'bg-zinc-800 border-zinc-700 hover:border-zinc-500 hover:bg-zinc-700 text-zinc-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed',
            ].join(' ')}
          >
            {status.kind === 'testing'
              ? <Loader2 size={13} className="animate-spin" />
              : status.kind === 'success'
                ? <WifiOff size={13} />
                : <Wifi size={13} />}
            {status.kind === 'testing' ? 'Connecting…'
              : status.kind === 'success' ? 'Disconnect'
              : 'Connect'}
          </button>

          {status.kind === 'success' && (
            <p className="text-xs text-zinc-500 mt-1.5">{status.message}</p>
          )}
          {status.kind === 'success' && status.banner && (
            <pre className="mt-1 text-[11px] text-zinc-600 font-mono whitespace-pre-wrap">{status.banner}</pre>
          )}
          {status.kind === 'error' && (
            <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-300 break-words">
                <div className="font-medium mb-0.5">Connection failed</div>
                <div className="text-red-400/80 font-mono">{status.message}</div>
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

// ─── Configuration Tab ────────────────────────────────────────────────────────

// TODO: Replace with actual GitHub repo URL once published
const GITHUB_RELEASES_URL = 'https://github.com/OWNER/centrality/releases'
const GITHUB_LATEST_API = 'https://api.github.com/repos/OWNER/centrality/releases/latest'

function ConfigurationTab({ onReset }: { onReset(): void }) {
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [updateCheck, setUpdateCheck] = useState<{ status: 'checking' | 'up-to-date' | 'update-available' | 'error'; latest?: string }>({ status: 'checking' })
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(GITHUB_LATEST_API)
        if (!res.ok || cancelled) return
        const data = await res.json()
        const latest = (data.tag_name as string).replace(/^v/, '')
        if (cancelled) return
        setUpdateCheck(latest === version ? { status: 'up-to-date', latest } : { status: 'update-available', latest })
      } catch {
        if (!cancelled) setUpdateCheck({ status: 'error' })
      }
    })()
    return () => { cancelled = true }
  }, [])

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

      <Section title="About">
        <div className="flex items-center gap-3">
          <img src={centralityLogo} alt="Centrality" className="w-10 h-10" />
          <div>
            <div className="text-sm font-medium text-zinc-300">Centrality</div>
            <div className="text-xs text-zinc-500 font-mono">v{version}</div>
          </div>
          <div className="flex-1" />
          {updateCheck.status === 'checking' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-500">
              Checking for updates…
            </div>
          )}
          {updateCheck.status === 'up-to-date' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-500">
              Up to date
            </div>
          )}
          {updateCheck.status === 'update-available' && (
            <a
              href={GITHUB_RELEASES_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded hover:border-zinc-500 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              <Download size={12} />
              Download v{updateCheck.latest}
              <ExternalLink size={10} />
            </a>
          )}
          {updateCheck.status === 'error' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-500">
              Could not check for updates
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTabState] = useState<SettingsTab>(lastActiveSettingsTab)
  const setActiveTab = (tab: SettingsTab) => { lastActiveSettingsTab = tab; setActiveTabState(tab) }
  const storedSettings = useSettingsStore(s => s.globalSettings)
  const [draft, setDraft] = useState<GlobalSettings>(() => ({ ...DEFAULT_GLOBAL_SETTINGS, ...storedSettings }))
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
    { id: 'configuration', label: 'Configuration', icon: <SlidersHorizontal size={13} /> },
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
          <RemoteTab draft={draft} onChange={handleChange} />
        )}
        {activeTab === 'configuration' && (
          <ConfigurationTab onReset={handleReset} />
        )}
      </div>
    </div>
  )
}
