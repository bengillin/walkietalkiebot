import type { AvatarState } from '../../types'
import './RobotAvatar.css'

interface RobotAvatarProps {
  state: AvatarState
  size?: 'small' | 'large'
}

// CSS-only robot character inspired by CHARACTER.md
// Spherical body, expressive eyes, antenna, speaker grille texture
export function RobotAvatar({ state, size = 'large' }: RobotAvatarProps) {
  return (
    <div className={`robot robot--${state} robot--${size}`}>
      {/* Antenna */}
      <div className="robot__antenna">
        <div className="robot__antenna-stem" />
        <div className="robot__antenna-tip" />
      </div>

      {/* Head/Body (spherical) */}
      <div className="robot__body">
        {/* Screen face */}
        <div className="robot__screen">
          {/* Eyes */}
          <div className="robot__eyes">
            <div className="robot__eye robot__eye--left" />
            <div className="robot__eye robot__eye--right" />
          </div>

          {/* Mouth area */}
          <div className="robot__mouth" />
        </div>

        {/* Speaker grille (below screen) */}
        <div className="robot__grille">
          <div className="robot__grille-line" />
          <div className="robot__grille-line" />
          <div className="robot__grille-line" />
        </div>

        {/* Status LED */}
        <div className="robot__led" />
      </div>

      {/* Base */}
      <div className="robot__base" />
    </div>
  )
}

// Small variant for header
export function RobotAvatarSmall({ state }: { state: AvatarState }) {
  return <RobotAvatar state={state} size="small" />
}
