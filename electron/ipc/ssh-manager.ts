import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { BrowserWindow } from 'electron'
import { Client, type ConnectConfig, type SFTPWrapper, type FileEntryWithStats } from 'ssh2'
import type { RemoteSettings, SshAuthMethod } from '../../src/types/settings'
import type { ProjectInfo, SessionInfo, ParsedSession } from './jsonl-parser'
import { parseSession } from './jsonl-parser'

/** Prefix used to tag remote session file paths so the rest of the app
 *  can tell local and remote sessions apart without extra metadata. */
export const REMOTE_PATH_PREFIX = 'ssh:'

export function isRemotePath(p: string): boolean {
  return p.startsWith(REMOTE_PATH_PREFIX)
}

export function toRemotePath(remotePath: string): string {
  return REMOTE_PATH_PREFIX + remotePath
}

export function fromRemotePath(p: string): string {
  return p.startsWith(REMOTE_PATH_PREFIX) ? p.slice(REMOTE_PATH_PREFIX.length) : p
}

export interface SshTestResult {
  success: boolean
  message: string
  banner?: string
}

/**
 * Minimal parser for ~/.ssh/config. Handles the subset relevant here:
 * Host aliases, HostName, User, Port, IdentityFile. Per-host options are
 * applied in declaration order and the first match for a given key wins,
 * matching OpenSSH semantics.
 */
interface SshConfigEntry {
  hostName?: string
  user?: string
  port?: number
  identityFile?: string
}

export function parseSshConfig(alias: string): SshConfigEntry {
  const configPath = path.join(os.homedir(), '.ssh', 'config')
  let text: string
  try {
    text = fs.readFileSync(configPath, 'utf8')
  } catch {
    return {}
  }

  const result: SshConfigEntry = {}
  let inMatchingBlock = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(\S+)\s+(.*)$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim()

    if (key === 'host') {
      const patterns = value.split(/\s+/)
      inMatchingBlock = patterns.some(p => matchesGlob(alias, p))
      continue
    }
    if (!inMatchingBlock) continue

    if (key === 'hostname' && result.hostName === undefined) result.hostName = value
    else if (key === 'user' && result.user === undefined) result.user = value
    else if (key === 'port' && result.port === undefined) {
      const n = parseInt(value, 10)
      if (!Number.isNaN(n)) result.port = n
    } else if (key === 'identityfile' && result.identityFile === undefined) {
      result.identityFile = expandHome(value.replace(/^"(.*)"$/, '$1'))
    }
  }
  return result
}

function matchesGlob(value: string, pattern: string): boolean {
  if (pattern === '*' || pattern === value) return true
  // Translate simple `*` / `?` globs to regex
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  )
  return re.test(value)
}

function expandHome(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1))
  return p
}

/**
 * Build a ssh2 ConnectConfig from our RemoteSettings, applying auth method
 * semantics. Throws an Error with a user-friendly message if required inputs
 * are missing.
 */
export function buildConnectConfig(settings: RemoteSettings): ConnectConfig {
  if (!settings.host.trim()) throw new Error('Host is required')

  // Start with ssh config defaults (only used to fill gaps). When authMethod
  // is 'auto' we lean on these; for explicit methods the user-supplied values
  // take precedence but ssh config still provides host/port/user fallbacks.
  const fromConfig = parseSshConfig(settings.host.trim())

  const hostName = fromConfig.hostName ?? settings.host.trim()
  const port = settings.port ?? fromConfig.port ?? 22
  const username = settings.user.trim() || fromConfig.user || os.userInfo().username

  const base: ConnectConfig = {
    host: hostName,
    port,
    username,
    readyTimeout: 8000,
  }

  const method: SshAuthMethod = settings.authMethod
  if (method === 'auto') {
    // Prefer ssh-agent if available, otherwise ssh config IdentityFile.
    const agent = process.env['SSH_AUTH_SOCK']
    if (agent) {
      base.agent = agent
    } else if (fromConfig.identityFile) {
      base.privateKey = readKeyFile(fromConfig.identityFile)
    } else {
      // Fall through to default identity files commonly used
      const fallback = findDefaultIdentityFile()
      if (fallback) base.privateKey = readKeyFile(fallback)
      else throw new Error('No ssh-agent and no identity file found. Select an explicit auth method.')
    }
  } else if (method === 'agent') {
    const agent = process.env['SSH_AUTH_SOCK']
    if (!agent) throw new Error('SSH_AUTH_SOCK is not set — no ssh-agent available')
    base.agent = agent
  } else if (method === 'password') {
    if (!settings.password) throw new Error('Password is required')
    base.password = settings.password
  } else if (method === 'key') {
    const keyPath = settings.privateKeyPath.trim()
    if (!keyPath) throw new Error('Private key path is required')
    base.privateKey = readKeyFile(expandHome(keyPath))
    if (settings.password) base.passphrase = settings.password
  }

  return base
}

function readKeyFile(p: string): Buffer {
  try {
    return fs.readFileSync(p)
  } catch (err) {
    throw new Error(`Could not read key file ${p}: ${(err as Error).message}`)
  }
}

function findDefaultIdentityFile(): string | null {
  const candidates = ['id_ed25519', 'id_rsa', 'id_ecdsa']
  for (const name of candidates) {
    const p = path.join(os.homedir(), '.ssh', name)
    if (fs.existsSync(p)) return p
  }
  return null
}

/**
 * Attempt to connect to the remote host with the given settings. Resolves
 * with a structured result regardless of success so the renderer can display
 * errors inline without unhandled rejections.
 */
export function testConnection(settings: RemoteSettings): Promise<SshTestResult> {
  return new Promise(resolve => {
    let config: ConnectConfig
    try {
      config = buildConnectConfig(settings)
    } catch (err) {
      resolve({ success: false, message: (err as Error).message })
      return
    }

    const client = new Client()
    let banner = ''
    let settled = false
    const finish = (r: SshTestResult) => {
      if (settled) return
      settled = true
      try { client.end() } catch { /* noop */ }
      resolve(r)
    }

    client.on('banner', msg => { banner = msg.trim() })
    client.on('ready', () => {
      finish({
        success: true,
        message: `Connected to ${config.username}@${config.host}:${config.port}`,
        banner: banner || undefined,
      })
    })
    client.on('error', err => {
      finish({ success: false, message: err.message })
    })
    client.on('end', () => {
      finish({ success: false, message: 'Connection ended before ready' })
    })

    try {
      client.connect(config)
    } catch (err) {
      finish({ success: false, message: (err as Error).message })
    }
  })
}

// ─── Persistent SFTP session ─────────────────────────────────────────────────
//
// We keep a single ssh2 Client + SFTP channel alive while remote mode is on.
// listProjects / listSessions / loadSession all piggy-back on the same
// connection, which is a lot cheaper than opening a new TCP+SSH handshake for
// every IPC call. The polling watcher also uses it.

interface ActiveConnection {
  key: string
  client: Client
  sftp: SFTPWrapper
  homeDir: string
}

let active: ActiveConnection | null = null
let connecting: Promise<ActiveConnection> | null = null

function connectionKey(r: RemoteSettings): string {
  return [
    r.host, r.port ?? '', r.user, r.authMethod, r.privateKeyPath, r.remoteClaudeDir,
    // password/passphrase bumps the key so auth changes force reconnect
    r.password ? crypto.createHash('sha1').update(r.password).digest('hex').slice(0, 8) : '',
  ].join('|')
}

export function closeRemoteConnection(): void {
  if (!active) return
  try { active.sftp.end() } catch { /* noop */ }
  try { active.client.end() } catch { /* noop */ }
  active = null
}

/** User-initiated disconnect: also stops the polling watcher. */
export function disconnectRemote(): void {
  stopRemoteWatcher()
  closeRemoteConnection()
}

async function acquireConnection(settings: RemoteSettings): Promise<ActiveConnection> {
  const key = connectionKey(settings)
  if (active && active.key === key) return active
  if (active && active.key !== key) closeRemoteConnection()
  if (connecting) return connecting

  connecting = (async () => {
    const config = buildConnectConfig(settings)
    const client = new Client()
    await new Promise<void>((resolve, reject) => {
      const onErr = (err: Error) => { cleanup(); reject(err) }
      const onReady = () => { cleanup(); resolve() }
      const cleanup = () => {
        client.removeListener('ready', onReady)
        client.removeListener('error', onErr)
      }
      client.once('ready', onReady)
      client.once('error', onErr)
      client.connect(config)
    })
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) =>
      client.sftp((err, s) => err ? reject(err) : resolve(s))
    )
    // Resolve the remote home dir once so we can expand `~` in user-supplied paths
    const homeDir = await new Promise<string>((resolve, reject) =>
      sftp.realpath('.', (err, abs) => err ? reject(err) : resolve(abs))
    )

    // If the connection drops, forget it so the next call reconnects cleanly.
    client.on('close', () => {
      if (active && active.client === client) active = null
    })
    client.on('error', () => {
      if (active && active.client === client) active = null
    })

    active = { key, client, sftp, homeDir }
    return active
  })()

  try {
    return await connecting
  } finally {
    connecting = null
  }
}

function posixJoin(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/')
}

function resolveRemoteBase(conn: ActiveConnection, settings: RemoteSettings): string {
  const override = settings.remoteClaudeDir.trim()
  if (!override) return posixJoin(conn.homeDir, '.claude')
  if (override.startsWith('~')) return posixJoin(conn.homeDir, override.slice(1))
  return override
}

// Naive project-name decoder for remote paths: we cannot probe the remote
// filesystem cheaply to disambiguate dashes, so we fall back to the simple
// `-` → `/` replacement. Users whose project names contain literal dashes
// may see merged segments, same as the local fallback path.
function decodeRemoteProjectName(encoded: string): string {
  if (!encoded.startsWith('-')) return encoded.replace(/-/g, '/')
  return '/' + encoded.slice(1).replace(/-/g, '/')
}

function readdirSftp(sftp: SFTPWrapper, dir: string): Promise<FileEntryWithStats[]> {
  return new Promise((resolve, reject) =>
    sftp.readdir(dir, (err, list) => err ? reject(err) : resolve(list))
  )
}

export async function listRemoteProjects(settings: RemoteSettings): Promise<ProjectInfo[]> {
  const conn = await acquireConnection(settings)
  const projectsDir = posixJoin(resolveRemoteBase(conn, settings), 'projects')
  let entries: FileEntryWithStats[]
  try {
    entries = await readdirSftp(conn.sftp, projectsDir)
  } catch {
    return []
  }
  return entries
    .filter(e => (e.attrs.mode & 0o170000) === 0o040000) // S_IFDIR
    .map(e => {
      const projectPath = decodeRemoteProjectName(e.filename)
      return { encodedName: e.filename, projectPath, displayName: projectPath }
    })
}

export async function listRemoteSessions(settings: RemoteSettings, encodedName: string): Promise<SessionInfo[]> {
  const conn = await acquireConnection(settings)
  const sessionDir = posixJoin(resolveRemoteBase(conn, settings), 'projects', encodedName)
  let entries: FileEntryWithStats[]
  try {
    entries = await readdirSftp(conn.sftp, sessionDir)
  } catch {
    return []
  }
  return entries
    .filter(e => e.filename.endsWith('.jsonl'))
    .map(e => ({
      sessionId: e.filename.replace('.jsonl', ''),
      filePath: toRemotePath(posixJoin(sessionDir, e.filename)),
      // ssh2 reports mtime in seconds since epoch
      mtime: e.attrs.mtime * 1000,
    }))
    .sort((a, b) => b.mtime - a.mtime)
}

function tempPathFor(remotePath: string): string {
  const hash = crypto.createHash('sha1').update(remotePath).digest('hex').slice(0, 16)
  return path.join(os.tmpdir(), `centrality-remote-${hash}.jsonl`)
}

export async function loadRemoteSession(settings: RemoteSettings, filePath: string): Promise<ParsedSession> {
  const conn = await acquireConnection(settings)
  const remotePath = fromRemotePath(filePath)
  const localPath = tempPathFor(remotePath)
  await new Promise<void>((resolve, reject) =>
    conn.sftp.fastGet(remotePath, localPath, err => err ? reject(err) : resolve())
  )
  return parseSession(localPath)
}

// ─── Polling watcher ─────────────────────────────────────────────────────────
//
// SSH has no equivalent of chokidar/fsevents, so for remote mode we poll every
// few seconds: readdir each known project dir, compare mtimes to the previous
// snapshot, reparse and push updates for anything that grew or appeared.
// This is O(projects + sessions) per tick which is fine for the handful of
// sessions a typical Claude Code user has.

const POLL_INTERVAL_MS = 4000

interface RemoteWatcherState {
  settings: RemoteSettings
  timer: ReturnType<typeof setInterval>
  mtimes: Map<string, number> // key: remote absolute path, value: mtime ms
  firstRun: boolean
}

let remoteWatcher: RemoteWatcherState | null = null

function sendSessionUpdate(payload: unknown) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send('session:update', payload)
  })
}

async function pollOnce(state: RemoteWatcherState): Promise<void> {
  let conn: ActiveConnection
  try {
    conn = await acquireConnection(state.settings)
  } catch {
    return // leave firstRun as-is; retry next tick
  }
  const projectsDir = posixJoin(resolveRemoteBase(conn, state.settings), 'projects')
  let projects: FileEntryWithStats[]
  try {
    projects = await readdirSftp(conn.sftp, projectsDir)
  } catch {
    return
  }
  for (const proj of projects) {
    if ((proj.attrs.mode & 0o170000) !== 0o040000) continue
    const projDir = posixJoin(projectsDir, proj.filename)
    let sessions: FileEntryWithStats[]
    try {
      sessions = await readdirSftp(conn.sftp, projDir)
    } catch {
      continue
    }
    for (const sess of sessions) {
      if (!sess.filename.endsWith('.jsonl')) continue
      const absPath = posixJoin(projDir, sess.filename)
      const mtime = sess.attrs.mtime * 1000
      const prev = state.mtimes.get(absPath)
      state.mtimes.set(absPath, mtime)
      if (state.firstRun) continue // seed on first pass, don't spam updates
      if (prev === mtime) continue
      // Changed or new — download + parse + emit
      try {
        const parsed = await loadRemoteSession(state.settings, toRemotePath(absPath))
        sendSessionUpdate({ filePath: toRemotePath(absPath), ...parsed })
      } catch {
        /* transient failure — try again next tick */
      }
    }
  }
  state.firstRun = false
}

export function stopRemoteWatcher(): void {
  if (!remoteWatcher) return
  clearInterval(remoteWatcher.timer)
  remoteWatcher = null
}

export function startRemoteWatcher(settings: RemoteSettings): void {
  stopRemoteWatcher()
  if (!settings.enabled || !settings.host.trim()) return
  const state: RemoteWatcherState = {
    settings,
    timer: setInterval(() => { void pollOnce(state) }, POLL_INTERVAL_MS),
    mtimes: new Map(),
    firstRun: true,
  }
  remoteWatcher = state
  // Kick off an immediate seed pass so the mtimes map is populated before
  // the first interval tick (otherwise a session that changes between startup
  // and the first tick could be missed).
  void pollOnce(state)
}
