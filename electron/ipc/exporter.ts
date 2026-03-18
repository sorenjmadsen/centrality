import { dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'

export interface ExchangeExportItem {
  index: number
  userText: string
  assistantText: string
  actions: Array<{ toolName: string; filePath?: string }>
}

export async function exportMarkdown(
  projectPath: string,
  sessionPath: string,
  exchanges: ExchangeExportItem[]
): Promise<{ success: boolean; filePath?: string }> {
  const win = BrowserWindow.getAllWindows()[0]
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: 'Export Session as Markdown',
    defaultPath: 'session-export.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })

  if (canceled || !filePath) return { success: false }

  const date = new Date().toISOString().split('T')[0]
  const lines: string[] = [
    '# Session Export',
    '',
    `**Project:** ${projectPath}`,
    `**Session:** ${sessionPath}`,
    `**Date:** ${date}`,
    '',
    '---',
    '',
  ]

  for (const ex of exchanges) {
    lines.push(`## Exchange ${ex.index + 1}`)
    lines.push('')
    lines.push(`**User:** ${ex.userText}`)
    lines.push('')
    lines.push(`**Assistant:** ${ex.assistantText}`)
    lines.push('')
    if (ex.actions.length > 0) {
      lines.push('**Actions:**')
      for (const a of ex.actions) {
        lines.push(`- ${a.toolName}${a.filePath ? `: ${a.filePath}` : ''}`)
      }
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  }

  writeFileSync(filePath, lines.join('\n'), 'utf8')
  return { success: true, filePath }
}

export async function captureScreenshot(): Promise<{ success: boolean; filePath?: string }> {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return { success: false }

  const image = await win.webContents.capturePage()
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save Screenshot',
    defaultPath: 'claude-vertex-screenshot.png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  })

  if (canceled || !filePath) return { success: false }

  writeFileSync(filePath, image.toPNG())
  return { success: true, filePath }
}
