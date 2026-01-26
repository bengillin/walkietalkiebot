import { useEffect, useRef, useState, useMemo, useImperativeHandle, forwardRef } from 'react'
import type { Message, Conversation, MessageImage } from '../../types'
import { exportConversation } from '../../utils/export'
import { openUrl } from '../../lib/claude'
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

export interface ChatHistoryHandle {
  focusSearch: () => void
  openExportMenu: () => void
  isSearchFocused: () => boolean
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

function renderTextWithLinks(
  text: string,
  query: string,
  onOpenUrl: (url: string) => void
): React.ReactNode {
  // URL pattern
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]*[^\s<>"{}|\\^`[\].,:;!?)])/g

  // Split by URLs first
  const parts: Array<{ type: 'text' | 'url'; value: string }> = []
  let lastIndex = 0
  let match

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'url', value: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  // Helper to highlight search matches
  const highlightMatches = (str: string, idx: number): React.ReactNode => {
    if (!query.trim()) return str
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const segments = str.split(regex)
    return segments.map((seg, i) =>
      regex.test(seg) ? (
        <mark key={`${idx}-${i}`} className="chat-history__highlight">{seg}</mark>
      ) : (
        seg
      )
    )
  }

  return parts.map((part, i) => {
    if (part.type === 'url') {
      return (
        <a
          key={i}
          href={part.value}
          className="chat-history__link"
          onClick={(e) => {
            e.preventDefault()
            onOpenUrl(part.value)
          }}
          title={`Open ${part.value}`}
        >
          {highlightMatches(part.value, i)}
        </a>
      )
    }
    return <span key={i}>{highlightMatches(part.value, i)}</span>
  })
}

export const ChatHistory = forwardRef<ChatHistoryHandle, ChatHistoryProps>(function ChatHistory({
  messages,
  conversations,
  currentConversation,
  contextIds,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onToggleContext,
}, ref) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [showConversations, setShowConversations] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [lightbox, setLightbox] = useState<LightboxState>({ isOpen: false, image: null })
  const [searchQuery, setSearchQuery] = useState('')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1)

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      // Uncollapse if needed so search is visible
      if (isCollapsed) setIsCollapsed(false)
      // Focus search input after a tick to allow re-render
      setTimeout(() => searchInputRef.current?.focus(), 0)
    },
    openExportMenu: () => {
      if (isCollapsed) setIsCollapsed(false)
      setShowExportMenu(true)
    },
    isSearchFocused: () => document.activeElement === searchInputRef.current,
  }))

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages
    const query = searchQuery.toLowerCase()
    return messages.filter(m => m.content.toLowerCase().includes(query))
  }, [messages, searchQuery])

  const handleOpenUrl = async (url: string) => {
    try {
      await openUrl(url)
    } catch (err) {
      console.error('Failed to open URL:', err)
    }
  }

  useEffect(() => {
    if (!searchQuery) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, searchQuery])

  // Reset selected index when search query changes
  useEffect(() => {
    setSelectedResultIndex(-1)
  }, [searchQuery])

  // Scroll to selected result
  useEffect(() => {
    if (selectedResultIndex >= 0 && selectedResultIndex < filteredMessages.length) {
      const message = filteredMessages[selectedResultIndex]
      const el = messageRefs.current.get(message.id)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [selectedResultIndex, filteredMessages])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightbox.isOpen) {
        setLightbox({ isOpen: false, image: null })
      }

      // Arrow navigation when search input is focused and there are results
      if (document.activeElement === searchInputRef.current && searchQuery && filteredMessages.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedResultIndex(prev =>
            prev < filteredMessages.length - 1 ? prev + 1 : 0
          )
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedResultIndex(prev =>
            prev > 0 ? prev - 1 : filteredMessages.length - 1
          )
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightbox.isOpen, searchQuery, filteredMessages.length])

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

      {!isCollapsed && messages.length > 0 && (
        <div className="chat-history__toolbar">
          <div className="chat-history__search">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="chat-history__search-input"
            />
            {searchQuery && (
              <button
                className="chat-history__search-clear"
                onClick={() => setSearchQuery('')}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
          </div>
          <div className="chat-history__export">
            <button
              className="chat-history__export-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="Export conversation"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            </button>
            {showExportMenu && currentConversation && (
              <div className="chat-history__export-menu">
                <button onClick={() => { exportConversation(currentConversation, 'markdown'); setShowExportMenu(false); }}>
                  Markdown (.md)
                </button>
                <button onClick={() => { exportConversation(currentConversation, 'json'); setShowExportMenu(false); }}>
                  JSON (.json)
                </button>
                <button onClick={() => { exportConversation(currentConversation, 'text'); setShowExportMenu(false); }}>
                  Plain Text (.txt)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
          {searchQuery && (
            <div className="chat-history__search-results">
              {filteredMessages.length} of {messages.length} messages
            </div>
          )}
          {filteredMessages.map((message, index) => (
            <div
              key={message.id}
              ref={(el) => {
                if (el) messageRefs.current.set(message.id, el)
                else messageRefs.current.delete(message.id)
              }}
              className={`chat-history__message chat-history__message--${message.role}${searchQuery && selectedResultIndex === index ? ' chat-history__message--selected' : ''}`}
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
              <p className="chat-history__content">{renderTextWithLinks(message.content, searchQuery, handleOpenUrl)}</p>
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
})
