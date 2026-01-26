import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { AvatarSmall } from './components/avatar/Avatar'
import { Logo } from './components/Logo'
import { ChatTimeline } from './components/chat/ChatTimeline'
import { TapeDeck, type TapeState } from './components/cassette'
import { Onboarding, type OnboardingSettings } from './components/onboarding/Onboarding'
import { FileDropZone } from './components/dropzone/FileDropZone'
import { ImageLightbox } from './components/media/ImageLightbox'
import { MediaLibrary } from './components/media/MediaLibrary'
import { useSpeechRecognition } from './components/voice/useSpeechRecognition'
import { useWakeWord } from './components/voice/useWakeWord'
import { useSpeechSynthesis } from './components/voice/useSpeechSynthesis'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { sendMessageStreaming, sendMessageViaClaudeCode, analyzeImage, analyzeImageViaServer, type ActivityEvent } from './lib/claude'
import { useStore } from './lib/store'
import { useSoundEffects } from './hooks/useSoundEffects'
import { useTheme } from './contexts/ThemeContext'
import './App.css'

// Map avatar state to cassette tape state
function mapAvatarToTapeState(avatarState: string, isListening: boolean): TapeState {
  if (isListening) return 'recording'
  switch (avatarState) {
    case 'listening': return 'recording'
    case 'thinking': return 'thinking'
    case 'speaking': return 'playing'
    case 'happy': return 'playing'
    default: return 'idle'
  }
}

function App() {
  const [hasOnboarded, setHasOnboarded] = useState(() =>
    localStorage.getItem('talkboy_onboarded') === 'true'
  )
  const [apiKey, setApiKey] = useState(() =>
    localStorage.getItem('talkboy_api_key') || ''
  )
  const [showSettings, setShowSettings] = useState(false)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [isTapeEjected, setIsTapeEjected] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [error, setError] = useState('')
  const [useClaudeCode, setUseClaudeCode] = useState(() =>
    localStorage.getItem('talkboy_use_claude_code') === 'true'
  )
  const [connectedSessionId, setConnectedSessionId] = useState<string | null>(null)
  const [lightboxImage, setLightboxImage] = useState<{ dataUrl: string; description?: string; fileName: string } | null>(null)

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

  const { theme, setTheme, themes } = useTheme()

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
    // Activity feed
    activities,
    addActivity,
    updateActivity,
    clearActivities,
    // Stored activities (persisted)
    storedActivities,
    finalizeActivities,
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
    // Custom words
    customWakeWord,
    setCustomWakeWord,
    customTriggerWord,
    setCustomTriggerWord,
  } = useStore()

  // Handle onboarding completion - Claude Code is always the default mode
  const handleOnboardingComplete = useCallback((settings: OnboardingSettings) => {
    // Claude Code is the default
    setUseClaudeCode(true)
    localStorage.setItem('talkboy_use_claude_code', 'true')

    // Apply onboarding settings
    setWakeWordEnabled(settings.wakeWordEnabled)
    setContinuousListeningEnabled(settings.continuousListening)
    setTtsEnabled(settings.ttsEnabled)

    setHasOnboarded(true)
    localStorage.setItem('talkboy_onboarded', 'true')
  }, [setWakeWordEnabled, setContinuousListeningEnabled, setTtsEnabled])

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
    stop: stopListening,
    clearTranscript: clearSpeechTranscript
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
    triggerWord: customTriggerWord || 'over',
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

    // Clear transcript immediately so input field clears right away
    setTranscript('')
    clearSpeechTranscript()

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

      // Clear streaming text before adding message to avoid duplicate display
      setResponseText('')
      // Add assistant message and finalize activities
      addMessage({ role: 'assistant', content: fullResponse })
      // Persist activities with this conversation
      finalizeActivities()
    } catch (err) {
      console.error('API error:', err)
      playSound('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setAvatarState('confused')
      setTimeout(() => setAvatarState('idle'), 2000)
      // Save partial response if we got anything before the error
      if (fullResponse.trim()) {
        addMessage({ role: 'assistant', content: fullResponse })
        finalizeActivities()
      }
    }

    setTranscript('')
  }, [apiKey, messages, addMessage, setAvatarState, setTranscript, clearSpeechTranscript, speak, speakStreaming, playSound, contextMessages, useClaudeCode, clearActivities, handleActivity, attachedFiles, clearFiles, clearImageAnalyses, getImageContext, ttsEnabled, finalizeActivities])

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
    wakeWord: customWakeWord || 'hey talkboy',
    enabled: wakeWordEnabled && !isListening && !isSpeaking && avatarState !== 'thinking',
    onWakeWord: () => {
      console.log('[App] Wake word detected, starting recording')
      handleTalkStart()
    },
  })

  // Keyboard shortcuts (Escape to cancel recording)
  useKeyboardShortcuts({
    isRecording: isListening,
    onEscape: () => {
      if (isListening) {
        playSound('stopListening')
        stopListening()
        setTranscript('')
        finalTranscriptRef.current = ''
        setAvatarState('idle')
      }
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
    <div className="app app--timeline">
      {/* Header - clean with logo and settings */}
      <header className="app__header">
        <div className="app__header-left">
          {/* Avatar status indicator */}
          <div className="app__avatar-status">
            <AvatarSmall state={avatarState} />
          </div>
          <div className="app__logo">
            <Logo />
          </div>
        </div>
        <div className="app__header-actions">
          <button
            className="app__header-btn"
            onClick={() => setShowMediaLibrary(true)}
            title="Media Library"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/>
            </svg>
          </button>
          <button
            className="app__header-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </button>
          {/* Eject button */}
          <button
            className={`app__header-btn app__header-btn--eject ${isTapeEjected ? 'app__header-btn--active' : ''}`}
            onClick={() => setIsTapeEjected(!isTapeEjected)}
            title={isTapeEjected ? 'Close tape collection' : 'Eject tape'}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M5 17h14v2H5zm7-12L5.33 15h13.34z" />
            </svg>
          </button>
          {/* Record button - red like the original Talkboy */}
          <button
            className={`app__header-btn app__header-btn--record ${isListening ? 'app__header-btn--recording' : ''}`}
            onMouseDown={!continuousListeningEnabled ? handleTalkStart : undefined}
            onMouseUp={!continuousListeningEnabled ? handleTalkEnd : undefined}
            onMouseLeave={!continuousListeningEnabled && isListening ? handleTalkEnd : undefined}
            onClick={continuousListeningEnabled ? (isListening ? handleTalkEnd : handleTalkStart) : undefined}
            disabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking' || isTapeEjected}
            title={continuousListeningEnabled ? 'Click to toggle recording' : 'Hold to record'}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <circle cx="12" cy="12" r="8" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main chat timeline */}
      <main className="app__main">
        <ChatTimeline
          messages={messages}
          activities={activities}
          storedActivities={storedActivities}
          avatarState={avatarState}
          streamingText={responseText}
          onImageClick={setLightboxImage}
        />

        {error && (
          <div className="app__error">{error}</div>
        )}

        {/* File attachments preview */}
        <FileDropZone
          files={attachedFiles}
          onFilesAdd={handleFilesAdd}
          onFileRemove={removeFile}
          onClear={clearFiles}
          isDisabled={isSpeaking || avatarState === 'thinking'}
          analysisStatuses={analysisStatuses}
        />
      </main>

      {/* Tape Deck - input area with cassette display */}
      <TapeDeck
        currentConversation={conversations.find(c => c.id === currentConversationId) || null}
        conversations={conversations}
        tapeState={mapAvatarToTapeState(avatarState, isListening)}
        transcript={transcript}
        isListening={isListening}
        isEjected={isTapeEjected}
        onSubmit={handleSendMessage}
        onSelectConversation={(id) => {
          loadConversation(id)
          setIsTapeEjected(false)
        }}
        onNewConversation={() => {
          createConversation()
          setIsTapeEjected(false)
        }}
        onDeleteConversation={deleteConversation}
        onCloseCollection={() => setIsTapeEjected(false)}
        isDisabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking'}
        triggerWord={customTriggerWord || 'over'}
      />

      {/* Image lightbox */}
      {lightboxImage && (
        <ImageLightbox
          image={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}

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
              <h3 className="settings__section-title">Theme</h3>
              <div className="settings__theme-grid">
                {themes.map((t) => (
                  <label
                    key={t.name}
                    className={`settings__theme-option ${theme === t.name ? 'settings__theme-option--active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={t.name}
                      checked={theme === t.name}
                      onChange={() => setTheme(t.name)}
                    />
                    <span className="settings__theme-name">{t.displayName}</span>
                    <span className="settings__theme-desc">{t.description}</span>
                    <span className="settings__theme-check">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    </span>
                  </label>
                ))}
              </div>
            </div>

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
                <span className="settings__toggle-desc">Always listen, say "{customTriggerWord || 'over'}" to send</span>
              </span>
              <input
                type="checkbox"
                checked={continuousListeningEnabled}
                onChange={(e) => setContinuousListeningEnabled(e.target.checked)}
              />
              <span className="settings__slider" />
            </label>

            {continuousListeningEnabled && (
              <div className="settings__input-group">
                <label className="settings__input-label">Trigger word</label>
                <input
                  type="text"
                  className="settings__text-input"
                  value={customTriggerWord}
                  onChange={(e) => setCustomTriggerWord(e.target.value)}
                  placeholder="over"
                />
              </div>
            )}

            <label className="settings__toggle">
              <span className="settings__toggle-info">
                <span className="settings__toggle-label">Wake word</span>
                <span className="settings__toggle-desc">Say "{customWakeWord || 'hey talkboy'}" to activate</span>
              </span>
              <input
                type="checkbox"
                checked={wakeWordEnabled}
                onChange={(e) => setWakeWordEnabled(e.target.checked)}
              />
              <span className="settings__slider" />
            </label>

            {wakeWordEnabled && (
              <div className="settings__input-group">
                <label className="settings__input-label">Wake phrase</label>
                <input
                  type="text"
                  className="settings__text-input"
                  value={customWakeWord}
                  onChange={(e) => setCustomWakeWord(e.target.value)}
                  placeholder="hey talkboy"
                />
              </div>
            )}

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

            <h3 className="settings__section-title">API Key</h3>
            <p className="settings__section-desc">{useClaudeCode ? 'Optional - needed for image analysis' : 'Required when not using Claude Code mode'}</p>
            <form className="settings__api-form" onSubmit={handleSaveApiKey}>
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
      )}

      {showMediaLibrary && (
        <MediaLibrary
          conversations={conversations}
          onClose={() => setShowMediaLibrary(false)}
        />
      )}
    </div>
  )
}

export default App
