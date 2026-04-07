import { execFile } from 'child_process'
import * as fs from 'fs'
import { REMOTE_PATH_PREFIX } from './ssh-manager'

export interface ResumeSessionArgs {
  sessionId: string
  projectPath: string
}

export type ResumeSessionResult =
  | { ok: true }
  | { ok: false; error: string }

const SESSION_ID_RE = /^[a-f0-9-]{36}$/i

/** Launches a terminal window running `claude --resume <sessionId>` in the
 *  project cwd. Supports macOS (Terminal.app via osascript) and Windows
 *  (Windows Terminal with a cmd.exe fallback). Validates inputs before
 *  shelling out. */
export function resumeSession(args: ResumeSessionArgs): Promise<ResumeSessionResult> {
  const { sessionId, projectPath } = args ?? ({} as ResumeSessionArgs)

  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return Promise.resolve({ ok: false, error: 'Resume is currently only supported on macOS and Windows' })
  }
  if (typeof projectPath !== 'string' || !projectPath) {
    return Promise.resolve({ ok: false, error: 'Missing projectPath' })
  }
  if (projectPath.startsWith(REMOTE_PATH_PREFIX)) {
    return Promise.resolve({ ok: false, error: 'Remote resume not yet supported' })
  }
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
    return Promise.resolve({ ok: false, error: 'Invalid sessionId' })
  }
  // Reject paths with control chars, quotes, or null bytes. These can't
  // appear in well-formed filesystem paths on either platform and would
  // complicate safe quoting downstream.
  if (/[\x00-\x1f"]/.test(projectPath)) {
    return Promise.resolve({ ok: false, error: 'projectPath contains invalid characters' })
  }
  if (!fs.existsSync(projectPath)) {
    return Promise.resolve({ ok: false, error: `Project directory does not exist: ${projectPath}` })
  }

  if (process.platform === 'darwin') {
    return launchMac(projectPath, sessionId)
  }
  return launchWindows(projectPath, sessionId)
}

function launchMac(projectPath: string, sessionId: string): Promise<ResumeSessionResult> {
  // Pass projectPath and sessionId as argv to osascript rather than
  // interpolating them into AppleScript or shell source. `quoted form of` is
  // AppleScript's own shell-safe quoter, so neither shell metacharacters
  // (`$`, backticks, `;`) nor AppleScript string delimiters in projectPath
  // can escape their value slot. The sessionId regex above is defense in
  // depth — this structure is the actual barrier.
  const script = [
    'on run argv',
    '  set projPath to item 1 of argv',
    '  set sid to item 2 of argv',
    '  tell application "Terminal"',
    '    activate',
    '    do script ("cd " & quoted form of projPath & " && claude --resume " & sid)',
    '  end tell',
    'end run',
  ].join('\n')

  return new Promise(resolve => {
    execFile('osascript', ['-e', script, projectPath, sessionId], (err) => {
      if (err) resolve({ ok: false, error: err.message })
      else resolve({ ok: true })
    })
  })
}

function launchWindows(projectPath: string, sessionId: string): Promise<ResumeSessionResult> {
  // Try Windows Terminal first (ships with Windows 11, installable on 10).
  // `-d` sets the starting directory; remaining argv is the commandline to
  // run inside the new tab. Node's execFile handles argv → command-line
  // escaping for us, so projectPath is passed as data, not concatenated.
  // sessionId is UUID-shape (regex enforced) so it has no metacharacters.
  return new Promise(resolve => {
    execFile(
      'wt.exe',
      ['-d', projectPath, 'claude', '--resume', sessionId],
      { windowsHide: true },
      (err) => {
        if (!err) {
          resolve({ ok: true })
          return
        }
        // wt.exe not installed (ENOENT) or failed — fall back to cmd.exe.
        // `start "" /d <path> cmd /k <cmd>` opens a new console window with
        // the given working dir and runs the command, keeping the window
        // open after it exits. The "" is the (empty) window title that
        // `start` requires when any later arg is quoted.
        execFile(
          'cmd.exe',
          ['/c', 'start', '', '/d', projectPath, 'cmd', '/k', `claude --resume ${sessionId}`],
          { windowsHide: true },
          (err2) => {
            if (err2) resolve({ ok: false, error: err2.message })
            else resolve({ ok: true })
          },
        )
      },
    )
  })
}
