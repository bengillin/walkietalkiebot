import { useTheme } from '../../contexts/ThemeContext'
import './RetroTape.css'

export type TapeColor = 'orange' | 'blue' | 'pink' | 'green' | 'purple' | 'yellow' | 'red' | 'teal'

// Colors now apply to the label only - body stays neutral gray
const TAPE_COLORS: Record<TapeColor, { body: string; label: string; labelAccent: string }> = {
  orange: { body: '#333', label: '#ffecd9', labelAccent: '#e85d04' },
  blue: { body: '#333', label: '#d9eeff', labelAccent: '#0077b6' },
  pink: { body: '#333', label: '#ffe4f0', labelAccent: '#d63384' },
  green: { body: '#333', label: '#d9ffe4', labelAccent: '#198754' },
  purple: { body: '#333', label: '#ecdaff', labelAccent: '#7c3aed' },
  yellow: { body: '#333', label: '#fff9d9', labelAccent: '#ca8a04' },
  red: { body: '#333', label: '#ffdada', labelAccent: '#dc2626' },
  teal: { body: '#333', label: '#d9ffff', labelAccent: '#0d9488' },
}

interface RetroTapeProps {
  title: string
  color?: TapeColor
  tapeUsage?: number // 0-1, affects reel sizes
  onClick?: () => void
  className?: string
  isSelected?: boolean
  isEjecting?: boolean
  size?: 'normal' | 'mini'
}

export function RetroTape({
  title,
  color = 'orange',
  tapeUsage = 0.3,
  onClick,
  className = '',
  isSelected = false,
  isEjecting = false,
  size = 'normal',
}: RetroTapeProps) {
  const { theme } = useTheme()
  const colors = TAPE_COLORS[color]

  // Calculate tape reel sizes based on usage
  const leftSize = 100 + (1 - tapeUsage) * 50 // Larger when more tape available
  const rightSize = 70 + tapeUsage * 80 // Larger as tape fills up

  const sizeClass = size === 'mini' ? 'retro-tape--mini' : ''
  const ejectClass = isEjecting ? 'retro-tape--ejecting' : ''

  return (
    <div
      className={`retro-tape retro-tape--${theme} ${sizeClass} ${ejectClass} ${className} ${isSelected ? 'retro-tape--selected' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        '--tape-body-color': colors.body,
        '--tape-label-bg': colors.label,
        '--tape-label-accent': colors.labelAccent,
      } as React.CSSProperties}
    >
      <div className="retro-tape__label">
        <div className="retro-tape__text">{title}</div>

        <div className="retro-tape__central">
          <div className="retro-tape__reel retro-tape__reel--left" style={{ '--reel-size': `${leftSize}%` } as React.CSSProperties}>
            <div className="retro-tape__arc">
              <div className="retro-tape__axis" />
            </div>
          </div>
          <div className="retro-tape__reel retro-tape__reel--right" style={{ '--reel-size': `${rightSize}%` } as React.CSSProperties}>
            <div className="retro-tape__arc">
              <div className="retro-tape__axis" />
            </div>
          </div>
        </div>
      </div>

      <div className="retro-tape__bottom">
        <div className="retro-tape__screw" />
        <div className="retro-tape__inner">
          <div className="retro-tape__screw" />
          <div className="retro-tape__screw" />
        </div>
        <div className="retro-tape__screw" />
      </div>
    </div>
  )
}

// Helper to get a consistent color for a conversation
export function getTapeColor(index: number): TapeColor {
  const colors: TapeColor[] = ['orange', 'blue', 'pink', 'green', 'purple', 'yellow', 'red', 'teal']
  return colors[index % colors.length]
}
