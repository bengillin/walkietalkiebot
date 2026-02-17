import type { ConversationItemProps } from './ConversationItem'
import './FloppyDisk.css'

const LABEL_COLORS = ['#7ca0c4', '#8fbc8f', '#c4a07c', '#b89cc4', '#c4a0a0', '#8fb8b8', '#b8b88f', '#a0a0c4']

export function FloppyDisk({
  title,
  onClick,
  isSelected = false,
  isEjecting = false,
  colorIndex,
}: ConversationItemProps) {
  const labelAccent = LABEL_COLORS[colorIndex % LABEL_COLORS.length]

  return (
    <div
      className={`floppy-disk ${isSelected ? 'floppy-disk--selected' : ''} ${isEjecting ? 'floppy-disk--ejecting' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Metal shutter */}
      <div className="floppy-disk__shutter">
        <div className="floppy-disk__shutter-slot" />
      </div>

      {/* Label area */}
      <div className="floppy-disk__label" style={{ borderColor: labelAccent }}>
        <div className="floppy-disk__label-text">{title}</div>
      </div>

      {/* HD hole */}
      <div className="floppy-disk__hd-hole" />
    </div>
  )
}
