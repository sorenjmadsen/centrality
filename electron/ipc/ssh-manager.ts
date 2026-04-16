import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { BrowserWindow } from 'electron'
import { Client, type ConnectConfig, type SFTPWrapper, type FileEntryWithStats } from 'ssh2'
import type { RemoteSettings, SshAuthMethod } from '../../src/types/settings'
import type { ProjectInfo, SessionInfo, ParsedSession } from './jsonl-parser'
import { parseSession } from './jsonl-parser'
import type { FsNode } from './codebase-scanner'
import type { DepEdge } from './dep-scanner'
import { parseTsJsImports, parsePyImports, TS_EXTENSIONS, PY_EXTENSIONS } from './dep-scanner'
import { extractSymbolsFromContent } from './tree-sitter-pool'
import ignore from 'ignore'

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

function statSftp(sftp: SFTPWrapper, p: string): Promise<boolean> {
  return new Promise(resolve => sftp.stat(p, err => resolve(!err)))
}

function readdirSftp(sftp: SFTPWrapper, dir: string): Promise<FileEntryWithStats[]> {
  return new Promise((resolve, reject) =>
    sftp.readdir(dir, (err, list) => err ? reject(err) : resolve(list))
  )
}

function readFileSftp(sftp: SFTPWrapper, remotePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = sftp.createReadStream(remotePath)
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
}

// Mirror of the local tryResolve in jsonl-parser.ts, but uses SFTP stat instead
// of fs.existsSync so it works with remote filesystems over SSH.
// Tries the longest possible segment first so that literal dashes in directory
// names (e.g. "claude-vertex") are preferred over treating them as separators.
async function tryResolveRemote(sftp: SFTPWrapper, base: string, remaining: string): Promise<string | null> {
  if (!remaining) return base

  const splits: number[] = [-1] // -1 = no split, try whole remaining string
  let i = remaining.indexOf('-')
  while (i !== -1) {
    splits.push(i)
    i = remaining.indexOf('-', i + 1)
  }

  for (let s = 0; s < splits.length; s++) {
    const dashIdx = splits[splits.length - 1 - s] // longest segment first
    const segment = dashIdx === -1 ? remaining : remaining.slice(0, dashIdx)
    if (!segment) continue
    const candidate = posixJoin(base, segment)
    if (await statSftp(sftp, candidate)) {
      if (dashIdx === -1) return candidate
      const deeper = await tryResolveRemote(sftp, candidate, remaining.slice(dashIdx + 1))
      if (deeper !== null) return deeper
    }
  }

  return null
}

async function resolveRemoteProjectPath(sftp: SFTPWrapper, encoded: string): Promise<string> {
  if (!encoded.startsWith('-')) return encoded.replace(/-/g, '/')
  const rest = encoded.slice(1)
  return (await tryResolveRemote(sftp, '/', rest)) ?? ('/' + rest.replace(/-/g, '/'))
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
  const dirs = entries.filter(e => (e.attrs.mode & 0o170000) === 0o040000) // S_IFDIR
  return Promise.all(
    dirs.map(async e => {
      const projectPath = await resolveRemoteProjectPath(conn.sftp, e.filename)
      return { encodedName: e.filename, projectPath, displayName: projectPath }
    })
  )
}

// ─── Remote codebase scanner ─────────────────────────────────────────────────
// Mirrors the logic in codebase-scanner.ts / dep-scanner.ts but uses SFTP
// for all filesystem operations instead of local fs calls.

const REMOTE_EXCLUDE = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '__pycache__',
  '.next', '.nuxt', 'coverage', '.cache', '.venv', 'venv',
])

const REMOTE_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', rs: 'rust',
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  go: 'go', rb: 'ruby', java: 'java',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  md: 'markdown', toml: 'toml', sh: 'shell',
  css: 'css', scss: 'css', html: 'html',
}
const REMOTE_PARSEABLE = new Set(['typescript', 'javascript', 'python', 'rust', 'c', 'cpp'])

function remoteLanguage(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? REMOTE_LANG_MAP[ext] : undefined
}

export async function scanRemoteCodebase(
  settings: RemoteSettings,
  projectPath: string,
  extraExclude?: string[],
): Promise<FsNode[]> {
  const conn = await acquireConnection(settings)
  const sftp = conn.sftp

  if (!await statSftp(sftp, projectPath)) return []

  const extraIg = extraExclude?.length ? ignore().add(extraExclude) : null
  const nodes: FsNode[] = []
  const filesToParse: Array<{ relPath: string; language: string }> = []

  const rootName = projectPath.split('/').filter(Boolean).pop() ?? projectPath
  nodes.push({ id: '', type: 'directory', name: rootName, path: '', children: [] })

  const igStack: Array<{ baseRel: string; ig: ReturnType<typeof ignore> }> = []

  async function loadRemoteGitignore(absPath: string): Promise<ReturnType<typeof ignore> | null> {
    try {
      const content = await readFileSftp(sftp, posixJoin(absPath, '.gitignore'))
      return ignore().add(content)
    } catch {
      return null
    }
  }

  const rootIg = await loadRemoteGitignore(projectPath)
  if (rootIg) igStack.push({ baseRel: '', ig: rootIg })

  function isIgnored(relPath: string): boolean {
    if (extraIg?.ignores(relPath)) return true
    for (const { baseRel, ig } of igStack) {
      const rel = baseRel ? relPath.slice(baseRel.length + 1) : relPath
      if (ig.ignores(rel)) return true
    }
    return false
  }

  async function walkRemote(absPath: string, relPath: string, parentId: string | undefined) {
    let pushedIg = false
    if (relPath !== '') {
      const dirIg = await loadRemoteGitignore(absPath)
      if (dirIg) { igStack.push({ baseRel: relPath, ig: dirIg }); pushedIg = true }
    }

    let entries: FileEntryWithStats[]
    try {
      entries = await readdirSftp(sftp, absPath)
    } catch {
      if (pushedIg) igStack.pop()
      return
    }

    const children: string[] = []
    const subdirs: Array<{ childAbs: string; childRel: string }> = []

    for (const entry of entries) {
      if (REMOTE_EXCLUDE.has(entry.filename) || entry.filename.startsWith('.')) continue
      const childRel = relPath ? `${relPath}/${entry.filename}` : entry.filename
      const childAbs = posixJoin(absPath, entry.filename)
      if (isIgnored(childRel)) continue

      const mode = entry.attrs.mode
      const isDir  = (mode & 0o170000) === 0o040000 // S_IFDIR
      const isFile = (mode & 0o170000) === 0o100000 // S_IFREG

      if (isDir) {
        nodes.push({ id: childRel, type: 'directory', name: entry.filename, path: childRel, parent: parentId, children: [] })
        children.push(childRel)
        subdirs.push({ childAbs, childRel })
      } else if (isFile) {
        const language = remoteLanguage(entry.filename)
        nodes.push({ id: childRel, type: 'file', name: entry.filename, path: childRel, parent: parentId, children: [], language })
        children.push(childRel)
        if (language && REMOTE_PARSEABLE.has(language)) filesToParse.push({ relPath: childRel, language })
      }
    }

    if (parentId !== undefined) {
      const parentNode = nodes.find(n => n.id === parentId)
      if (parentNode) parentNode.children.push(...children)
    }

    for (const { childAbs, childRel } of subdirs) await walkRemote(childAbs, childRel, childRel)
    if (pushedIg) igStack.pop()
  }

  await walkRemote(projectPath, '', '')

  // Extract symbols from remote source files in batches
  const CONCURRENCY = 8
  const nodeMap = new Map<string, FsNode>(nodes.map(n => [n.id, n]))

  async function processRemoteFile(info: { relPath: string; language: string }) {
    let content: string
    try { content = await readFileSftp(sftp, posixJoin(projectPath, info.relPath)) } catch { return }

    const symbols = await extractSymbolsFromContent(content, info.relPath, info.language)
    if (symbols.length === 0) return

    const fileNode = nodeMap.get(info.relPath)
    if (!fileNode) return

    const symNodeMap = new Map<string, FsNode>()
    for (const sym of symbols) {
      const nodeId = `${info.relPath}::${sym.id.slice(info.relPath.length + 2)}`
      const parentNodeId = sym.parent ? `${info.relPath}::${sym.parent.slice(info.relPath.length + 2)}` : undefined
      const symNode: FsNode = {
        id: nodeId, type: sym.kind, name: sym.name, path: info.relPath,
        parent: parentNodeId ?? info.relPath, children: [],
        language: info.language, startLine: sym.startLine, endLine: sym.endLine,
      }
      nodes.push(symNode)
      nodeMap.set(nodeId, symNode)
      symNodeMap.set(sym.id, symNode)

      if (parentNodeId) {
        const parentSym = symNodeMap.get(sym.parent!)
        if (parentSym) parentSym.children.push(nodeId)
        else fileNode.children.push(nodeId)
      } else {
        fileNode.children.push(nodeId)
      }
    }
  }

  for (let i = 0; i < filesToParse.length; i += CONCURRENCY) {
    await Promise.all(filesToParse.slice(i, i + CONCURRENCY).map(processRemoteFile))
  }

  return nodes
}

export async function scanRemoteDeps(
  settings: RemoteSettings,
  projectPath: string,
  filePaths: string[],
): Promise<DepEdge[]> {
  const conn = await acquireConnection(settings)
  const sftp = conn.sftp
  const knownFiles = new Set(filePaths)
  const seen = new Set<string>()
  const allEdges: DepEdge[] = []

  await Promise.all(filePaths.map(async relPath => {
    const ext = relPath.includes('.') ? `.${relPath.split('.').pop()}` : ''
    const isTsJs = TS_EXTENSIONS.includes(ext)
    const isPy = PY_EXTENSIONS.includes(ext)
    if (!isTsJs && !isPy) return

    let content: string
    try { content = await readFileSftp(sftp, posixJoin(projectPath, relPath)) } catch { return }

    const edges = isTsJs
      ? parseTsJsImports(relPath, content, projectPath, knownFiles)
      : parsePyImports(relPath, content, projectPath, knownFiles)

    for (const edge of edges) {
      const key = `${edge.source}→${edge.target}`
      if (!seen.has(key)) { seen.add(key); allEdges.push(edge) }
    }
  }))

  return allEdges
}

// ─── Session listing & loading ───────────────────────────────────────────────

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
