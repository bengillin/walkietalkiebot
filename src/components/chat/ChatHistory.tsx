import { useEffect, useRef, useState } from 'react'
import type { Message, Conversation } from '../../types'
import './ChatHistory.css'

interface ChatHistoryProps {
  messages: Message[]
  conversations: Conversation[]
  currentConversation: Conversation | undefined
  contextIds: string[]
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  onToggleContext: (id: string) => void
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function ChatHistory({
  messages,
  conversations,
  currentConversation,
  contextIds,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onToggleContext,
}: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showConversations, setShowConversations] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const otherConversations = conversations.filter(c => c.id !== currentConversation?.id)

  return (
    <div className={`chat-history ${isCollapsed ? 'chat-history--collapsed' : ''}`}>
      <div className="chat-history__header">
        <button
          className="chat-history__conversation-btn"
          onClick={() => setShowConversations(!showConversations)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
          <span className="chat-history__title">
            {currentConversation?.title || 'New conversation'}
          </span>
          {contextIds.length > 0 && (
            <span className="chat-history__context-badge">+{contextIds.length}</span>
          )}
          <svg
            className={`chat-history__chevron ${showConversations ? 'chat-history__chevron--open' : ''}`}
            viewBox="0 0 24 24"
            fill="currentColor"
            width="16"
            height="16"
          >
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </button>

        <button
          className="chat-history__toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Show messages' : 'Hide messages'}
        >
          {messages.length > 0 && (
            <span className="chat-history__count">{messages.length}</span>
          )}
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            {isCollapsed ? (
              <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
            ) : (
              <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
            )}
          </svg>
        </button>
      </div>

      {showConversations && (
        <div className="chat-history__conversations">
          <button
            className="chat-history__new-btn"
            onClick={() => { onNewConversation(); setShowConversations(false); }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            New conversation
          </button>

          {otherConversations.length > 0 && (
            <div className="chat-history__conversation-list">
              <span className="chat-history__list-hint">Click to switch, checkbox for context</span>
              {otherConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`chat-history__conversation-item ${contextIds.includes(conv.id) ? 'chat-history__conversation-item--context' : ''}`}
                >
                  <label className="chat-history__checkbox">
                    <input
                      type="checkbox"
                      checked={contextIds.includes(conv.id)}
                      onChange={() => onToggleContext(conv.id)}
                    />
                    <span className="chat-history__checkmark" />
                  </label>
                  <button
                    className="chat-history__conversation-content"
                    onClick={() => { onSelectConversation(conv.id); setShowConversations(false); }}
                  >
                    <span className="chat-history__conversation-title">{conv.title}</span>
                    <span className="chat-history__conversation-meta">
                      {conv.messages.length} msgs · {formatDate(conv.updatedAt)}
                    </span>
                  </button>
                  <button
                    className="chat-history__delete-btn"
                    onClick={() => onDeleteConversation(conv.id)}
                    title="Delete"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isCollapsed && messages.length > 0 && (
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
