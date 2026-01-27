import type { AvatarState } from '../../types'
import './Avatar.css'

interface AvatarProps {
  state: AvatarState
}

// Speaker grille avatar - 4x4 grid of holes like the TalkBoy speaker
export function Avatar({ state }: AvatarProps) {
  return (
    <div className={`speaker-avatar speaker-avatar--${state}`}>
      <div className="speaker-avatar__grille">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="speaker-avatar__hole" />
        ))}
      </div>
    </div>
  )
}

// Small speaker avatar variant
export function AvatarSmall({ state }: AvatarProps) {
  return (
    <div className={`speaker-avatar speaker-avatar--small speaker-avatar--${state}`}>
      <div className="speaker-avatar__grille">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="speaker-avatar__hole" />
        ))}
      </div>
    </div>
  )
}
