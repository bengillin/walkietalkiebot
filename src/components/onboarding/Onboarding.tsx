import { useState } from 'react'
import { RobotAvatar } from '../avatar/RobotAvatar'
import type { AvatarState } from '../../types'
import './Onboarding.css'

interface OnboardingProps {
  onComplete: (settings: OnboardingSettings) => void
}

export interface OnboardingSettings {
  wakeWordEnabled: boolean
  continuousListening: boolean
  ttsEnabled: boolean
  showTextInput: boolean
}

type Step = 'welcome' | 'voice-controls' | 'features' | 'final-options'

const STEPS: Step[] = ['welcome', 'voice-controls', 'features', 'final-options']

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [settings, setSettings] = useState<OnboardingSettings>({
    wakeWordEnabled: false,
    continuousListening: false,
    ttsEnabled: true,
    showTextInput: false
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

  const toggleSetting = (key: keyof OnboardingSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
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
            {/* Robot avatar hero */}
            <div
              className="onboarding__robot-demo"
              onMouseEnter={() => setRobotState('happy')}
              onMouseLeave={() => setRobotState('idle')}
            >
              <RobotAvatar state={robotState} size="large" />
            </div>
            <h1 className="onboarding__title">Welcome to Talkie</h1>
            <p className="onboarding__subtitle">
              Talk to Claude instead of typing. Your voice-first AI companion.
            </p>
            <button className="onboarding__button" onClick={nextStep}>
              Get Started
            </button>
          </div>
        )}

        {step === 'voice-controls' && (
          <div className="onboarding__step onboarding__step--feature">
            <div className="onboarding__feature-header">
              <span className="onboarding__step-label">Voice Controls</span>
              <h2 className="onboarding__feature-title">How to talk to Talkie</h2>
            </div>

            <div className="onboarding__feature-content">
              <div className="onboarding__tutorial">
                <div className="onboarding__tutorial-item">
                  <div className="onboarding__tutorial-icon">
                    <kbd>Space</kbd>
                  </div>
                  <p>Hold spacebar to talk, release when done</p>
                </div>

                <div className="onboarding__tutorial-divider">or say "over" to send</div>
              </div>

              <div className="onboarding__options-list">
                <label className="onboarding__toggle">
                  <input
                    type="checkbox"
                    checked={settings.wakeWordEnabled}
                    onChange={() => toggleSetting('wakeWordEnabled')}
                  />
                  <span className="onboarding__toggle-slider"></span>
                  <div className="onboarding__toggle-content">
                    <span className="onboarding__toggle-label">Wake word</span>
                    <span className="onboarding__toggle-desc">Say "Hey Talkie" to start listening</span>
                  </div>
                </label>

                <label className="onboarding__toggle">
                  <input
                    type="checkbox"
                    checked={settings.continuousListening}
                    onChange={() => toggleSetting('continuousListening')}
                  />
                  <span className="onboarding__toggle-slider"></span>
                  <div className="onboarding__toggle-content">
                    <span className="onboarding__toggle-label">Continuous listening</span>
                    <span className="onboarding__toggle-desc">Always listen, say "over" when done</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button" onClick={nextStep}>Next</button>
            </div>
          </div>
        )}

        {step === 'features' && (
          <div className="onboarding__step onboarding__step--feature">
            <div className="onboarding__feature-header">
              <span className="onboarding__step-label">Features</span>
              <h2 className="onboarding__feature-title">What you can do</h2>
            </div>

            <div className="onboarding__feature-content">
              <div className="onboarding__feature-grid">
                <div className="onboarding__feature-card">
                  <span className="onboarding__feature-card-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                    </svg>
                  </span>
                  <span className="onboarding__feature-card-title">Tape Collection</span>
                  <span className="onboarding__feature-card-desc">Conversations are tapes. Eject to browse.</span>
                </div>

                <div className="onboarding__feature-card">
                  <span className="onboarding__feature-card-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                    </svg>
                  </span>
                  <span className="onboarding__feature-card-title">Liner Notes</span>
                  <span className="onboarding__feature-card-desc">Pin plans and docs from chat.</span>
                </div>

                <div className="onboarding__feature-card">
                  <span className="onboarding__feature-card-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                    </svg>
                  </span>
                  <span className="onboarding__feature-card-title">Search</span>
                  <span className="onboarding__feature-card-desc">Full-text search across tapes.</span>
                </div>

                <div className="onboarding__feature-card">
                  <span className="onboarding__feature-card-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                  </span>
                  <span className="onboarding__feature-card-title">Export</span>
                  <span className="onboarding__feature-card-desc">Download as Markdown or JSON.</span>
                </div>
              </div>

              <p className="onboarding__hint">
                Shortcuts: Space to talk, Esc to cancel, Cmd+E to export
              </p>
            </div>

            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button" onClick={nextStep}>Next</button>
            </div>
          </div>
        )}

        {step === 'final-options' && (
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
                    onChange={() => toggleSetting('ttsEnabled')}
                  />
                  <span className="onboarding__toggle-slider"></span>
                  <div className="onboarding__toggle-content">
                    <span className="onboarding__toggle-label">Speak responses</span>
                    <span className="onboarding__toggle-desc">Claude reads answers aloud</span>
                  </div>
                </label>

                <label className="onboarding__toggle">
                  <input
                    type="checkbox"
                    checked={settings.showTextInput}
                    onChange={() => toggleSetting('showTextInput')}
                  />
                  <span className="onboarding__toggle-slider"></span>
                  <div className="onboarding__toggle-content">
                    <span className="onboarding__toggle-label">Show text input</span>
                    <span className="onboarding__toggle-desc">Type when you can't talk</span>
                  </div>
                </label>
              </div>

              <p className="onboarding__hint">
                You can change any of these settings later from the gear icon.
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
