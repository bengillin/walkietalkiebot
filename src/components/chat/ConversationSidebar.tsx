import { Conversation } from '../../types'
import './ConversationSidebar.css'

interface ConversationSidebarProps {
  conversations: Conversation[]
  currentConversationId: string
  contextIds: string[]
  isOpen: boolean
  onClose: () => void
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  onToggleContext: (id: string) => void
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  contextIds,
  isOpen,
  onClose,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onToggleContext,
}: ConversationSidebarProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' })
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="conversation-dropdown-backdrop" onClick={onClose} />

      {/* Dropdown panel */}
      <div className="conversation-dropdown-panel">
        <button className="dropdown-new-btn" onClick={onNewConversation}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          New Conversation
        </button>

        <div className="dropdown-list">
          {conversations.length === 0 ? (
            <div className="dropdown-empty">No conversations yet</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`dropdown-item ${conv.id === currentConversationId ? 'active' : ''}`}
              >
                <button
                  className="dropdown-item-main"
                  onClick={() => onSelectConversation(conv.id)}
                >
                  <div className="dropdown-item-title">{conv.title || 'New conversation'}</div>
                  <div className="dropdown-item-meta">
                    <span>{conv.messages.length} messages</span>
                    <span>{formatDate(conv.updatedAt)}</span>
                  </div>
                </button>
                <div className="dropdown-item-actions">
                  <button
                    className={`dropdown-item-context ${contextIds.includes(conv.id) ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleContext(conv.id)
                    }}
                    title={contextIds.includes(conv.id) ? 'Remove from context' : 'Add to context'}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </button>
                  <button
                    className="dropdown-item-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm('Delete this conversation?')) {
                        onDeleteConversation(conv.id)
                      }
                    }}
                    title="Delete conversation"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {contextIds.length > 0 && (
          <div className="dropdown-context-info">
            {contextIds.length} conversation{contextIds.length > 1 ? 's' : ''} in context
          </div>
        )}
      </div>
    </>
  )
}
