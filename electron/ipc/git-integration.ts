import * as fs from 'fs'
import * as path from 'path'
import simpleGit from 'simple-git'
import { BrowserWindow } from 'electron'
import chokidar from 'chokidar'

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string          // ISO 8601
  changedFiles: string[] // relative paths
}

export interface GitDiff {
  commitHash: string
  unified: string
}

// --- Helpers ---

function isGitRepo(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, '.git'))
}

// --- Git log ---

export async function getGitLog(projectPath: string, historyDays?: number): Promise<GitCommit[]> {
  if (!isGitRepo(projectPath)) return []

  try {
    const git = simpleGit(projectPath)
    const countArg = historyDays != null ? `--after=${historyDays}.days.ago` : '--max-count=10'
    const rawOutput = await git.raw([
      'log',
      countArg,
      '--name-only',
      '--pretty=format:COMMIT|%H|%h|%aI|%an|%s',
    ])
    return parseGitLog(rawOutput)
  } catch {
    return []
  }
}

function parseGitLog(raw: string): GitCommit[] {
  const commits: GitCommit[] = []
  let current: GitCommit | null = null

  for (const line of raw.split('\n')) {
    if (line.startsWith('COMMIT|')) {
      if (current) commits.push(current)
      const parts = line.split('|')
      current = {
        hash: parts[1] ?? '',
        shortHash: parts[2] ?? '',
        date: parts[3] ?? '',
        author: parts[4] ?? '',
        message: parts.slice(5).join('|'),
        changedFiles: [],
      }
    } else if (current && line.trim() && !line.startsWith('COMMIT')) {
      current.changedFiles.push(line.trim())
    }
  }

  if (current) commits.push(current)
  return commits
}

// --- Git diff for a commit ---

export async function getGitDiff(projectPath: string, commitHash: string): Promise<GitDiff> {
  if (!isGitRepo(projectPath)) return { commitHash, unified: '' }

  try {
    const git = simpleGit(projectPath)
    const unified = await git.raw(['show', '--unified=3', '--no-color', commitHash])
    return { commitHash, unified }
  } catch {
    return { commitHash, unified: '' }
  }
}

// --- Inline diff from old_string / new_string (Edit tool calls) ---

export function makeInlineDiff(oldStr: string, newStr: string, filePath: string): string {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const header = [`--- a/${filePath}`, `+++ b/${filePath}`]
  const hunks = computeHunks(oldLines, newLines)
  return [header.join('\n'), ...hunks].join('\n')
}

// --- Minimal LCS-based unified diff ---

function computeHunks(oldLines: string[], newLines: string[]): string[] {
  const CONTEXT = 3
  const ops = buildOps(oldLines, newLines)

  const result: string[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i].kind === 'equal') { i++; continue }

    const start = i
    let end = i
    while (end < ops.length && ops[end].kind !== 'equal') end++

    const ctxBefore = Math.max(0, start - CONTEXT)
    const ctxAfter = Math.min(ops.length, end + CONTEXT)
    const hunkOps = ops.slice(ctxBefore, ctxAfter)

    const oldStart = ops.slice(0, ctxBefore).filter(o => o.kind !== 'insert').length + 1
    const newStart = ops.slice(0, ctxBefore).filter(o => o.kind !== 'delete').length + 1
    const oldCount = hunkOps.filter(o => o.kind !== 'insert').length
    const newCount = hunkOps.filter(o => o.kind !== 'delete').length

    result.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`)
    for (const op of hunkOps) {
      const prefix = op.kind === 'equal' ? ' ' : op.kind === 'delete' ? '-' : '+'
      result.push(`${prefix}${op.text}`)
    }

    i = ctxAfter
  }

  return result
}

interface Op { kind: 'equal' | 'delete' | 'insert'; text: string }

function buildOps(oldL: string[], newL: string[]): Op[] {
  const lcs = computeLCS(oldL, newL)
  const ops: Op[] = []
  let oi = 0, ni = 0, li = 0

  while (li < lcs.length) {
    while (oi < oldL.length && oldL[oi] !== lcs[li]) { ops.push({ kind: 'delete', text: oldL[oi++] }) }
    while (ni < newL.length && newL[ni] !== lcs[li]) { ops.push({ kind: 'insert', text: newL[ni++] }) }
    ops.push({ kind: 'equal', text: lcs[li++] })
    oi++; ni++
  }
  while (oi < oldL.length) ops.push({ kind: 'delete', text: oldL[oi++] })
  while (ni < newL.length) ops.push({ kind: 'insert', text: newL[ni++] })
  return ops
}

function computeLCS(a: string[], b: string[]): string[] {
  // Cap at 300 lines each to avoid O(n²) blowup on huge diffs
  const al = a.slice(0, 300), bl = b.slice(0, 300)
  const m = al.length, n = bl.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = al[i-1] === bl[j-1]
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1])
    }
  }
  const result: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (al[i-1] === bl[j-1]) { result.unshift(al[i-1]); i--; j-- }
    else if (dp[i-1][j] > dp[i][j-1]) i--
    else j--
  }
  return result
}

// --- .git/HEAD watcher ---

let headWatcher: ReturnType<typeof chokidar.watch> | null = null

export function startGitWatcher(projectPath: string): () => void {
  stopGitWatcher()
  if (!isGitRepo(projectPath)) return () => {}

  const headPath = path.join(projectPath, '.git', 'HEAD')
  headWatcher = chokidar.watch(headPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  })

  headWatcher.on('change', async () => {
    const commits = await getGitLog(projectPath)
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('git:head-changed', commits)
    })
  })

  return stopGitWatcher
}

export function stopGitWatcher(): void {
  headWatcher?.close().catch(() => {})
  headWatcher = null
}
