import { create } from 'zustand'
import type { ChatExchange } from '../types/chat'

export interface SearchResult {
  exchangeId: string
  snippet: string
}

interface SearchStore {
  query: string
  results: SearchResult[]
  activeIdx: number
  search(q: string, exchanges: ChatExchange[]): void
  nextResult(): void
  prevResult(): void
  clearSearch(): void
}

function getSnippet(text: string, query: string, maxLen = 80): string {
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, maxLen)
  const start = Math.max(0, idx - 20)
  const end = Math.min(text.length, idx + query.length + 40)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  query: '',
  results: [],
  activeIdx: 0,

  search(q: string, exchanges: ChatExchange[]) {
    if (!q.trim()) {
      set({ query: q, results: [], activeIdx: 0 })
      return
    }
    const lower = q.toLowerCase()
    const results: SearchResult[] = []

    for (const ex of exchanges) {
      const userText = ex.userMessage.textContent
      const assistantText = ex.assistantMessage.textContent
      const toolInputs = ex.assistantMessage.toolCalls
        .map(tc => JSON.stringify(tc.input))
        .join(' ')

      const combined = `${userText} ${assistantText} ${toolInputs}`
      if (combined.toLowerCase().includes(lower)) {
        // Pick best snippet
        let snippet = ''
        if (userText.toLowerCase().includes(lower)) {
          snippet = getSnippet(userText, q)
        } else if (assistantText.toLowerCase().includes(lower)) {
          snippet = getSnippet(assistantText, q)
        } else {
          snippet = getSnippet(toolInputs, q)
        }
        results.push({ exchangeId: ex.id, snippet })
      }
    }

    set({ query: q, results, activeIdx: 0 })
  },

  nextResult() {
    const { results, activeIdx } = get()
    if (results.length === 0) return
    set({ activeIdx: (activeIdx + 1) % results.length })
  },

  prevResult() {
    const { results, activeIdx } = get()
    if (results.length === 0) return
    set({ activeIdx: (activeIdx - 1 + results.length) % results.length })
  },

  clearSearch() {
    set({ query: '', results: [], activeIdx: 0 })
  },
}))
