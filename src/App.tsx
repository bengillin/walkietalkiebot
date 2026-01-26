import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Avatar } from './components/avatar/Avatar'
import { TalkButton } from './components/voice/TalkButton'
import { Transcript } from './components/chat/Transcript'
import { ChatHistory } from './components/chat/ChatHistory'
import { TextInput } from './components/chat/TextInput'
import { Onboarding } from './components/onboarding/Onboarding'
import { ActivityFeed } from './components/activity/ActivityFeed'
import { FileDropZone } from './components/dropzone/FileDropZone'
import { useSpeechRecognition } from './components/voice/useSpeechRecognition'
import { useWakeWord } from './components/voice/useWakeWord'
import { useSpeechSynthesis } from './components/voice/useSpeechSynthesis'
import { sendMessageStreaming, sendMessageViaClaudeCode, analyzeImage, analyzeImageViaServer, type ActivityEvent } from './lib/claude'
import { useStore } from './lib/store'
import { useSoundEffects } from './hooks/useSoundEffects'
import './App.css'

function App() {
  const [hasOnboarded, setHasOnboarded] = useState(() =>
    localStorage.getItem('talkboy_onboarded') === 'true'
  )
  const [apiKey, setApiKey] = useState(() =>
    localStorage.getItem('talkboy_api_key') || ''
  )
  const [showSettings, setShowSettings] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [error, setError] = useState('')
  const [useClaudeCode, setUseClaudeCode] = useState(() =>
    localStorage.getItem('talkboy_use_claude_code') === 'true'
  )
  const [showTextInput, setShowTextInput] = useState(() =>
    localStorage.getItem('talkboy_show_text_input') !== 'false'
  )
  const [connectedSessionId, setConnectedSessionId] = useState<string | null>(null)

  // Handle onboarding completion
  const handleOnboardingComplete = useCallback((mode: 'claude-code' | 'api-key', key?: string) => {
    if (mode === 'claude-code') {
      setUseClaudeCode(true)
      localStorage.setItem('talkboy_use_claude_code', 'true')
    } else if (mode === 'api-key' && key) {
      setApiKey(key)
      localStorage.setItem('talkboy_api_key', key)
      setUseClaudeCode(false)
      localStorage.setItem('talkboy_use_claude_code', 'false')
    }
    setHasOnboarded(true)
    localStorage.setItem('talkboy_onboarded', 'true')
  }, [])

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
    // Activity feed
    activities,
    addActivity,
    updateActivity,
    clearActivities,
    // File attachments
    attachedFiles,
    addFiles,
    removeFile,
    updateFile,
    clearFiles,
    // Image analysis
    imageAnalyses,
    addImageAnalysis,
    updateImageAnalysis,
    clearImageAnalyses,
    getImageContext,
    // TTS setting
    ttsEnabled,
    setTtsEnabled,
    // Continuous listening setting
    continuousListeningEnabled,
    setContinuousListeningEnabled,
    // Wake word setting
    wakeWordEnabled,
    setWakeWordEnabled,
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

  // Handle files being added - trigger analysis for each
  const handleFilesAdd = useCallback(async (files: import('./types').DroppedFile[]) => {
    // Check if we have an API key for image analysis
    if (!apiKey) {
      setError('API key required for image analysis. Please add one in Settings.')
      setShowSettings(true)
      return
    }

    // Add files to store first
    addFiles(files)

    // Analyze each file
    for (const file of files) {
      // Create analysis record
      const analysisId = addImageAnalysis({
        fileId: file.id,
        fileName: file.name,
        description: '',
        status: 'analyzing',
      })

      // Run analysis (don't block UI)
      // Use server-side analysis for Claude Code mode (pass API key if available), direct API for API key mode
      const analyzePromise = useClaudeCode
        ? analyzeImageViaServer(file, apiKey || undefined)
        : analyzeImage(file, apiKey)

      analyzePromise
        .then((description) => {
          updateImageAnalysis(analysisId, {
            description,
            status: 'complete',
          })
          // Also attach description directly to the file for use in lightbox
          updateFile(file.id, { description })
        })
        .catch((err) => {
          console.error('Image analysis failed:', err)
          updateImageAnalysis(analysisId, {
            status: 'error',
            error: err.message,
          })
        })
    }
  }, [addFiles, addImageAnalysis, updateImageAnalysis, updateFile, apiKey, useClaudeCode])

  // Convert imageAnalyses to format expected by FileDropZone
  const analysisStatuses = useMemo(() =>
    imageAnalyses.map(a => ({
      fileId: a.fileId,
      status: a.status,
      description: a.description,
    })),
    [imageAnalyses]
  )

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

  // Track tool call IDs to activity IDs for updating status
  const toolActivityMap = useRef<Map<string, string>>(new Map())

  // Handle activity events from Claude Code
  const handleActivity = useCallback((event: ActivityEvent) => {
    if (event.type === 'tool_start') {
      const activityId = addActivity({
        type: 'tool_start',
        tool: event.tool,
        input: event.input,
        status: 'running',
      })
      if (event.id) {
        toolActivityMap.current.set(event.id, activityId)
      }
    } else if (event.type === 'tool_input') {
      // Update existing activity with input details
      if (event.id) {
        const activityId = toolActivityMap.current.get(event.id)
        if (activityId) {
          updateActivity(activityId, { input: event.input })
        }
      }
    } else if (event.type === 'tool_end') {
      // Match by tool ID from our map
      if (event.id) {
        const activityId = toolActivityMap.current.get(event.id)
        if (activityId) {
          updateActivity(activityId, {
            status: event.status || 'complete',
            output: event.output,
          })
        }
      }
    } else if (event.type === 'all_complete') {
      // Mark all tracked activities as complete
      for (const activityId of toolActivityMap.current.values()) {
        updateActivity(activityId, {
          status: event.status || 'complete',
        })
      }
    }
  }, [addActivity, updateActivity])

  // Handle sending message to Claude
  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return
    // Only require API key for direct mode
    if (!useClaudeCode && !apiKey) return

    setAvatarState('thinking')
    playSound('thinking')
    setError('')
    setResponseText('')
    clearActivities()
    toolActivityMap.current.clear()

    // Collect images to attach to this message
    const messageImages = attachedFiles.length > 0
      ? attachedFiles.map(f => ({
          id: f.id,
          dataUrl: f.dataUrl,
          fileName: f.name,
          description: f.description,
        }))
      : undefined

    // Add user message
    addMessage({ role: 'user', content: text }, messageImages)
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
        // Include image analysis context if available
        const imageContext = getImageContext()
        const messageWithContext = imageContext
          ? `[Image Context]\n${imageContext}\n\n[User Message]\n${text}`
          : text

        await sendMessageViaClaudeCode(
          messageWithContext,
          (chunk) => {
            fullResponse += chunk
            setResponseText(fullResponse)
          },
          messages.map(m => ({ role: m.role, content: m.content })),
          handleActivity
        )
        // Speak the full response at once (if TTS enabled)
        if (fullResponse.trim() && ttsEnabled) {
          speak(fullResponse)
        } else if (fullResponse.trim()) {
          // If TTS disabled, still update avatar state
          setAvatarState('happy')
          setTimeout(() => setAvatarState('idle'), 1500)
        }
      } else {
        // Direct Claude API call
        await sendMessageStreaming(
          updatedMessages,
          apiKey,
          (chunk) => {
            fullResponse += chunk
            setResponseText(fullResponse)
            if (ttsEnabled) speakStreaming(chunk, false)
          },
          contextMessages,
          attachedFiles
        )
      }

      // Clear attached files and analyses after sending
      if (attachedFiles.length > 0) {
        clearFiles()
        clearImageAnalyses()
      }

      // Signal streaming complete - flush any remaining text (only for streaming mode)
      if (!useClaudeCode && ttsEnabled) {
        speakStreaming('', true)
      } else if (!useClaudeCode && !ttsEnabled) {
        // If TTS disabled, still update avatar state
        setAvatarState('happy')
        setTimeout(() => setAvatarState('idle'), 1500)
      }

      // Add assistant message
      addMessage({ role: 'assistant', content: fullResponse })
    } catch (err) {
      console.error('API error:', err)
      playSound('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setAvatarState('confused')
      setTimeout(() => setAvatarState('idle'), 2000)
      // Save partial response if we got anything before the error
      if (fullResponse.trim()) {
        addMessage({ role: 'assistant', content: fullResponse })
      }
    }

    setTranscript('')
  }, [apiKey, messages, addMessage, setAvatarState, setTranscript, speak, speakStreaming, playSound, contextMessages, useClaudeCode, clearActivities, handleActivity, attachedFiles, clearFiles, clearImageAnalyses, getImageContext, ttsEnabled])

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

  // Wake word detection for hands-free activation
  useWakeWord({
    wakeWord: 'hey talkboy',
    enabled: wakeWordEnabled && !isListening && !isSpeaking && avatarState !== 'thinking',
    onWakeWord: () => {
      console.log('[App] Wake word detected, starting recording')
      handleTalkStart()
    },
  })

  // Spacebar keyboard shortcut for push-to-talk (disabled in continuous mode)
  useEffect(() => {
    // Skip if continuous listening is enabled
    if (continuousListeningEnabled) return

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
  }, [isListening, isSpeaking, avatarState, apiKey, handleTalkStart, handleTalkEnd, useClaudeCode, continuousListeningEnabled])

  // Auto-start listening when continuous mode is enabled
  useEffect(() => {
    if (continuousListeningEnabled && !isListening && avatarState === 'idle') {
      const canTalk = useClaudeCode || apiKey
      if (canTalk && !isSpeaking) {
        handleTalkStart()
      }
    }
  }, [continuousListeningEnabled, isListening, avatarState, useClaudeCode, apiKey, isSpeaking, handleTalkStart])

  // Restart listening after response in continuous mode
  useEffect(() => {
    if (continuousListeningEnabled && avatarState === 'idle' && !isListening && !isSpeaking) {
      const canTalk = useClaudeCode || apiKey
      if (canTalk) {
        // Small delay to allow speech synthesis to fully complete
        const timer = setTimeout(() => {
          handleTalkStart()
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [continuousListeningEnabled, avatarState, isListening, isSpeaking, useClaudeCode, apiKey, handleTalkStart])

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

  // Show onboarding for new users
  if (!hasOnboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />
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
          {!continuousListeningEnabled && (
            <TalkButton
              isListening={isListening}
              isDisabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking'}
              onMouseDown={handleTalkStart}
              onMouseUp={handleTalkEnd}
            />
          )}
          <span className="app__hint">
            {continuousListeningEnabled ? 'Say "over" to send' : 'or press spacebar'}
          </span>
          {showTextInput && (
            <TextInput
              onSubmit={handleSendMessage}
              isDisabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking'}
              placeholder="Or type here..."
            />
          )}
        </div>

        <FileDropZone
          files={attachedFiles}
          onFilesAdd={handleFilesAdd}
          onFileRemove={removeFile}
          onClear={clearFiles}
          isDisabled={isSpeaking || avatarState === 'thinking'}
          analysisStatuses={analysisStatuses}
        />

        <ActivityFeed
          activities={activities}
          isVisible={useClaudeCode && activities.length > 0}
        />
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

              <label className="settings__toggle">
                <span className="settings__toggle-info">
                  <span className="settings__toggle-label">Speak responses</span>
                  <span className="settings__toggle-desc">Read responses aloud with text-to-speech</span>
                </span>
                <input
                  type="checkbox"
                  checked={ttsEnabled}
                  onChange={(e) => setTtsEnabled(e.target.checked)}
                />
                <span className="settings__slider" />
              </label>

              <label className="settings__toggle">
                <span className="settings__toggle-info">
                  <span className="settings__toggle-label">Continuous listening</span>
                  <span className="settings__toggle-desc">Always listen, say "over" to send</span>
                </span>
                <input
                  type="checkbox"
                  checked={continuousListeningEnabled}
                  onChange={(e) => setContinuousListeningEnabled(e.target.checked)}
                />
                <span className="settings__slider" />
              </label>

              <label className="settings__toggle">
                <span className="settings__toggle-info">
                  <span className="settings__toggle-label">Wake word</span>
                  <span className="settings__toggle-desc">Say "hey talkboy" to activate</span>
                </span>
                <input
                  type="checkbox"
                  checked={wakeWordEnabled}
                  onChange={(e) => setWakeWordEnabled(e.target.checked)}
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

            <div className="settings__section">
              <h3 className="settings__section-title">API Key</h3>
              <p className="settings__section-desc">{useClaudeCode ? 'Optional - needed for image analysis' : 'Required when not using Claude Code mode'}</p>
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

            <div className="settings__section settings__section--danger">
              <button
                className="settings__reset-btn"
                onClick={() => {
                  localStorage.removeItem('talkboy_onboarded')
                  setHasOnboarded(false)
                  setShowSettings(false)
                }}
              >
                Reset onboarding
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
