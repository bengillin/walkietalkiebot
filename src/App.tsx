import { useState, useCallback, useEffect, useRef } from 'react'
import { Avatar } from './components/avatar/Avatar'
import { TalkButton } from './components/voice/TalkButton'
import { Transcript } from './components/chat/Transcript'
import { useSpeechRecognition } from './components/voice/useSpeechRecognition'
import { useSpeechSynthesis } from './components/voice/useSpeechSynthesis'
import { sendMessage } from './lib/claude'
import { useStore } from './lib/store'
import type { AvatarState } from './types'
import './App.css'

function App() {
  const [apiKey, setApiKey] = useState(() =>
    localStorage.getItem('talkboy_api_key') || ''
  )
  const [showApiInput, setShowApiInput] = useState(!apiKey)
  const [responseText, setResponseText] = useState('')
  const [error, setError] = useState('')

  const {
    avatarState,
    setAvatarState,
    messages,
    addMessage,
    transcript,
    setTranscript
  } = useStore()

  // Ref to capture final transcript for use in onEnd
  const finalTranscriptRef = useRef('')

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
      const textToSend = finalTranscriptRef.current.trim()
      if (textToSend) {
        handleSendMessage(textToSend)
        finalTranscriptRef.current = ''
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
  })

  // Speech synthesis
  const {
    speak,
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
    if (!text.trim() || !apiKey) return

    setAvatarState('thinking')
    setError('')

    // Add user message
    addMessage({ role: 'user', content: text })
    const updatedMessages = [...messages, {
      id: 'temp',
      role: 'user' as const,
      content: text,
      timestamp: Date.now()
    }]

    try {
      const response = await sendMessage(updatedMessages, apiKey)

      // Add assistant message
      addMessage({ role: 'assistant', content: response })
      setResponseText(response)

      // Speak the response
      speak(response)
    } catch (err) {
      console.error('API error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setAvatarState('confused')
      setTimeout(() => setAvatarState('idle'), 2000)
    }

    setTranscript('')
  }, [apiKey, messages, addMessage, setAvatarState, setTranscript, speak])

  // Handle talk button
  const handleTalkStart = useCallback(() => {
    setError('')
    setResponseText('')
    finalTranscriptRef.current = ''
    startListening()
  }, [startListening])

  const handleTalkEnd = useCallback(() => {
    stopListening()
  }, [stopListening])

  // Save API key
  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (apiKey.trim()) {
      localStorage.setItem('talkboy_api_key', apiKey.trim())
      setShowApiInput(false)
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
          onClick={() => setShowApiInput(true)}
          title="Settings"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </header>

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
            isDisabled={!apiKey || isSpeaking || avatarState === 'thinking'}
            onMouseDown={handleTalkStart}
            onMouseUp={handleTalkEnd}
          />
        </div>
      </main>

      {/* API Key Modal */}
      {showApiInput && (
        <div className="modal-overlay" onClick={() => apiKey && setShowApiInput(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Enter Your Claude API Key</h2>
            <p>Your key is stored locally and never sent anywhere except Anthropic's API.</p>
            <form onSubmit={handleSaveApiKey}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                autoFocus
              />
              <button type="submit" disabled={!apiKey.trim()}>
                Save & Start
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
        </div>
      )}
    </div>
  )
}

export default App
