import './Settings.css'

interface SettingsProps {
  // Claude Code mode
  useClaudeCode: boolean
  setUseClaudeCode: (value: boolean) => void
  connectedSessionId: string | null
  onDisconnectSession: () => void
  // TTS
  ttsEnabled: boolean
  setTtsEnabled: (value: boolean) => void
  // Continuous listening
  continuousListeningEnabled: boolean
  setContinuousListeningEnabled: (value: boolean) => void
  // Trigger word
  customTriggerWord: string
  setCustomTriggerWord: (value: string) => void
  triggerWordDelay: number
  setTriggerWordDelay: (value: number) => void
  // API key
  apiKey: string
  setApiKey: (value: string) => void
  onSaveApiKey: (e: React.FormEvent) => void
  // Onboarding
  onResetOnboarding: () => void
  // Close
  onClose: () => void
}

export function Settings({
  useClaudeCode,
  setUseClaudeCode,
  connectedSessionId,
  onDisconnectSession,
  ttsEnabled,
  setTtsEnabled,
  continuousListeningEnabled,
  setContinuousListeningEnabled,
  customTriggerWord,
  setCustomTriggerWord,
  triggerWordDelay,
  setTriggerWordDelay,
  apiKey,
  setApiKey,
  onSaveApiKey,
  onResetOnboarding,
  onClose,
}: SettingsProps) {
  const canClose = useClaudeCode || apiKey

  return (
    <div className="settings">
      <div className="settings__backdrop" onClick={() => canClose && onClose()} />

      <div className="settings__drawer">
        <div className="settings__header">
          <h3 className="settings__title">Settings</h3>
          {canClose && (
            <button className="settings__close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          )}
        </div>

        <div className="settings__content">
          <label className="settings__toggle">
            <span className="settings__toggle-label">Claude Code mode</span>
            <input
              type="checkbox"
              checked={useClaudeCode}
              onChange={(e) => {
                setUseClaudeCode(e.target.checked)
                localStorage.setItem('talkboy_use_claude_code', String(e.target.checked))
              }}
            />
            <span className="settings__slider" />
          </label>

          {useClaudeCode && connectedSessionId && (
            <div className="settings__session">
              <span className="settings__session-status settings__session-status--connected">
                Session {connectedSessionId.slice(0, 8)}...
              </span>
              <button
                className="settings__session-disconnect"
                onClick={onDisconnectSession}
              >
                Disconnect
              </button>
            </div>
          )}

          <label className="settings__toggle">
            <span className="settings__toggle-label">Speak responses</span>
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
            />
            <span className="settings__slider" />
          </label>

          <label className="settings__toggle">
            <span className="settings__toggle-label">Continuous listening</span>
            <input
              type="checkbox"
              checked={continuousListeningEnabled}
              onChange={(e) => setContinuousListeningEnabled(e.target.checked)}
            />
            <span className="settings__slider" />
          </label>

          {continuousListeningEnabled && (
            <div className="settings__subsection">
              <label className="settings__input-label">End-of-turn word</label>
              <input
                type="text"
                className="settings__text-input"
                value={customTriggerWord}
                onChange={(e) => setCustomTriggerWord(e.target.value)}
                placeholder="over"
              />
              <p className="settings__hint">
                Say this word to end your turn. You can use it mid-sentence — only triggers after {triggerWordDelay / 1000}s of silence.
              </p>

              <label className="settings__input-label">Silence delay</label>
              <div className="settings__range-row">
                <input
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  value={triggerWordDelay}
                  onChange={(e) => setTriggerWordDelay(Number(e.target.value))}
                />
                <span className="settings__range-value">{(triggerWordDelay / 1000).toFixed(1)}s</span>
              </div>
              <p className="settings__hint">
                How long to wait after the trigger word before sending your message.
              </p>
            </div>
          )}

          <div className="settings__divider" />

          <label className="settings__input-label">
            API Key {useClaudeCode && <span className="settings__optional">(optional)</span>}
          </label>
          <form className="settings__api-form" onSubmit={onSaveApiKey}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <button type="submit" disabled={!apiKey.trim()}>
              Save
            </button>
          </form>
          <a
            className="settings__api-link"
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get an API key →
          </a>

          <details className="settings__advanced">
            <summary className="settings__advanced-toggle">Advanced</summary>
            <button
              className="settings__reset-btn"
              onClick={onResetOnboarding}
            >
              Reset onboarding
            </button>
          </details>
        </div>
      </div>
    </div>
  )
}
