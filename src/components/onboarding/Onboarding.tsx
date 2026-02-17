import { useState } from 'react'
import { RobotAvatar } from '../avatar/RobotAvatar'
import type { AvatarState } from '../../types'
import './Onboarding.css'

interface OnboardingProps {
  onComplete: (settings: OnboardingSettings) => void
}

export interface OnboardingSettings {
  ttsEnabled: boolean
}

type Step = 'welcome' | 'preferences'

const STEPS: Step[] = ['welcome', 'preferences']

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [settings, setSettings] = useState<OnboardingSettings>({
    ttsEnabled: true
  })
  const [robotState, setRobotState] = useState<AvatarState>('idle')

  const currentIndex = STEPS.indexOf(step)
  const progress = (currentIndex / (STEPS.length - 1)) * 100

  const nextStep = () => {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1])
    }
  }

  const prevStep = () => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) {
      setStep(STEPS[idx - 1])
    }
  }

  const handleComplete = () => {
    onComplete(settings)
  }

  const showProgress = step !== 'welcome'

  return (
    <div className="onboarding">
      <div className="onboarding__container">
        {showProgress && (
          <div className="onboarding__progress">
            <div
              className="onboarding__progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {step === 'welcome' && (
          <div className="onboarding__step">
            <div
              className="onboarding__robot-demo"
              onMouseEnter={() => setRobotState('happy')}
              onMouseLeave={() => setRobotState('idle')}
            >
              <RobotAvatar state={robotState} size="large" />
            </div>
            <h1 className="onboarding__title">Welcome to Talkie</h1>
            <p className="onboarding__subtitle">
              Your walkie talkie for Claude Code. Talk instead of type.
            </p>

            <div className="onboarding__tutorial">
              <div className="onboarding__tutorial-item">
                <div className="onboarding__tutorial-icon">
                  <kbd>Space</kbd>
                </div>
                <p>Hold spacebar to talk, release to send</p>
              </div>
              <div className="onboarding__tutorial-divider">or say "over" to send</div>
            </div>

            <button className="onboarding__button" onClick={nextStep}>
              Get Started
            </button>
          </div>
        )}

        {step === 'preferences' && (
          <div className="onboarding__step onboarding__step--feature">
            <div className="onboarding__feature-header">
              <span className="onboarding__step-label">Preferences</span>
              <h2 className="onboarding__feature-title">You're all set</h2>
            </div>

            <div className="onboarding__feature-content">
              <div className="onboarding__options-list">
                <label className="onboarding__toggle">
                  <input
                    type="checkbox"
                    checked={settings.ttsEnabled}
                    onChange={() => setSettings(prev => ({ ...prev, ttsEnabled: !prev.ttsEnabled }))}
                  />
                  <span className="onboarding__toggle-slider"></span>
                  <div className="onboarding__toggle-content">
                    <span className="onboarding__toggle-label">Speak responses</span>
                    <span className="onboarding__toggle-desc">Claude reads answers aloud</span>
                  </div>
                </label>
              </div>

              <p className="onboarding__hint">
                You can change this and more in settings later.
              </p>
            </div>

            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button onboarding__button--primary" onClick={handleComplete}>
                Start using Talkie
              </button>
            </div>
          </div>
        )}

        {showProgress && (
          <button className="onboarding__skip" onClick={handleComplete}>
            Skip intro
          </button>
        )}
      </div>
    </div>
  )
}
