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

  return (
    <>
      {/* Backdrop */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}

      {/* Sidebar */}
      <aside className={`conversation-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Conversations</h2>
          <button className="sidebar-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <button className="sidebar-new-btn" onClick={onNewConversation}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          New Conversation
        </button>

        <div className="sidebar-list">
          {conversations.length === 0 ? (
            <div className="sidebar-empty">No conversations yet</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`sidebar-item ${conv.id === currentConversationId ? 'active' : ''}`}
              >
                <button
                  className="sidebar-item-main"
                  onClick={() => onSelectConversation(conv.id)}
                >
                  <div className="sidebar-item-title">{conv.title || 'New conversation'}</div>
                  <div className="sidebar-item-meta">
                    <span>{conv.messages.length} messages</span>
                    <span>{formatDate(conv.updatedAt)}</span>
                  </div>
                </button>
                <div className="sidebar-item-actions">
                  <button
                    className={`sidebar-item-context ${contextIds.includes(conv.id) ? 'active' : ''}`}
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
                    className="sidebar-item-delete"
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
          <div className="sidebar-context-info">
            {contextIds.length} conversation{contextIds.length > 1 ? 's' : ''} in context
          </div>
        )}
      </aside>
    </>
  )
}
