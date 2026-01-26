import { useState } from 'react'
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

type Step = 'welcome' | 'voice-controls' | 'final-options'

const STEPS: Step[] = ['welcome', 'voice-controls', 'final-options']

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [settings, setSettings] = useState<OnboardingSettings>({
    wakeWordEnabled: false,
    continuousListening: false,
    ttsEnabled: true,
    showTextInput: false
  })

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
            <h1 className="onboarding__title">Welcome to Talkboy</h1>
            <p className="onboarding__subtitle">
              Talk to Claude instead of typing. Let's set up how you want to interact.
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
              <h2 className="onboarding__feature-title">How to talk to Talkboy</h2>
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
                    <span className="onboarding__toggle-desc">Say "Hey Talkboy" to start listening</span>
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
                Tip: Add an API key in settings to analyze images. Change settings anytime with ⌘ + ,
              </p>
            </div>

            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button onboarding__button--primary" onClick={handleComplete}>
                Start using Talkboy
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
