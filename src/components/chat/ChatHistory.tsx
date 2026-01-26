import { useEffect, useRef, useState } from 'react'
import type { Message, Conversation, MessageImage } from '../../types'
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

interface LightboxState {
  isOpen: boolean
  image: MessageImage | null
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
  const [lightbox, setLightbox] = useState<LightboxState>({ isOpen: false, image: null })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightbox.isOpen) {
        setLightbox({ isOpen: false, image: null })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightbox.isOpen])

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
              {message.images && message.images.length > 0 && (
                <div className="chat-history__images">
                  {message.images.map((img) => (
                    <div key={img.id} className="chat-history__image-container">
                      <img
                        src={img.dataUrl}
                        alt={img.fileName}
                        className="chat-history__image-thumb"
                        onClick={() => setLightbox({ isOpen: true, image: img })}
                      />
                      {img.description && (
                        <p className="chat-history__image-analysis">{img.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="chat-history__content">{message.content}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {lightbox.isOpen && lightbox.image && (
        <div
          className="chat-history__lightbox"
          onClick={() => setLightbox({ isOpen: false, image: null })}
        >
          <div
            className="chat-history__lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="chat-history__lightbox-close"
              onClick={() => setLightbox({ isOpen: false, image: null })}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
            <div className="chat-history__lightbox-main">
              <img
                src={lightbox.image.dataUrl}
                alt={lightbox.image.fileName}
                className="chat-history__lightbox-image"
              />
            </div>
            <div className="chat-history__lightbox-sidebar">
              <span className="chat-history__lightbox-filename">{lightbox.image.fileName}</span>
              <h3 className="chat-history__lightbox-heading">Analysis</h3>
              {lightbox.image.description ? (
                <p className="chat-history__lightbox-description">{lightbox.image.description}</p>
              ) : (
                <p className="chat-history__lightbox-no-analysis">No analysis available</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
