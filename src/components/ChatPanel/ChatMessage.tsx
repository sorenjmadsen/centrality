import React, { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType } from '../../types/chat'
import { ExchangeChangeSummary } from './ExchangeChangeSummary'

const COLLAPSE_THRESHOLD = 300 // chars

interface ChatMessageProps {
  message: ChatMessageType
  isHighlighted?: boolean
}

export function ChatMessageBubble({ message, isHighlighted }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const isLong = (message.textContent?.length ?? 0) > COLLAPSE_THRESHOLD
  const [expanded, setExpanded] = useState(false)

  const displayText = isLong && !expanded
    ? message.textContent!.slice(0, COLLAPSE_THRESHOLD) + '…'
    : message.textContent

  return (
    <div className={`text-sm ${isHighlighted ? 'bg-zinc-800/50 rounded-lg p-1 -mx-1' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-xs font-semibold uppercase tracking-wide ${
          isUser ? 'text-zinc-500' : 'text-zinc-400'
        }`}>
          {isUser ? 'User' : (message.model?.split('-').slice(0, 2).join('-') ?? 'Claude')}
        </span>
        <span className="text-xs text-zinc-700">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {displayText && (
        <div>
          <div className={`prose prose-invert prose-sm max-w-none text-zinc-300
            prose-p:my-1
            prose-ul:my-1 prose-ol:my-1 prose-li:my-0
            prose-headings:text-zinc-200 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
            prose-blockquote:border-zinc-600 prose-blockquote:text-zinc-400
            prose-hr:border-zinc-700
            prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            prose-strong:text-zinc-200
            prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700 prose-pre:rounded-md
            prose-code:text-zinc-300 prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
            prose-table:text-zinc-300 prose-thead:border-zinc-600 prose-tbody:divide-zinc-700 prose-th:text-zinc-200
          `}>
            <Markdown remarkPlugins={[remarkGfm]}>{displayText}</Markdown>
          </div>
          {isLong && (
            <button
              className="text-xs text-zinc-500 hover:text-zinc-300 mt-0.5"
              onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <ExchangeChangeSummary toolCalls={message.toolCalls} />
    </div>
  )
}
