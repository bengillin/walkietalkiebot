import { useEffect, useRef } from 'react'
import type { Message } from '../../types'
import './ChatHistory.css'

interface ChatHistoryProps {
  messages: Message[]
  isCollapsed: boolean
  onToggle: () => void
}

export function ChatHistory({ messages, isCollapsed, onToggle }: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return null
  }

  return (
    <div className={`chat-history ${isCollapsed ? 'chat-history--collapsed' : ''}`}>
      <button className="chat-history__toggle" onClick={onToggle}>
        <span>{isCollapsed ? 'Show' : 'Hide'} history</span>
        <span className="chat-history__count">{messages.length}</span>
      </button>

      {!isCollapsed && (
        <div className="chat-history__messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`chat-history__message chat-history__message--${message.role}`}
            >
              <span className="chat-history__role">
                {message.role === 'user' ? 'You' : 'Talkboy'}
              </span>
              <p className="chat-history__content">{message.content}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
