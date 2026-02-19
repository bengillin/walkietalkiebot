import { useState, useEffect } from 'react'
import { exportConversation } from '../../lib/export'
import { getIntegrations, type IntegrationsStatus } from '../../lib/api'
import { useTheme } from '../../contexts/ThemeContext'
import type { Conversation } from '../../types'
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
  ttsVoice: string
  setTtsVoice: (value: string) => void
  // Sound effects
  soundEffectsEnabled: boolean
  setSoundEffectsEnabled: (value: boolean) => void
  // Continuous listening
  continuousListeningEnabled: boolean
  setContinuousListeningEnabled: (value: boolean) => void
  // Wake word
  wakeWordEnabled: boolean
  setWakeWordEnabled: (value: boolean) => void
  customWakeWord: string
  setCustomWakeWord: (value: string) => void
  // Trigger word
  customTriggerWord: string
  setCustomTriggerWord: (value: string) => void
  triggerWordDelay: number
  setTriggerWordDelay: (value: number) => void
  // Claude settings
  claudeModel: string
  setClaudeModel: (value: string) => void
  claudeMaxTokens: number
  setClaudeMaxTokens: (value: number) => void
  claudeSystemPrompt: string
  setClaudeSystemPrompt: (value: string) => void
  // API key
  apiKey: string
  setApiKey: (value: string) => void
  onSaveApiKey: (e: React.FormEvent) => void
  // Conversation rename
  currentConversationTitle: string
  currentConversation: Conversation | null
  onRenameConversation: (title: string) => void
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
  ttsVoice,
  setTtsVoice,
  soundEffectsEnabled,
  setSoundEffectsEnabled,
  continuousListeningEnabled,
  setContinuousListeningEnabled,
  wakeWordEnabled,
  setWakeWordEnabled,
  customWakeWord,
  setCustomWakeWord,
  customTriggerWord,
  setCustomTriggerWord,
  triggerWordDelay,
  setTriggerWordDelay,
  claudeModel,
  setClaudeModel,
  claudeMaxTokens,
  setClaudeMaxTokens,
  claudeSystemPrompt,
  setClaudeSystemPrompt,
  apiKey,
  setApiKey,
  onSaveApiKey,
  currentConversationTitle,
  currentConversation,
  onRenameConversation,
  onResetOnboarding,
  onClose,
}: SettingsProps) {
  const { theme, setTheme, themes } = useTheme()
  const canClose = useClaudeCode || apiKey
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(currentConversationTitle)
  const [integrations, setIntegrations] = useState<IntegrationsStatus | null>(null)
  const [showMcpTools, setShowMcpTools] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    getIntegrations()
      .then(setIntegrations)
      .catch(() => setIntegrations(null))
  }, [])

  useEffect(() => {
    const loadVoices = () => {
      const available = speechSynthesis.getVoices()
      if (available.length > 0) setVoices(available)
    }
    loadVoices()
    speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [])

  const handleSaveTitle = () => {
    if (titleDraft.trim()) {
      onRenameConversation(titleDraft.trim())
    }
    setEditingTitle(false)
  }

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
          {/* Current tape name */}
          <div className="settings__tape-section">
            <label className="settings__input-label">Current tape</label>
            {editingTitle ? (
              <div className="settings__rename-row">
                <input
                  type="text"
                  className="settings__text-input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle()
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                  autoFocus
                />
                <button className="settings__rename-save" onClick={handleSaveTitle}>Save</button>
              </div>
            ) : (
              <div className="settings__rename-row">
                <span className="settings__tape-name">{currentConversationTitle}</span>
                <button
                  className="settings__rename-btn"
                  onClick={() => {
                    setTitleDraft(currentConversationTitle)
                    setEditingTitle(true)
                  }}
                  title="Rename tape"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="settings__divider" />

          <label className="settings__input-label">Theme</label>
          <div className="settings__theme-picker">
            {themes.map((t) => (
              <button
                key={t.name}
                className={`settings__theme-option ${theme === t.name ? 'settings__theme-option--active' : ''}`}
                onClick={() => setTheme(t.name)}
              >
                <span className="settings__theme-name">{t.displayName}</span>
                <span className="settings__theme-desc">{t.description}</span>
              </button>
            ))}
          </div>

          <div className="settings__divider" />

          <label className="settings__toggle">
            <span className="settings__toggle-label">Claude Code mode</span>
            <input
              type="checkbox"
              checked={useClaudeCode}
              onChange={(e) => {
                setUseClaudeCode(e.target.checked)
                localStorage.setItem('wtb_use_claude_code', String(e.target.checked))
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

          {/* Claude settings (Direct API mode only) */}
          {!useClaudeCode && (
            <>
              <div className="settings__divider" />
              <label className="settings__input-label">Model</label>
              <select
                className="settings__select"
                value={claudeModel}
                onChange={(e) => setClaudeModel(e.target.value)}
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-opus-4-20250514">Claude Opus 4</option>
                <option value="claude-haiku-4-20250514">Claude Haiku 4</option>
              </select>

              <label className="settings__input-label">Max tokens</label>
              <div className="settings__range-row">
                <input
                  type="range"
                  min="256"
                  max="8192"
                  step="256"
                  value={claudeMaxTokens}
                  onChange={(e) => setClaudeMaxTokens(Number(e.target.value))}
                />
                <span className="settings__range-value">{claudeMaxTokens}</span>
              </div>

              <label className="settings__input-label">System prompt</label>
              <textarea
                className="settings__textarea"
                value={claudeSystemPrompt}
                onChange={(e) => setClaudeSystemPrompt(e.target.value)}
                rows={3}
              />
            </>
          )}

          <div className="settings__divider" />

          <label className="settings__toggle">
            <span className="settings__toggle-label">Speak responses</span>
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
            />
            <span className="settings__slider" />
          </label>

          {ttsEnabled && voices.length > 0 && (
            <div className="settings__subsection">
              <label className="settings__input-label">Voice</label>
              <select
                className="settings__select"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
              >
                <option value="">System default</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}{v.lang ? ` (${v.lang})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="settings__toggle">
            <span className="settings__toggle-label">Sound effects</span>
            <input
              type="checkbox"
              checked={soundEffectsEnabled}
              onChange={(e) => setSoundEffectsEnabled(e.target.checked)}
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
                Say this word to end your turn. Only triggers after {triggerWordDelay / 1000}s of silence.
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
            </div>
          )}

          <label className="settings__toggle">
            <span className="settings__toggle-label">Wake word</span>
            <input
              type="checkbox"
              checked={wakeWordEnabled}
              onChange={(e) => setWakeWordEnabled(e.target.checked)}
            />
            <span className="settings__slider" />
          </label>

          {wakeWordEnabled && (
            <div className="settings__subsection">
              <label className="settings__input-label">Custom wake word</label>
              <input
                type="text"
                className="settings__text-input"
                value={customWakeWord}
                onChange={(e) => setCustomWakeWord(e.target.value)}
                placeholder="hey talkie"
              />
              <p className="settings__hint">
                Say this phrase to start recording hands-free.
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
            Get an API key
          </a>

          {/* Export */}
          {currentConversation && currentConversation.messages.length > 0 && (
            <>
              <div className="settings__divider" />
              <label className="settings__input-label">Export tape</label>
              <div className="settings__export-row">
                <button
                  className="settings__export-btn"
                  onClick={() => exportConversation(currentConversation, 'markdown')}
                >
                  Markdown
                </button>
                <button
                  className="settings__export-btn"
                  onClick={() => exportConversation(currentConversation, 'json')}
                >
                  JSON
                </button>
              </div>
            </>
          )}

          {/* Integrations */}
          {integrations && (
            <>
              <div className="settings__divider" />
              <label className="settings__input-label">Integrations</label>

              {/* MCP Server */}
              <div className="settings__integration">
                <div className="settings__integration-header">
                  <span className="settings__integration-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
                    </svg>
                  </span>
                  <span className="settings__integration-name">MCP Server</span>
                  <span className={`settings__integration-status ${integrations.mcp.configured ? 'settings__integration-status--active' : ''}`}>
                    {integrations.mcp.configured ? 'Ready' : 'Not configured'}
                  </span>
                </div>
                {integrations.mcp.configured && (
                  <div className="settings__integration-details">
                    <span className="settings__integration-meta">
                      {integrations.mcp.toolCount} tools via {integrations.mcp.transport}
                    </span>
                    <button
                      className="settings__integration-toggle-btn"
                      onClick={() => setShowMcpTools(!showMcpTools)}
                    >
                      {showMcpTools ? 'Hide tools' : 'Show tools'}
                    </button>
                    {showMcpTools && (
                      <div className="settings__mcp-tools">
                        {integrations.mcp.tools.map(tool => (
                          <span key={tool} className="settings__mcp-tool">{tool}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Telegram */}
              <div className="settings__integration">
                <div className="settings__integration-header">
                  <span className="settings__integration-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.2-.04-.28-.02-.12.03-2.02 1.28-5.69 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.27-1.51-.42-1.45-.89.03-.25.38-.5 1.04-.78 4.07-1.77 6.79-2.94 8.15-3.51 3.88-1.62 4.69-1.9 5.21-1.91.12 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .37z"/>
                    </svg>
                  </span>
                  <span className="settings__integration-name">Telegram Bot</span>
                  <span className={`settings__integration-status ${integrations.telegram.configured ? 'settings__integration-status--active' : ''}`}>
                    {integrations.telegram.configured ? 'Connected' : 'Not configured'}
                  </span>
                </div>
                {!integrations.telegram.configured && (
                  <p className="settings__hint">
                    Set TELEGRAM_BOT_TOKEN env or create ~/.wtb/telegram.token
                  </p>
                )}
              </div>
            </>
          )}

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
