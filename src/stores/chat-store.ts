import { create } from 'zustand'
import type { ChatExchange } from '../types/chat'

interface ChatStore {
  exchanges: ChatExchange[]
  isLoading: boolean

  setExchanges(exchanges: ChatExchange[]): void
  clear(): void
}

export const useChatStore = create<ChatStore>(set => ({
  exchanges: [],
  isLoading: false,

  setExchanges: exchanges => set({ exchanges }),
  clear: () => set({ exchanges: [] }),
}))
