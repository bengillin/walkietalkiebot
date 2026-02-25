import { useState, useEffect } from 'react'
import { RobotAvatar } from '../avatar/RobotAvatar'
import { useTheme, type ThemeName } from '../../contexts/ThemeContext'
import { getStatus } from '../../lib/api'
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
  useClaudeCode: boolean
  apiKey: string
}

type Step = 'welcome' | 'how-it-works' | 'tts' | 'sound-effects' | 'wake-word' | 'continuous-listening' | 'done'

const STEPS: Step[] = ['welcome', 'how-it-works', 'tts', 'sound-effects', 'wake-word', 'continuous-listening', 'done']

export function Onboarding({ onComplete }: OnboardingProps) {
  const { themes, setTheme } = useTheme()
  const [step, setStep] = useState<Step>('welcome')
  const [settings, setSettings] = useState<OnboardingSettings>({
    ttsEnabled: true,
    soundEffects: true,
    wakeWord: false,
    continuousListening: false,
    theme: 'apple-1984',
    useClaudeCode: true,
    apiKey: '',
  })
  const [robotState, setRobotState] = useState<AvatarState>('idle')
  const [claudeCliAvailable, setClaudeCliAvailable] = useState<boolean | null>(null)

  // Auto-detect Claude CLI availability on mount
  useEffect(() => {
    getStatus()
      .then((status) => {
        const available = status.claudeCliAvailable ?? false
        setClaudeCliAvailable(available)
        if (!available) {
          setSettings(prev => ({ ...prev, useClaudeCode: false }))
        }
      })
      .catch(() => {
        setClaudeCliAvailable(false)
        setSettings(prev => ({ ...prev, useClaudeCode: false }))
      })
  }, [])

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
              <p className="onboarding__value-prop">
                Talk hands-free, see tool activity in real-time, and save every conversation as a cassette tape you can search and replay.
              </p>
              <p className="onboarding__subtitle">
                Choose a theme below, you can always change it later.
              </p>
            </div>

            <div className="onboarding__theme-section">
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
            </div>

            <button className="onboarding__button" onClick={nextStep}>
              Get Started
            </button>
          </div>
        )}

        {step === 'how-it-works' && (
          <div className="onboarding__step onboarding__step--setting">
            <span className="onboarding__step-label">Mode</span>
            <h2 className="onboarding__setting-title">Choose your mode</h2>
            <div className="onboarding__modes">
              <button
                className={`onboarding__mode onboarding__mode--selectable ${settings.useClaudeCode ? 'onboarding__mode--selected' : ''}`}
                onClick={() => setSettings(prev => ({ ...prev, useClaudeCode: true }))}
              >
                <div className="onboarding__mode-header">
                  <span className="onboarding__mode-badge">
                    {claudeCliAvailable ? 'Detected' : 'Not found'}
                  </span>
                  <span className={`onboarding__mode-status ${claudeCliAvailable ? 'onboarding__mode-status--ok' : 'onboarding__mode-status--warn'}`}>
                    {claudeCliAvailable ? '\u2713' : '!'}
                  </span>
                </div>
                <strong className="onboarding__mode-name">Claude Code mode</strong>
                <p className="onboarding__mode-desc">
                  {claudeCliAvailable
                    ? 'Full tool use, file editing, and real-time activity feed. No API key needed.'
                    : 'Requires Claude Code CLI. Install: npm install -g @anthropic-ai/claude-code'}
                </p>
              </button>
              <button
                className={`onboarding__mode onboarding__mode--selectable ${!settings.useClaudeCode ? 'onboarding__mode--selected' : ''}`}
                onClick={() => setSettings(prev => ({ ...prev, useClaudeCode: false }))}
              >
                <span className="onboarding__mode-badge onboarding__mode-badge--alt">Alternative</span>
                <strong className="onboarding__mode-name">Direct API mode</strong>
                <p className="onboarding__mode-desc">
                  Uses your Anthropic API key for quick conversations. No tool use.
                </p>
              </button>
            </div>
            {!settings.useClaudeCode && (
              <div className="onboarding__api-key">
                <input
                  type="password"
                  className="onboarding__api-key-input"
                  placeholder="sk-ant-..."
                  value={settings.apiKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                  autoComplete="off"
                />
                <p className="onboarding__api-key-hint">
                  Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>. You can also add this later in Settings.
                </p>
              </div>
            )}
            <div className="onboarding__nav">
              <button className="onboarding__nav-back" onClick={prevStep}>Back</button>
              <button className="onboarding__button" onClick={nextStep}>Next</button>
            </div>
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

            <ul className="onboarding__summary">
              <li>
                <span className="onboarding__summary-label">Mode</span>
                <span className="onboarding__summary-value">{settings.useClaudeCode ? 'Claude Code' : 'Direct API'}</span>
              </li>
              <li>
                <span className="onboarding__summary-label">Voice responses</span>
                <span className="onboarding__summary-value">{settings.ttsEnabled ? 'On' : 'Off'}</span>
              </li>
              <li>
                <span className="onboarding__summary-label">Sound effects</span>
                <span className="onboarding__summary-value">{settings.soundEffects ? 'On' : 'Off'}</span>
              </li>
              <li>
                <span className="onboarding__summary-label">Wake word</span>
                <span className="onboarding__summary-value">{settings.wakeWord ? 'On' : 'Off'}</span>
              </li>
              <li>
                <span className="onboarding__summary-label">Continuous listening</span>
                <span className="onboarding__summary-value">{settings.continuousListening ? 'On' : 'Off'}</span>
              </li>
            </ul>

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
