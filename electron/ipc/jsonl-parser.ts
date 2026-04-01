import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import * as os from 'os'

export interface ProjectInfo {
  encodedName: string
  projectPath: string
  displayName: string
}

export interface SessionInfo {
  sessionId: string
  filePath: string
  mtime: number
}

export interface ToolCallEntry {
  id: string
  toolName: string
  input: Record<string, unknown>
  result?: string
  affectedFiles: string[]
}

export interface ClaudeAction {
  id: string
  sessionId: string
  timestamp: string
  type: string
  filePath?: string
  toolName: string
  input: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  timestamp: string
  textContent: string
  toolCalls: ToolCallEntry[]
  model?: string
  tokenUsage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
}

export interface ChatMarker {
  id: string
  type: 'compaction' | 'model_switch' | 'command'
  timestamp: string
  details?: string   // command name or model change description
  output?: string    // command stdout (for 'command' type)
}

export interface ChatExchange {
  id: string
  userMessage: ChatMessage
  assistantMessage: ChatMessage
  actions: ClaudeAction[]
  affectedNodes: string[]
}

export interface ParsedSession {
  actions: ClaudeAction[]
  exchanges: ChatExchange[]
  markers: ChatMarker[]
  sessionId: string
}

// Resolve encoded project path (/-separated path stored as --separated string)
// e.g. -home-user-my-project → tries /home/user/my-project on filesystem
function resolveProjectPath(encoded: string): string {
  if (!encoded.startsWith('-')) return encoded.replace(/-/g, '/')
  const rest = encoded.slice(1) // remove leading dash
  return tryResolve('/', rest) ?? ('/' + rest.replace(/-/g, '/'))
}

function tryResolve(base: string, remaining: string): string | null {
  if (!remaining) return base
  let searchFrom = 0
  while (true) {
    const dashIdx = remaining.indexOf('-', searchFrom)
    const segment = dashIdx === -1 ? remaining : remaining.slice(0, dashIdx)
    if (!segment) { searchFrom = dashIdx + 1; if (dashIdx === -1) break; continue }
    const candidate = path.join(base, segment)
    if (fs.existsSync(candidate)) {
      if (dashIdx === -1) return candidate
      const deeper = tryResolve(candidate, remaining.slice(dashIdx + 1))
      if (deeper !== null) return deeper
    }
    if (dashIdx === -1) break
    searchFrom = dashIdx + 1
  }
  return null
}

export async function listProjects(claudeDir?: string): Promise<ProjectInfo[]> {
  const dir = claudeDir ?? path.join(os.homedir(), '.claude', 'projects')
  try {
    await fs.promises.access(dir)
  } catch {
    return []
  }

  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const projectPath = resolveProjectPath(e.name)
      return { encodedName: e.name, projectPath, displayName: projectPath }
    })
}

export async function listSessions(encodedName: string, claudeDir?: string): Promise<SessionInfo[]> {
  const projectsDir = claudeDir ?? path.join(os.homedir(), '.claude', 'projects')
  const sessionDir = path.join(projectsDir, encodedName)
  try {
    await fs.promises.access(sessionDir)
  } catch {
    return []
  }

  const files = (await fs.promises.readdir(sessionDir)).filter(f => f.endsWith('.jsonl'))
  const results = await Promise.all(
    files.map(async f => {
      const filePath = path.join(sessionDir, f)
      const stat = await fs.promises.stat(filePath)
      return { sessionId: f.replace('.jsonl', ''), filePath, mtime: stat.mtimeMs }
    })
  )
  return results.sort((a, b) => b.mtime - a.mtime)
}

function inferActionType(toolName: string, input: Record<string, unknown>, result?: string): string {
  switch (toolName) {
    case 'Read': return 'read'
    case 'Write': {
      const content = input['content'] as string | undefined
      if (content !== undefined && content.length === 0) return 'deleted'
      // The tool result reliably tells us whether the file was new or existing.
      // "File created successfully at:" → created; "has been updated successfully" → edited.
      if (result) {
        if (/created successfully/i.test(result)) return 'created'
        if (/updated successfully/i.test(result)) return 'edited'
      }
      // No result available — default to 'edited' (safer: most Writes overwrite existing files)
      return 'edited'
    }
    case 'Edit':
    case 'MultiEdit': return 'edited'
    case 'Bash': {
      const cmd = (input['command'] as string | undefined) ?? ''
      if (/\brm\b/.test(cmd)) return 'deleted'
      if (/\bmv\b/.test(cmd)) return 'edited'
      if (/\bmkdir\b|\btouch\b/.test(cmd)) return 'created'
      if (/\bcat\b/.test(cmd)) return 'read'
      return 'executed'
    }
    case 'Glob':
    case 'Grep':
    case 'LS': return 'searched'
    case 'Agent': return 'spawned'
    default: return 'executed'
  }
}

function extractFilePath(toolName: string, input: Record<string, unknown>): string | undefined {
  if (input['file_path']) return input['file_path'] as string
  if (toolName === 'LS' && input['path']) return input['path'] as string
  return undefined
}

interface RawEntry {
  type: string
  uuid?: string
  parentUuid?: string
  timestamp?: string
  sessionId?: string
  summary?: string
  isMeta?: boolean
  message?: {
    role?: string
    model?: string
    content?: unknown
    usage?: Record<string, number>
  }
}

export async function parseSession(filePath: string): Promise<ParsedSession> {
  const sessionId = path.basename(filePath, '.jsonl')
  const actions: ClaudeAction[] = []
  const markers: ChatMarker[] = []

  // Read all entries
  const entries: RawEntry[] = []
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!line.trim()) continue
    try { entries.push(JSON.parse(line)) } catch { /* skip malformed */ }
  }

  // Collect compaction markers from summary entries
  for (const e of entries) {
    if (e.type === 'summary' && e.timestamp) {
      const summaryText = e.summary ??
        (Array.isArray(e.message?.content)
          ? (e.message!.content as Record<string, unknown>[])
              .filter(b => b['type'] === 'text')
              .map(b => b['text'])
              .join(' ')
          : typeof e.message?.content === 'string'
            ? e.message.content
            : '')
      markers.push({
        id: e.uuid ?? `summary-${e.timestamp}`,
        type: 'compaction',
        timestamp: e.timestamp,
        details: (summaryText as string).slice(0, 120) || undefined,
      })
    }
  }

  // Only care about user and assistant entries
  const relevant = entries.filter(e => e.type === 'user' || e.type === 'assistant')

  // Build tool_use id → result map from tool_result user entries
  const toolResults = new Map<string, string>()
  for (const e of relevant) {
    if (e.type !== 'user') continue
    const content = e.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content as Record<string, unknown>[]) {
      if (block['type'] === 'tool_result') {
        const id = block['tool_use_id'] as string
        const result = block['content']
        toolResults.set(id, typeof result === 'string' ? result : JSON.stringify(result))
      }
    }
  }

  // Group into exchanges: each starts with a human user message (content=string)
  const exchanges: ChatExchange[] = []
  let pendingUserMsg: ChatMessage | null = null
  let pendingAssistantToolCalls: ToolCallEntry[] = []
  let pendingAssistantText = ''
  let pendingAssistantModel: string | undefined
  let pendingAssistantUsage: { input: number; output: number; cacheRead?: number; cacheWrite?: number } | undefined
  let pendingAssistantId = ''
  let pendingAssistantTs = ''

  function flushExchange() {
    if (!pendingUserMsg) return
    const assistantMsg: ChatMessage = {
      id: pendingAssistantId || pendingUserMsg.id + '-assistant',
      role: 'assistant',
      timestamp: pendingAssistantTs || pendingUserMsg.timestamp,
      textContent: pendingAssistantText.trim(),
      toolCalls: pendingAssistantToolCalls,
      model: pendingAssistantModel,
      tokenUsage: pendingAssistantUsage,
    }
    const exchangeActions = pendingAssistantToolCalls
      .map(tc => {
        const fp = extractFilePath(tc.toolName, tc.input)
        const action: ClaudeAction = {
          id: tc.id,
          sessionId,
          timestamp: pendingUserMsg!.timestamp,
          type: inferActionType(tc.toolName, tc.input, tc.result),
          filePath: fp,
          toolName: tc.toolName,
          input: tc.input,
        }
        return action
      })
    actions.push(...exchangeActions)
    const affectedNodes = Array.from(
      new Set(exchangeActions.map(a => a.filePath).filter((p): p is string => !!p))
    )
    exchanges.push({
      id: pendingUserMsg.id,
      userMessage: pendingUserMsg,
      assistantMessage: assistantMsg,
      actions: exchangeActions,
      affectedNodes,
    })
    pendingUserMsg = null
    pendingAssistantToolCalls = []
    pendingAssistantText = ''
    pendingAssistantModel = undefined
    pendingAssistantUsage = undefined
    pendingAssistantId = ''
    pendingAssistantTs = ''
  }

  // Track last command marker so we can attach stdout to it
  let lastCommandMarker: ChatMarker | null = null

  for (const e of relevant) {
    const content = e.message?.content
    const ts = e.timestamp ?? ''

    if (e.type === 'user') {
      // Skip meta entries entirely
      if (e.isMeta) continue

      if (typeof content === 'string' && content.trim()) {
        const text = content.trim()

        // Detect slash commands: <command-name>...</command-name>
        if (text.startsWith('<command-name>') || text.startsWith('<local-command-caveat>')) {
          const cmdMatch = text.match(/<command-name>([^<]*)<\/command-name>/)
          if (cmdMatch) {
            lastCommandMarker = {
              id: e.uuid ?? `cmd-${ts}`,
              type: 'command',
              timestamp: ts,
              details: cmdMatch[1].trim(),
            }
            markers.push(lastCommandMarker)
          }
          continue
        }

        // Detect command stdout: <local-command-stdout>...</local-command-stdout>
        if (text.startsWith('<local-command-stdout>')) {
          const stdoutMatch = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)
          if (stdoutMatch && lastCommandMarker) {
            lastCommandMarker.output = stdoutMatch[1].trim()
          }
          continue
        }

        // Reset command tracking — we're past the command/stdout pair
        lastCommandMarker = null

        // Human message — close previous exchange, start new one
        flushExchange()
        pendingUserMsg = {
          id: e.uuid ?? '',
          role: 'user',
          timestamp: ts,
          textContent: text,
          toolCalls: [],
        }
      }
      // tool_result entries are already handled in toolResults map above
    } else if (e.type === 'assistant' && Array.isArray(content)) {
      for (const block of content as Record<string, unknown>[]) {
        if (block['type'] === 'text') {
          const newText = (block['text'] as string) ?? ''
          if (newText) {
            pendingAssistantText = pendingAssistantText
              ? pendingAssistantText + '\n\n' + newText
              : newText
          }
          if (!pendingAssistantId) pendingAssistantId = e.uuid ?? ''
          if (!pendingAssistantTs) pendingAssistantTs = ts
        } else if (block['type'] === 'tool_use') {
          const toolName = block['name'] as string
          const input = (block['input'] as Record<string, unknown>) ?? {}
          const id = block['id'] as string
          const tc: ToolCallEntry = {
            id, toolName, input,
            result: toolResults.get(id),
            affectedFiles: extractFilePath(toolName, input) ? [extractFilePath(toolName, input)!] : [],
          }
          pendingAssistantToolCalls.push(tc)
          if (!pendingAssistantId) pendingAssistantId = e.uuid ?? ''
          if (!pendingAssistantTs) pendingAssistantTs = ts
        }
      }
      if (e.message?.model) pendingAssistantModel = e.message.model
      if (e.message?.usage) {
        const u = e.message.usage
        pendingAssistantUsage = {
          input: u['input_tokens'] ?? 0,
          output: u['output_tokens'] ?? 0,
          cacheRead: u['cache_read_input_tokens'] ?? undefined,
          cacheWrite: u['cache_creation_input_tokens'] ?? undefined,
        }
      }
    }
  }
  flushExchange()

  // Detect model switches between consecutive exchanges
  for (let i = 1; i < exchanges.length; i++) {
    const prevModel = exchanges[i - 1].assistantMessage.model
    const curModel = exchanges[i].assistantMessage.model
    if (prevModel && curModel && prevModel !== curModel) {
      markers.push({
        id: `model-switch-${i}`,
        type: 'model_switch',
        timestamp: exchanges[i].userMessage.timestamp,
        details: `${prevModel} → ${curModel}`,
      })
    }
  }

  // Sort markers by timestamp
  markers.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  return { actions, exchanges, markers, sessionId }
}
