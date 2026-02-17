import type { ConversationItemProps } from './ConversationItem'
import './GuestbookPage.css'

const NEON_COLORS = ['#00ff00', '#ff00ff', '#ffff00', '#00ffff', '#ff6600', '#ff0066', '#66ff00', '#6600ff']

export function GuestbookPage({
  title,
  messageCount,
  onClick,
  isSelected = false,
  isEjecting = false,
  colorIndex,
}: ConversationItemProps) {
  const neonColor = NEON_COLORS[colorIndex % NEON_COLORS.length]

  return (
    <div
      className={`guestbook-page ${isSelected ? 'guestbook-page--selected' : ''} ${isEjecting ? 'guestbook-page--ejecting' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{ '--guestbook-neon': neonColor } as React.CSSProperties}
    >
      {/* Title bar */}
      <div className="guestbook-page__titlebar">
        <div className="guestbook-page__dots">
          <span />
          <span />
          <span />
        </div>
        <div className="guestbook-page__titlebar-text">{title}</div>
      </div>

      {/* Content area */}
      <div className="guestbook-page__content">
        <div className="guestbook-page__text">
          {messageCount > 0 ? `${messageCount} entries` : 'empty page'}
        </div>
        <div className="guestbook-page__sparkle guestbook-page__sparkle--1">✦</div>
        <div className="guestbook-page__sparkle guestbook-page__sparkle--2">✦</div>
      </div>
    </div>
  )
}
