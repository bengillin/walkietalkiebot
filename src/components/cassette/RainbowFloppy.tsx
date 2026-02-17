import type { ConversationItemProps } from './ConversationItem'
import './RainbowFloppy.css'

export function RainbowFloppy({
  title,
  onClick,
  isSelected = false,
  isEjecting = false,
}: ConversationItemProps) {
  return (
    <div
      className={`rainbow-floppy ${isSelected ? 'rainbow-floppy--selected' : ''} ${isEjecting ? 'rainbow-floppy--ejecting' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Metal shutter */}
      <div className="rainbow-floppy__shutter">
        <div className="rainbow-floppy__shutter-slot" />
      </div>

      {/* Label area */}
      <div className="rainbow-floppy__label">
        <div className="rainbow-floppy__label-text">{title}</div>
      </div>

      {/* HD hole */}
      <div className="rainbow-floppy__hd-hole" />
    </div>
  )
}
