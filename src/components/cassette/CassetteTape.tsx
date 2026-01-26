import { useEffect, useState } from 'react'
import './CassetteTape.css'

export type TapeState = 'idle' | 'recording' | 'playing' | 'thinking' | 'rewinding'

interface CassetteTapeProps {
  title: string
  subtitle?: string
  state?: TapeState
  messageCount?: number
  color?: 'black' | 'clear' | 'chrome' | 'white'
  labelColor?: string
  size?: 'small' | 'medium' | 'large'
  onClick?: () => void
  className?: string
}

export function CassetteTape({
  title,
  subtitle,
  state = 'idle',
  messageCount = 0,
  color = 'black',
  labelColor = '#f5f5dc',
  size = 'medium',
  onClick,
  className = '',
}: CassetteTapeProps) {
  const [reelRotation, setReelRotation] = useState(0)

  // Animate reels based on state
  useEffect(() => {
    if (state === 'idle') return

    const speed = state === 'rewinding' ? 20 : state === 'recording' ? 3 : 2
    const direction = state === 'rewinding' ? -1 : 1

    const interval = setInterval(() => {
      setReelRotation(prev => (prev + speed * direction) % 360)
    }, 16)

    return () => clearInterval(interval)
  }, [state])

  // Calculate tape "usage" based on message count (visual only)
  const tapeUsage = Math.min(messageCount / 50, 1) // Full at 50 messages
  const leftReelSize = 12 + (1 - tapeUsage) * 8 // Larger when more tape
  const rightReelSize = 12 + tapeUsage * 8 // Larger as tape fills

  return (
    <div
      className={`cassette cassette--${size} cassette--${color} cassette--${state} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Main cassette body */}
      <div className="cassette__body">
        {/* Top edge with screw holes */}
        <div className="cassette__top-edge">
          <div className="cassette__screw" />
          <div className="cassette__screw" />
        </div>

        {/* Label area */}
        <div className="cassette__label" style={{ backgroundColor: labelColor }}>
          <div className="cassette__label-lines" />
          <span className="cassette__title">{title}</span>
          {subtitle && <span className="cassette__subtitle">{subtitle}</span>}
        </div>

        {/* Tape window */}
        <div className="cassette__window">
          {/* Left reel */}
          <div
            className="cassette__reel cassette__reel--left"
            style={{
              transform: `rotate(${reelRotation}deg)`,
              width: `${leftReelSize}px`,
              height: `${leftReelSize}px`,
            }}
          >
            <div className="cassette__reel-spokes" />
          </div>

          {/* Tape between reels */}
          <div className="cassette__tape-path">
            <div className="cassette__tape-line" />
          </div>

          {/* Right reel */}
          <div
            className="cassette__reel cassette__reel--right"
            style={{
              transform: `rotate(${reelRotation}deg)`,
              width: `${rightReelSize}px`,
              height: `${rightReelSize}px`,
            }}
          >
            <div className="cassette__reel-spokes" />
          </div>
        </div>

        {/* Bottom details */}
        <div className="cassette__bottom">
          <div className="cassette__teeth">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="cassette__tooth" />
            ))}
          </div>
        </div>

        {/* Recording indicator */}
        {state === 'recording' && (
          <div className="cassette__record-light" />
        )}
      </div>
    </div>
  )
}
