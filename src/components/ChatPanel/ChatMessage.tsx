import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage as ChatMessageType } from '../../types/chat'
import { ToolCallBlock } from './ToolCallBlock'

interface ChatMessageProps {
  message: ChatMessageType
  isHighlighted?: boolean
}

export function ChatMessageBubble({ message, isHighlighted }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`text-sm ${isHighlighted ? 'bg-zinc-800/50 rounded-lg p-1 -mx-1' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${
          isUser ? 'text-zinc-500' : 'text-zinc-400'
        }`}>
          {isUser ? 'User' : (message.model?.split('-').slice(0, 2).join('-') ?? 'Claude')}
        </span>
        <span className="text-[10px] text-zinc-700">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
        {message.tokenUsage && (
          <span className="text-[10px] text-zinc-700 ml-auto">
            {message.tokenUsage.input.toLocaleString()} / {message.tokenUsage.output.toLocaleString()} tok
          </span>
        )}
      </div>

      {message.textContent && (
        <div className={`prose prose-invert prose-sm max-w-none text-zinc-300
          prose-p:my-1 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700
          prose-code:text-zinc-300 prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded
          prose-headings:text-zinc-200
        `}>
          <Markdown remarkPlugins={[remarkGfm]}>{message.textContent}</Markdown>
        </div>
      )}

      {message.toolCalls.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {message.toolCalls.map(tc => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  )
}
