import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Avatar } from './components/avatar/Avatar'
import { TalkButton } from './components/voice/TalkButton'
import { Transcript } from './components/chat/Transcript'
import { ChatHistory } from './components/chat/ChatHistory'
import { TextInput } from './components/chat/TextInput'
import { useSpeechRecognition } from './components/voice/useSpeechRecognition'
import { useSpeechSynthesis } from './components/voice/useSpeechSynthesis'
import { sendMessageStreaming, sendMessageViaClaudeCode, sendMessageViaIPC } from './lib/claude'
import { useStore } from './lib/store'
import { useSoundEffects } from './hooks/useSoundEffects'
import './App.css'

function App() {
  const [apiKey, setApiKey] = useState(() =>
    localStorage.getItem('talkboy_api_key') || ''
  )
  const [showSettings, setShowSettings] = useState(!apiKey)
  const [responseText, setResponseText] = useState('')
  const [error, setError] = useState('')
  const [useClaudeCode, setUseClaudeCode] = useState(() =>
    localStorage.getItem('talkboy_use_claude_code') === 'true'
  )
  const [showTextInput, setShowTextInput] = useState(() =>
    localStorage.getItem('talkboy_show_text_input') !== 'false'
  )
  const [connectedSessionId, setConnectedSessionId] = useState<string | null>(null)

  // Fetch connected session ID periodically when in Claude Code mode
  useEffect(() => {
    if (!useClaudeCode) return

    const checkSession = () => {
      fetch('/api/session')
        .then(res => res.json())
        .then(data => setConnectedSessionId(data.sessionId))
        .catch(() => setConnectedSessionId(null))
    }

    checkSession()
    const interval = setInterval(checkSession, 3000)
    return () => clearInterval(interval)
  }, [useClaudeCode])

  const disconnectSession = async () => {
    await fetch('/api/session', { method: 'DELETE' })
    setConnectedSessionId(null)
  }

  const {
    avatarState,
    setAvatarState,
    messages,
    addMessage,
    transcript,
    setTranscript,
    // Conversation management
    currentConversationId,
    conversations,
    createConversation,
    loadConversation,
    deleteConversation,
    contextConversationIds,
    toggleContextConversation,
  } = useStore()

  // Get current conversation
  const currentConversation = useMemo(() =>
    conversations.find(c => c.id === currentConversationId),
    [conversations, currentConversationId]
  )

  // Get messages from context conversations to include in API calls
  const contextMessages = useMemo(() => {
    if (contextConversationIds.length === 0) return []
    return conversations
      .filter(c => contextConversationIds.includes(c.id))
      .flatMap(c => c.messages)
      .sort((a, b) => a.timestamp - b.timestamp)
  }, [contextConversationIds, conversations])

  // Sound effects
  const { play: playSound } = useSoundEffects()

  // Ref to capture final transcript for use in onEnd
  const finalTranscriptRef = useRef('')
  const triggerWordUsedRef = useRef(false)

  // Speech recognition
  const {
    isListening,
    isSupported: sttSupported,
    start: startListening,
    stop: stopListening
  } = useSpeechRecognition({
    onInterimResult: (text) => {
      setTranscript(text)
      finalTranscriptRef.current = text
    },
    onResult: (text) => {
      setTranscript(text)
      finalTranscriptRef.current = text
    },
    onEnd: () => {
      // Skip if trigger word already handled this
      if (triggerWordUsedRef.current) {
        triggerWordUsedRef.current = false
        return
      }
      const textToSend = finalTranscriptRef.current.trim()
      if (textToSend) {
        handleSendMessage(textToSend)
        finalTranscriptRef.current = ''
      } else {
        setAvatarState('idle')
      }
    },
    onTriggerWord: (text) => {
      // "Over" was said - send the message
      triggerWordUsedRef.current = true
      finalTranscriptRef.current = ''
      if (text.trim()) {
        handleSendMessage(text)
      } else {
        setAvatarState('idle')
      }
    },
    onError: (err) => {
      setError(`Speech recognition error: ${err}`)
      setAvatarState('confused')
      finalTranscriptRef.current = ''
      setTimeout(() => setAvatarState('idle'), 2000)
    },
    triggerWord: 'over',
  })

  // Speech synthesis
  const {
    speak,
    speakStreaming,
    isSpeaking,
    isSupported: ttsSupported
  } = useSpeechSynthesis({
    onStart: () => setAvatarState('speaking'),
    onEnd: () => {
      setAvatarState('happy')
      setTimeout(() => setAvatarState('idle'), 1500)
    },
    onError: (err) => {
      console.error('TTS error:', err)
      setAvatarState('idle')
    },
  })

  // Update avatar state based on listening
  useEffect(() => {
    if (isListening) {
      setAvatarState('listening')
    }
  }, [isListening, setAvatarState])

  // Play success sound when response completes
  useEffect(() => {
    if (avatarState === 'happy') {
      playSound('success')
    }
  }, [avatarState, playSound])

  // Sync state to API for MCP server
  useEffect(() => {
    const syncState = async () => {
      try {
        await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            avatarState,
            transcript,
            lastUserMessage: messages.filter(m => m.role === 'user').pop()?.content || '',
            lastAssistantMessage: messages.filter(m => m.role === 'assistant').pop()?.content || '',
            messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
          }),
        })
      } catch {
        // Ignore sync errors
      }
    }
    syncState()
  }, [avatarState, transcript, messages])

  // Handle sending message to Claude
  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return
    // Only require API key for direct mode
    if (!useClaudeCode && !apiKey) return

    setAvatarState('thinking')
    playSound('thinking')
    setError('')
    setResponseText('')

    // Add user message
    addMessage({ role: 'user', content: text })
    const updatedMessages = [...messages, {
      id: 'temp',
      role: 'user' as const,
      content: text,
      timestamp: Date.now()
    }]

    let fullResponse = ''

    try {
      if (useClaudeCode) {
        // Claude Code mode - spawn CLI with conversation context
        await sendMessageViaClaudeCode(
          text,
          (chunk) => {
            fullResponse += chunk
            setResponseText(fullResponse)
          },
          messages.map(m => ({ role: m.role, content: m.content }))
        )
        // Speak the full response at once
        if (fullResponse.trim()) {
          speak(fullResponse)
        }
      } else {
        // Direct Claude API call
        await sendMessageStreaming(
          updatedMessages,
          apiKey,
          (chunk) => {
            fullResponse += chunk
            setResponseText(fullResponse)
            speakStreaming(chunk, false)
          },
          contextMessages
        )
      }

      // Signal streaming complete - flush any remaining text (only for streaming mode)
      if (!useClaudeCode) {
        speakStreaming('', true)
      }

      // Add assistant message
      addMessage({ role: 'assistant', content: fullResponse })
    } catch (err) {
      console.error('API error:', err)
      playSound('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setAvatarState('confused')
      setTimeout(() => setAvatarState('idle'), 2000)
    }

    setTranscript('')
  }, [apiKey, messages, addMessage, setAvatarState, setTranscript, speak, speakStreaming, playSound, contextMessages, useClaudeCode])

  // Handle talk button
  const handleTalkStart = useCallback(() => {
    setError('')
    setResponseText('')
    finalTranscriptRef.current = ''
    triggerWordUsedRef.current = false
    playSound('startListening')
    startListening()
  }, [startListening, playSound])

  const handleTalkEnd = useCallback(() => {
    playSound('stopListening')
    stopListening()
  }, [stopListening, playSound])

  // Spacebar keyboard shortcut for push-to-talk
  useEffect(() => {
    const isInputFocused = () => {
      const active = document.activeElement
      return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isInputFocused()) {
        e.preventDefault()
        const canTalk = useClaudeCode || apiKey
        if (!isListening && !isSpeaking && avatarState !== 'thinking' && canTalk) {
          handleTalkStart()
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isInputFocused()) {
        e.preventDefault()
        if (isListening) {
          handleTalkEnd()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isListening, isSpeaking, avatarState, apiKey, handleTalkStart, handleTalkEnd, useClaudeCode])

  // Save API key
  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (apiKey.trim()) {
      localStorage.setItem('talkboy_api_key', apiKey.trim())
      setShowSettings(false)
    }
  }

  // Check browser support
  if (!sttSupported || !ttsSupported) {
    return (
      <div className="app">
        <div className="app__unsupported">
          <h1>Browser Not Supported</h1>
          <p>
            Talkboy requires speech recognition and synthesis.
            Please use Chrome or Edge.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Talkboy</h1>
        <button
          className="app__settings-btn"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </header>

      <ChatHistory
        messages={messages}
        conversations={conversations}
        currentConversation={currentConversation}
        contextIds={contextConversationIds}
        onSelectConversation={loadConversation}
        onNewConversation={createConversation}
        onDeleteConversation={deleteConversation}
        onToggleContext={toggleContextConversation}
      />

      <main className="app__main">
        <div className="app__avatar-container">
          <Avatar state={avatarState} />
        </div>

        <div className="app__transcript-container">
          {isListening && transcript && (
            <Transcript text={transcript} label="You're saying" />
          )}
          {!isListening && responseText && (
            <Transcript text={responseText} label="Talkboy" />
          )}
          {error && (
            <div className="app__error">{error}</div>
          )}
        </div>

        <div className="app__controls">
          <TalkButton
            isListening={isListening}
            isDisabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking'}
            onMouseDown={handleTalkStart}
            onMouseUp={handleTalkEnd}
          />
          <span className="app__hint">or press spacebar</span>
          {showTextInput && (
            <TextInput
              onSubmit={handleSendMessage}
              isDisabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking'}
              placeholder="Or type here..."
            />
          )}
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => (useClaudeCode || apiKey) && setShowSettings(false)}>
          <div className="modal modal--settings" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2>Settings</h2>
              {(useClaudeCode || apiKey) && (
                <button className="modal__close" onClick={() => setShowSettings(false)}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              )}
            </div>

            <div className="settings__section">
              <label className="settings__toggle">
                <span className="settings__toggle-info">
                  <span className="settings__toggle-label">Claude Code mode</span>
                  <span className="settings__toggle-desc">Route through CLI for full agent capabilities</span>
                </span>
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

              <label className="settings__toggle">
                <span className="settings__toggle-info">
                  <span className="settings__toggle-label">Show text input</span>
                  <span className="settings__toggle-desc">Display keyboard input field</span>
                </span>
                <input
                  type="checkbox"
                  checked={showTextInput}
                  onChange={(e) => {
                    setShowTextInput(e.target.checked)
                    localStorage.setItem('talkboy_show_text_input', String(e.target.checked))
                  }}
                />
                <span className="settings__slider" />
              </label>

              {useClaudeCode && (
                <div className="settings__session">
                  {connectedSessionId ? (
                    <>
                      <span className="settings__session-status settings__session-status--connected">
                        Connected to session
                      </span>
                      <code className="settings__session-id">{connectedSessionId.slice(0, 8)}...</code>
                      <button
                        className="settings__session-disconnect"
                        onClick={disconnectSession}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <span className="settings__session-status">
                      No session connected - run "connect to talkboy" in Claude Code
                    </span>
                  )}
                </div>
              )}
            </div>

            {!useClaudeCode && (
              <div className="settings__section">
                <h3 className="settings__section-title">API Key</h3>
                <p className="settings__section-desc">Required when not using Claude Code mode</p>
                <form onSubmit={handleSaveApiKey}>
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
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get an API key
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
