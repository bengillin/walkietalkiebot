import type { AvatarState } from '../../types'
import './Avatar.css'

interface AvatarProps {
  state: AvatarState
}

export function Avatar({ state }: AvatarProps) {
  return (
    <div className={`avatar avatar--${state}`}>
      <div className="avatar__antenna">
        <div className="avatar__antenna-tip" />
      </div>
      <div className="avatar__body">
        <div className="avatar__screen">
          <div className="avatar__eyes">
            <div className="avatar__eye avatar__eye--left" />
            <div className="avatar__eye avatar__eye--right" />
          </div>
          <div className="avatar__mouth" />
          {state === 'thinking' && (
            <div className="avatar__thinking-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </div>
          )}
          {state === 'confused' && <div className="avatar__question">?</div>}
        </div>
      </div>
      <div className="avatar__base" />
    </div>
  )
}

// Small avatar variant - renders at 64px natively without transform scaling
export function AvatarSmall({ state }: AvatarProps) {
  return (
    <div className={`avatar avatar--small avatar--${state}`}>
      <div className="avatar__antenna">
        <div className="avatar__antenna-tip" />
      </div>
      <div className="avatar__body">
        <div className="avatar__screen">
          <div className="avatar__eyes">
            <div className="avatar__eye avatar__eye--left" />
            <div className="avatar__eye avatar__eye--right" />
          </div>
          <div className="avatar__mouth" />
          {state === 'thinking' && (
            <div className="avatar__thinking-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </div>
          )}
          {state === 'confused' && <div className="avatar__question">?</div>}
        </div>
      </div>
      <div className="avatar__base" />
    </div>
  )
}
