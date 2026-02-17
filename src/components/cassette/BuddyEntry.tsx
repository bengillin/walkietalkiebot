import type { ConversationItemProps } from './ConversationItem'
import './BuddyEntry.css'

export function BuddyEntry({
  title,
  messageCount,
  onClick,
  isSelected = false,
  isEjecting = false,
}: ConversationItemProps) {
  const statusText = isSelected ? 'Active' : messageCount > 0 ? 'Away' : 'Offline'

  return (
    <div
      className={`buddy-entry ${isSelected ? 'buddy-entry--selected' : ''} ${isEjecting ? 'buddy-entry--ejecting' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`buddy-entry__status buddy-entry__status--${isSelected ? 'active' : messageCount > 0 ? 'away' : 'offline'}`} />
      <div className="buddy-entry__info">
        <div className="buddy-entry__name">{title}</div>
        <div className="buddy-entry__detail">{statusText} &middot; {messageCount} msg{messageCount !== 1 ? 's' : ''}</div>
      </div>
    </div>
  )
}
