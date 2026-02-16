import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { AvatarSmall } from './components/avatar/Avatar'
import { Logo } from './components/Logo'
import { ChatTimeline } from './components/chat/ChatTimeline'
import { TapeDeck } from './components/cassette'
import { Onboarding, type OnboardingSettings } from './components/onboarding/Onboarding'
import { FileDropZone } from './components/dropzone/FileDropZone'
import { ImageLightbox } from './components/media/ImageLightbox'
import { MediaLibrary } from './components/media/MediaLibrary'
import { Settings } from './components/settings/Settings'
import { useSpeechRecognition } from './components/voice/useSpeechRecognition'
import { useWakeWord } from './components/voice/useWakeWord'
import { useSpeechSynthesis } from './components/voice/useSpeechSynthesis'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { sendMessageStreaming, sendMessageViaClaudeCode, analyzeImage, analyzeImageViaServer, type ActivityEvent } from './lib/claude'
import { useStore, enableServerSync } from './lib/store'
import * as api from './lib/api'
import { useSoundEffects } from './hooks/useSoundEffects'
import { useTheme } from './contexts/ThemeContext'
import { JobStatusBar } from './components/jobs/JobStatusBar'
import './App.css'

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [responseText, setResponseText] = useState('')

  // FAB position and size (draggable/resizable)
  const [fabPosition, setFabPosition] = useState(() => {
    const saved = localStorage.getItem('talkboy_fab_position')
    return saved ? JSON.parse(saved) : { x: 20, y: 100 } // Default: bottom-right offset from edges
  })
  const [fabSize, setFabSize] = useState(() => {
    const saved = localStorage.getItem('talkboy_fab_size')
    return saved ? parseInt(saved, 10) : 64
  })
  const [isDraggingFab, setIsDraggingFab] = useState(false)
  const [isResizingFab, setIsResizingFab] = useState(false)
  const fabRef = useRef<HTMLButtonElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; fabX: number; fabY: number } | null>(null)
  const resizeStartRef = useRef<{ size: number; startY: number } | null>(null)
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

  // Theme context applies mcallister theme via data-theme attribute
  useTheme()

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
    customTriggerWord,
    setCustomTriggerWord,
    // Trigger word delay
    triggerWordDelay,
    setTriggerWordDelay,
    // Server sync
    syncFromServer,
    migrateToServer,
  } = useStore()

  // Initialize server sync and handle migration
  useEffect(() => {
    const initServerSync = async () => {
      try {
        const dbAvailable = await api.isDatabaseAvailable()
        if (dbAvailable) {
          enableServerSync()

          // Check if migration is needed
          if (api.needsMigration()) {
            console.log('Migrating localStorage data to server...')
            const success = await migrateToServer()
            if (success) {
              console.log('Migration complete')
              // Refresh from server
              await syncFromServer()
            }
          } else {
            // Just sync from server
            await syncFromServer()
          }
        }
      } catch (err) {
        console.warn('Server sync unavailable:', err)
      }
    }

    initServerSync()
  }, [migrateToServer, syncFromServer])

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
    triggerWordDelay,
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

  // Detect mobile (iOS Safari doesn't allow auto-starting mic without user gesture)
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  // Restart listening after response in continuous mode (desktop only)
  useEffect(() => {
    // Skip auto-restart on mobile - iOS requires user gesture for mic access
    if (isMobile) return

    if (continuousListeningEnabled && avatarState === 'idle' && !isListening && !isSpeaking) {
      const canTalk = useClaudeCode || apiKey
      if (canTalk) {
        // Small delay to allow speech synthesis to fully complete
        const timer = setTimeout(() => {
          // Just restart listening without clearing state to avoid UI flash
          startListening()
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [continuousListeningEnabled, avatarState, isListening, isSpeaking, useClaudeCode, apiKey, startListening, isMobile])

  // On mobile, show visual prompt to tap when ready for next turn
  const showTapToTalk = isMobile && continuousListeningEnabled && avatarState === 'idle' && !isListening && !isSpeaking

  // FAB drag handlers
  const handleFabDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    // Don't start drag if clicking the resize handle
    if ((e.target as HTMLElement).classList.contains('app__record-fab-resize')) return

    e.preventDefault()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    dragStartRef.current = {
      x: clientX,
      y: clientY,
      fabX: fabPosition.x,
      fabY: fabPosition.y
    }
    setIsDraggingFab(true)
  }, [fabPosition])

  const handleFabDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!dragStartRef.current || !isDraggingFab) return

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

    const deltaX = dragStartRef.current.x - clientX
    const deltaY = dragStartRef.current.y - clientY

    // Position is from bottom-right, so invert the deltas
    const newX = Math.max(10, Math.min(window.innerWidth - fabSize - 10, dragStartRef.current.fabX + deltaX))
    const newY = Math.max(10, Math.min(window.innerHeight - fabSize - 10, dragStartRef.current.fabY + deltaY))

    setFabPosition({ x: newX, y: newY })
  }, [isDraggingFab, fabSize])

  const handleFabDragEnd = useCallback(() => {
    if (isDraggingFab) {
      localStorage.setItem('talkboy_fab_position', JSON.stringify(fabPosition))
    }
    dragStartRef.current = null
    setIsDraggingFab(false)
  }, [isDraggingFab, fabPosition])

  // FAB resize handlers
  const handleFabResizeStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    resizeStartRef.current = { size: fabSize, startY: clientY }
    setIsResizingFab(true)
  }, [fabSize])

  const handleFabResizeMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!resizeStartRef.current || !isResizingFab) return

    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const deltaY = resizeStartRef.current.startY - clientY
    const newSize = Math.max(48, Math.min(120, resizeStartRef.current.size + deltaY))
    setFabSize(newSize)
  }, [isResizingFab])

  const handleFabResizeEnd = useCallback(() => {
    if (isResizingFab) {
      localStorage.setItem('talkboy_fab_size', String(fabSize))
    }
    resizeStartRef.current = null
    setIsResizingFab(false)
  }, [isResizingFab, fabSize])

  // Global listeners for drag/resize
  useEffect(() => {
    if (isDraggingFab) {
      window.addEventListener('mousemove', handleFabDragMove)
      window.addEventListener('mouseup', handleFabDragEnd)
      window.addEventListener('touchmove', handleFabDragMove)
      window.addEventListener('touchend', handleFabDragEnd)
      return () => {
        window.removeEventListener('mousemove', handleFabDragMove)
        window.removeEventListener('mouseup', handleFabDragEnd)
        window.removeEventListener('touchmove', handleFabDragMove)
        window.removeEventListener('touchend', handleFabDragEnd)
      }
    }
  }, [isDraggingFab, handleFabDragMove, handleFabDragEnd])

  useEffect(() => {
    if (isResizingFab) {
      window.addEventListener('mousemove', handleFabResizeMove)
      window.addEventListener('mouseup', handleFabResizeEnd)
      window.addEventListener('touchmove', handleFabResizeMove)
      window.addEventListener('touchend', handleFabResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleFabResizeMove)
        window.removeEventListener('mouseup', handleFabResizeEnd)
        window.removeEventListener('touchmove', handleFabResizeMove)
        window.removeEventListener('touchend', handleFabResizeEnd)
      }
    }
  }, [isResizingFab, handleFabResizeMove, handleFabResizeEnd])

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
        {/* Desktop header actions - hidden on mobile */}
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
            className={`app__header-btn app__header-btn--record ${isListening ? 'app__header-btn--recording' : ''} ${showTapToTalk ? 'app__header-btn--tap-to-talk' : ''}`}
            onMouseDown={!continuousListeningEnabled ? handleTalkStart : undefined}
            onMouseUp={!continuousListeningEnabled ? handleTalkEnd : undefined}
            onMouseLeave={!continuousListeningEnabled && isListening ? handleTalkEnd : undefined}
            onClick={continuousListeningEnabled ? (isListening ? handleTalkEnd : handleTalkStart) : undefined}
            onTouchStart={continuousListeningEnabled ? handleTalkStart : undefined}
            disabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking' || isTapeEjected}
            title={showTapToTalk ? 'Tap to talk' : (continuousListeningEnabled ? 'Click to toggle recording' : 'Hold to record')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <circle cx="12" cy="12" r="8" />
            </svg>
          </button>
        </div>

        {/* Mobile menu button - shown only on mobile */}
        <button
          className="app__mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          title="Menu"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
          </svg>
        </button>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <>
            <div
              className="app__mobile-menu-backdrop"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="app__mobile-menu">
              <button
                className="app__mobile-menu-item"
                onClick={() => {
                  setShowMediaLibrary(true)
                  setMobileMenuOpen(false)
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/>
                </svg>
                Media Library
              </button>
              <button
                className="app__mobile-menu-item"
                onClick={() => {
                  setShowSettings(true)
                  setMobileMenuOpen(false)
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
                Settings
              </button>
              <button
                className="app__mobile-menu-item"
                onClick={() => {
                  setIsTapeEjected(!isTapeEjected)
                  setMobileMenuOpen(false)
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 17h14v2H5zm7-12L5.33 15h13.34z" />
                </svg>
                {isTapeEjected ? 'Close Tapes' : 'Eject Tape'}
              </button>
            </div>
          </>
        )}
      </header>

      {/* Background job status */}
      <JobStatusBar />

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
        onOpenCollection={() => setIsTapeEjected(true)}
        isDisabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking'}
        triggerWord={customTriggerWord || 'over'}
        onClearTranscript={() => setTranscript('')}
      />

      {/* Image lightbox */}
      {lightboxImage && (
        <ImageLightbox
          image={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}

      {/* Settings Drawer */}
      {showSettings && (
        <Settings
          useClaudeCode={useClaudeCode}
          setUseClaudeCode={setUseClaudeCode}
          connectedSessionId={connectedSessionId}
          onDisconnectSession={disconnectSession}
          ttsEnabled={ttsEnabled}
          setTtsEnabled={setTtsEnabled}
          continuousListeningEnabled={continuousListeningEnabled}
          setContinuousListeningEnabled={setContinuousListeningEnabled}
          customTriggerWord={customTriggerWord}
          setCustomTriggerWord={setCustomTriggerWord}
          triggerWordDelay={triggerWordDelay}
          setTriggerWordDelay={setTriggerWordDelay}
          apiKey={apiKey}
          setApiKey={setApiKey}
          onSaveApiKey={handleSaveApiKey}
          onResetOnboarding={() => {
            localStorage.removeItem('talkboy_onboarded')
            setHasOnboarded(false)
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showMediaLibrary && (
        <MediaLibrary
          conversations={conversations}
          onClose={() => setShowMediaLibrary(false)}
        />
      )}

      {/* Floating Record Button for mobile - draggable and resizable */}
      <button
        ref={fabRef}
        className={`app__record-fab ${isListening ? 'app__record-fab--recording' : ''} ${showTapToTalk ? 'app__record-fab--tap-to-talk' : ''} ${isDraggingFab ? 'app__record-fab--dragging' : ''}`}
        style={{
          right: fabPosition.x,
          bottom: fabPosition.y,
          width: fabSize,
          height: fabSize
        }}
        onClick={() => {
          // Don't trigger click if we just finished dragging
          if (dragStartRef.current) return
          if (continuousListeningEnabled) {
            isListening ? handleTalkEnd() : handleTalkStart()
          } else {
            handleTalkStart()
          }
        }}
        onMouseDown={handleFabDragStart}
        onTouchStart={(e) => {
          // Long press for drag, tap for record
          const touchStart = Date.now()
          const touch = e.touches[0]
          const startX = touch.clientX
          const startY = touch.clientY

          const checkForDrag = setTimeout(() => {
            handleFabDragStart(e)
          }, 300) // 300ms hold to start drag

          const handleTouchMove = (moveE: TouchEvent) => {
            const moveTouch = moveE.touches[0]
            const dx = Math.abs(moveTouch.clientX - startX)
            const dy = Math.abs(moveTouch.clientY - startY)
            if (dx > 10 || dy > 10) {
              clearTimeout(checkForDrag)
              handleFabDragStart(e)
            }
          }

          const handleTouchEnd = () => {
            clearTimeout(checkForDrag)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchend', handleTouchEnd)

            // If not dragging and quick tap, trigger record
            if (!isDraggingFab && Date.now() - touchStart < 300) {
              if (continuousListeningEnabled) {
                isListening ? handleTalkEnd() : handleTalkStart()
              } else {
                handleTalkStart()
              }
            }
          }

          window.addEventListener('touchmove', handleTouchMove)
          window.addEventListener('touchend', handleTouchEnd)
        }}
        disabled={(!useClaudeCode && !apiKey) || isSpeaking || avatarState === 'thinking' || isTapeEjected}
        aria-label={isListening ? 'Stop recording' : 'Start recording'}
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
        </svg>
        {/* Resize handle */}
        <div
          className="app__record-fab-resize"
          onMouseDown={handleFabResizeStart}
          onTouchStart={handleFabResizeStart}
        />
      </button>
    </div>
  )
}

export default App
