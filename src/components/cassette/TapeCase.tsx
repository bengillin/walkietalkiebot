import { CassetteTape, type TapeState } from './CassetteTape'
import './TapeCase.css'

interface TapeCaseProps {
  title: string
  subtitle?: string
  artworkUrl?: string
  artworkGradient?: string
  tapeColor?: 'black' | 'clear' | 'chrome' | 'white'
  labelColor?: string
  state?: TapeState
  messageCount?: number
  isOpen?: boolean
  onClick?: () => void
  onEject?: () => void
  className?: string
}

export function TapeCase({
  title,
  subtitle,
  artworkUrl,
  artworkGradient,
  tapeColor = 'black',
  labelColor,
  state = 'idle',
  messageCount = 0,
  isOpen = false,
  onClick,
  onEject,
  className = '',
}: TapeCaseProps) {
  // Generate a gradient based on title if no artwork provided
  const defaultGradient = generateGradientFromString(title)
  const backgroundStyle = artworkUrl
    ? { backgroundImage: `url(${artworkUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: artworkGradient || defaultGradient }

  return (
    <div
      className={`tape-case ${isOpen ? 'tape-case--open' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Case exterior */}
      <div className="tape-case__exterior">
        {/* Front cover / artwork */}
        <div className="tape-case__cover" style={backgroundStyle}>
          <div className="tape-case__cover-overlay" />
          <div className="tape-case__cover-title">
            <span className="tape-case__cover-text">{title}</span>
            {subtitle && <span className="tape-case__cover-subtitle">{subtitle}</span>}
          </div>
        </div>

        {/* Spine */}
        <div className="tape-case__spine" style={backgroundStyle}>
          <span className="tape-case__spine-text">{title}</span>
        </div>
      </div>

      {/* Case interior with tape */}
      {isOpen && (
        <div className="tape-case__interior">
          <div className="tape-case__tape-holder">
            <CassetteTape
              title={title}
              subtitle={subtitle}
              color={tapeColor}
              labelColor={labelColor}
              state={state}
              messageCount={messageCount}
              size="medium"
            />
          </div>
          {onEject && (
            <button className="tape-case__eject-btn" onClick={(e) => { e.stopPropagation(); onEject(); }}>
              Eject
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Generate a consistent gradient based on string
function generateGradientFromString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  const hue1 = Math.abs(hash) % 360
  const hue2 = (hue1 + 40) % 360
  const saturation = 60 + (Math.abs(hash >> 8) % 30)
  const lightness = 35 + (Math.abs(hash >> 16) % 20)

  return `linear-gradient(135deg,
    hsl(${hue1}, ${saturation}%, ${lightness}%) 0%,
    hsl(${hue2}, ${saturation}%, ${lightness - 10}%) 100%)`
}
