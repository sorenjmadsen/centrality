import React, { useEffect, useRef } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useSearchStore } from '../../stores/search-store'
import { useChatStore } from '../../stores/chat-store'
import { useUiStore } from '../../stores/ui-store'

export function SearchBar() {
  const { exchanges } = useChatStore()
  const { setSelectedExchange } = useUiStore()
  const { query, results, activeIdx, search, nextResult, prevResult, clearSearch } = useSearchStore()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (results.length > 0) {
      const result = results[activeIdx]
      if (result) {
        setSelectedExchange(result.exchangeId)
      }
    }
  }, [activeIdx, results])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    search(e.target.value, exchanges)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (e.shiftKey) prevResult()
      else nextResult()
    } else if (e.key === 'Escape') {
      clearSearch()
      inputRef.current?.blur()
    }
  }

  const hasResults = results.length > 0
  const hasQuery = query.length > 0

  return (
    <div className="flex items-center gap-1 w-[200px] relative">
      <div className="flex items-center gap-1 flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1
        focus-within:border-zinc-500 transition-colors">
        <Search size={11} className="text-zinc-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search…"
          className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-600
            focus:outline-none min-w-0"
        />
        {hasQuery && (
          <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
            {hasResults ? `${activeIdx + 1}/${results.length}` : '0'}
          </span>
        )}
        {hasQuery && (
          <button
            onClick={() => clearSearch()}
            className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
          >
            <X size={11} />
          </button>
        )}
      </div>
      {hasResults && (
        <>
          <button
            onClick={prevResult}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Previous result"
          >
            <ChevronUp size={13} />
          </button>
          <button
            onClick={nextResult}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Next result"
          >
            <ChevronDown size={13} />
          </button>
        </>
      )}
    </div>
  )
}
