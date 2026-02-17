import { useState } from 'react'
import { RobotAvatar } from '../avatar/RobotAvatar'
import { useTheme, type ThemeName } from '../../contexts/ThemeContext'
import type { AvatarState } from '../../types'
import './Onboarding.css'

interface OnboardingProps {
  onComplete: (settings: OnboardingSettings) => void
}

export interface OnboardingSettings {
  ttsEnabled: boolean
  soundEffects: boolean
  wakeWord: boolean
  continuousListening: boolean
  theme: ThemeName
}

type Step = 'welcome' | 'tts' | 'sound-effects' | 'wake-word' | 'continuous-listening' | 'done'

const STEPS: Step[] = ['welcome', 'tts', 'sound-effects', 'wake-word', 'continuous-listening', 'done']

export function Onboarding({ onComplete }: OnboardingProps) {
  const { themes, setTheme } = useTheme()
  const [step, setStep] = useState<Step>('welcome')
  const [settings, setSettings] = useState<OnboardingSettings>({
    ttsEnabled: true,
    soundEffects: true,
    wakeWord: false,
    continuousListening: false,
    theme: 'mccallister'
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

        <div
          className="onboarding__robot"
          onMouseEnter={() => setRobotState('happy')}
          onMouseLeave={() => setRobotState('idle')}
        >
          <RobotAvatar state={robotState} size="large" />
        </div>

        {step === 'welcome' && (
          <div className="onboarding__step onboarding__step--welcome">
            <div className="onboarding__speech-bubble">
              <h1 className="onboarding__title">Hey, I'm Talkie</h1>
              <p className="onboarding__subtitle">
                Your walkie talkie for Claude Code.
              </p>
            </div>

            <div className="onboarding__theme-section">
              <p className="onboarding__theme-heading">Choose a theme</p>
              <div className="onboarding__theme-row">
                {themes.map((t) => (
                  <button
                    key={t.name}
                    className={`onboarding__theme-swatch onboarding__theme-swatch--${t.name} ${settings.theme === t.name ? 'onboarding__theme-swatch--active' : ''}`}
                    onClick={() => {
                      setSettings(prev => ({ ...prev, theme: t.name }))
                      setTheme(t.name)
                    }}
                  >
                    <span className="onboarding__theme-swatch-label">{t.displayName}</span>
                  </button>
                ))}
              </div>
              <p className="onboarding__theme-blurb">
                {themes.find(t => t.name === settings.theme)?.description}
              </p>
            </div>

            <button className="onboarding__button" onClick={nextStep}>
              Get Started
            </button>
          </div>
        )}

        {step === 'tts' && (
          <div className="onboarding__step onboarding__step--setting">
            <span className="onboarding__step-label">Voice</span>
            <h2 className="onboarding__setting-title">Speak responses</h2>
            <p className="onboarding__setting-desc">Claude reads answers aloud using text-to-speech. You can pick a specific voice in settings later.</p>

            <label className="onboarding__toggle">
              <input
                type="checkbox"
                checked={settings.ttsEnabled}
                onChange={() => setSettings(prev => ({ ...prev, ttsEnabled: !prev.ttsEnabled }))}
              />
              <span className="onboarding__toggle-slider"></span>
              <div className="onboarding__toggle-content">
                <span className="onboarding__toggle-label">{settings.ttsEnabled ? 'On' : 'Off'}</span>
              </div>
            </label>

            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button" onClick={nextStep}>Next</button>
            </div>
          </div>
        )}

        {step === 'sound-effects' && (
          <div className="onboarding__step onboarding__step--setting">
            <span className="onboarding__step-label">Audio</span>
            <h2 className="onboarding__setting-title">Sound effects</h2>
            <p className="onboarding__setting-desc">Cassette tape sounds when recording starts and stops.</p>

            <label className="onboarding__toggle">
              <input
                type="checkbox"
                checked={settings.soundEffects}
                onChange={() => setSettings(prev => ({ ...prev, soundEffects: !prev.soundEffects }))}
              />
              <span className="onboarding__toggle-slider"></span>
              <div className="onboarding__toggle-content">
                <span className="onboarding__toggle-label">{settings.soundEffects ? 'On' : 'Off'}</span>
              </div>
            </label>

            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button" onClick={nextStep}>Next</button>
            </div>
          </div>
        )}

        {step === 'wake-word' && (
          <div className="onboarding__step onboarding__step--setting">
            <span className="onboarding__step-label">Hands-free</span>
            <h2 className="onboarding__setting-title">Wake word</h2>
            <p className="onboarding__setting-desc">Say "Hey Talkie" to start recording without touching the keyboard. Customizable in settings.</p>

            <label className="onboarding__toggle">
              <input
                type="checkbox"
                checked={settings.wakeWord}
                onChange={() => setSettings(prev => ({ ...prev, wakeWord: !prev.wakeWord }))}
              />
              <span className="onboarding__toggle-slider"></span>
              <div className="onboarding__toggle-content">
                <span className="onboarding__toggle-label">{settings.wakeWord ? 'On' : 'Off'}</span>
              </div>
            </label>

            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button" onClick={nextStep}>Next</button>
            </div>
          </div>
        )}

        {step === 'continuous-listening' && (
          <div className="onboarding__step onboarding__step--setting">
            <span className="onboarding__step-label">Hands-free</span>
            <h2 className="onboarding__setting-title">Continuous listening</h2>
            <p className="onboarding__setting-desc">Always listening — say "over" when you're done talking to send your message. No spacebar needed.</p>

            <label className="onboarding__toggle">
              <input
                type="checkbox"
                checked={settings.continuousListening}
                onChange={() => setSettings(prev => ({ ...prev, continuousListening: !prev.continuousListening }))}
              />
              <span className="onboarding__toggle-slider"></span>
              <div className="onboarding__toggle-content">
                <span className="onboarding__toggle-label">{settings.continuousListening ? 'On' : 'Off'}</span>
              </div>
            </label>

            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button" onClick={nextStep}>Next</button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="onboarding__step onboarding__step--setting">
            <span className="onboarding__step-label">Ready</span>
            <h2 className="onboarding__setting-title">You're all set</h2>
            <p className="onboarding__setting-desc">Hold spacebar and start talking. Everything can be changed in settings later.</p>

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
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
