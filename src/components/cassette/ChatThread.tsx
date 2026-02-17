import type { ConversationItemProps } from './ConversationItem'
import './ChatThread.css'

const COLORS = ['#007AFF', '#34C759', '#FF3B30', '#FF9500', '#AF52DE', '#5AC8FA', '#FF2D55', '#5856D6']

export function ChatThread({
  title,
  messageCount,
  onClick,
  isSelected = false,
  isEjecting = false,
  colorIndex,
}: ConversationItemProps) {
  const color = COLORS[colorIndex % COLORS.length]
  const initial = title.trim().charAt(0).toUpperCase() || '?'
  const snippet = messageCount > 0
    ? `${messageCount} message${messageCount !== 1 ? 's' : ''}`
    : 'No messages yet'

  return (
    <div
      className={`chat-thread ${isSelected ? 'chat-thread--selected' : ''} ${isEjecting ? 'chat-thread--ejecting' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="chat-thread__avatar" style={{ backgroundColor: color }}>
        {initial}
      </div>
      <div className="chat-thread__content">
        <div className="chat-thread__title">{title}</div>
        <div className="chat-thread__snippet">{snippet}</div>
      </div>
      <div className="chat-thread__meta">
        {isSelected && <div className="chat-thread__badge" />}
      </div>
    </div>
  )
}
