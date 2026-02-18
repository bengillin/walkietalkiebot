import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { RobotAvatarSmall } from './components/avatar/RobotAvatar'
import { Logo } from './components/Logo'
import { ChatTimeline } from './components/chat/ChatTimeline'
import { TapeDeck } from './components/cassette'
import { Onboarding, type OnboardingSettings } from './components/onboarding/Onboarding'
import { FileDropZone } from './components/dropzone/FileDropZone'
import { ImageLightbox } from './components/media/ImageLightbox'
import { MediaLibrary } from './components/media/MediaLibrary'
import { Settings } from './components/settings/Settings'
import { useStore } from './lib/store'
import { useTheme } from './contexts/ThemeContext'
import { JobStatusBar } from './components/jobs/JobStatusBar'
import { LinerNotes } from './components/linernotes/LinerNotes'
import { KeyboardShortcuts } from './components/shortcuts/KeyboardShortcuts'
import { SearchOverlay } from './components/search/SearchOverlay'
import { Plans } from './components/plans/Plans'
import { useDraggableFab } from './hooks/useDraggableFab'
import { useServerSync } from './hooks/useServerSync'
import { useImageAnalysis } from './hooks/useImageAnalysis'
import { useVoiceIO } from './hooks/useVoiceIO'
import { useClaudeChat } from './hooks/useClaudeChat'
import { useKeyboardControl } from './hooks/useKeyboardControl'
import './App.css'

function App() {
  // --- Local UI state ---
  const [hasOnboarded, setHasOnboarded] = useState(() =>
    localStorage.getItem('talkie_onboarded') === 'true'
  )
  const [apiKey, setApiKey] = useState(() =>
    localStorage.getItem('talkie_api_key') || ''
  )
  const [showSettings, setShowSettings] = useState(false)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [showLinerNotes, setShowLinerNotes] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [isTapeEjected, setIsTapeEjected] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [themeBeforePicker, setThemeBeforePicker] = useState<string | null>(null)
  const [useClaudeCode, setUseClaudeCode] = useState(() =>
    localStorage.getItem('talkie_use_claude_code') === 'true'
  )
  const [connectedSessionId, setConnectedSessionId] = useState<string | null>(null)
  const [lightboxImage, setLightboxImage] = useState<{ dataUrl: string; description?: string; fileName: string } | null>(null)
  const [lightboxGallery, setLightboxGallery] = useState<{ dataUrl: string; description?: string; fileName: string }[] | undefined>(undefined)

  // --- Theme ---
  const { theme, setTheme, themes: themeList } = useTheme()

  // --- Store ---
  const {
    avatarState, setAvatarState,
    messages, addMessage,
    transcript, setTranscript,
    currentConversationId, conversations,
    createConversation, loadConversation, deleteConversation,
    contextConversationIds, toggleContextConversation,
    activities, addActivity, updateActivity, clearActivities,
    storedActivities, finalizeActivities,
    attachedFiles, addFiles, removeFile, updateFile, clearFiles,
    imageAnalyses, addImageAnalysis, updateImageAnalysis, clearImageAnalyses, getImageContext,
    ttsEnabled, setTtsEnabled, ttsVoice, setTtsVoice,
    soundEffectsEnabled, setSoundEffectsEnabled,
    continuousListeningEnabled, setContinuousListeningEnabled,
    wakeWordEnabled, setWakeWordEnabled,
    customWakeWord, setCustomWakeWord,
    customTriggerWord, setCustomTriggerWord,
    triggerWordDelay, setTriggerWordDelay,
    claudeModel, setClaudeModel,
    claudeMaxTokens, setClaudeMaxTokens,
    claudeSystemPrompt, setClaudeSystemPrompt,
    linerNotes, saveLinerNotes,
    syncFromServer, migrateToServer,
  } = useStore()

  // --- Extracted hooks ---

  useServerSync(migrateToServer, syncFromServer)

  const { fabRef, fabPosition, fabSize, isDraggingFab, dragStartRef, handleFabDragStart, handleFabResizeStart } = useDraggableFab()

  const { handleFilesAdd, analysisStatuses } = useImageAnalysis({
    useClaudeCode, apiKey,
    addFiles, addImageAnalysis, updateImageAnalysis, updateFile, imageAnalyses,
  })

  const contextMessages = useMemo(() => {
    if (contextConversationIds.length === 0) return []
    return conversations
      .filter(c => contextConversationIds.includes(c.id))
      .flatMap(c => c.messages)
      .sort((a, b) => a.timestamp - b.timestamp)
  }, [contextConversationIds, conversations])

  // Ref to break circular dependency: voice needs handleSendMessage, chat needs voice methods
  const sendMessageRef = useRef<(text: string) => void>(() => {})

  const voiceIO = useVoiceIO({
    onSendMessageRef: sendMessageRef,
    avatarState, setAvatarState,
    transcript, setTranscript,
    ttsEnabled, ttsVoice,
    soundEffectsEnabled,
    wakeWordEnabled, customWakeWord,
    customTriggerWord, triggerWordDelay,
  })

  const chat = useClaudeChat({
    apiKey, useClaudeCode, ttsEnabled,
    messages, addMessage,
    setAvatarState, setTranscript,
    speak: voiceIO.speak,
    speakStreaming: voiceIO.speakStreaming,
    playSound: voiceIO.playSound,
    clearSpeechTranscript: voiceIO.clearSpeechTranscript,
    attachedFiles, clearFiles, clearImageAnalyses, getImageContext,
    addActivity, updateActivity, clearActivities, finalizeActivities,
    contextMessages, currentConversationId,
    claudeModel, claudeMaxTokens, claudeSystemPrompt,
  })

  // Wire voice → chat: update the ref so voice callbacks invoke the real handleSendMessage
  sendMessageRef.current = chat.handleSendMessage

  const { showTapToTalk } = useKeyboardControl({
    isListening: voiceIO.isListening,
    isSpeaking: voiceIO.isSpeaking,
    avatarState, useClaudeCode, apiKey,
    continuousListeningEnabled,
    handleTalkStart: voiceIO.handleTalkStart,
    handleTalkEnd: voiceIO.handleTalkEnd,
    stopListening: voiceIO.stopListening,
    startListening: voiceIO.startListening,
    setTranscript, setAvatarState,
    playSound: voiceIO.playSound,
    setShowSearch, setShowShortcuts,
    currentConversationId, conversations,
    finalTranscriptRef: voiceIO.finalTranscriptRef,
  })

  // --- Session polling ---
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

  // --- Sync messages/transcript to API for MCP ---
  useEffect(() => {
    const syncState = async () => {
      try {
        await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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
  }, [transcript, messages])

  // --- Onboarding ---
  const handleOnboardingComplete = useCallback((settings: OnboardingSettings) => {
    setUseClaudeCode(true)
    localStorage.setItem('talkie_use_claude_code', 'true')
    setTtsEnabled(settings.ttsEnabled)
    setSoundEffectsEnabled(settings.soundEffects)
    setWakeWordEnabled(settings.wakeWord)
    setContinuousListeningEnabled(settings.continuousListening)
    setHasOnboarded(true)
    localStorage.setItem('talkie_onboarded', 'true')
  }, [setTtsEnabled, setSoundEffectsEnabled, setWakeWordEnabled, setContinuousListeningEnabled])

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (apiKey.trim()) {
      localStorage.setItem('talkie_api_key', apiKey.trim())
      setShowSettings(false)
    }
  }

  // --- Early returns ---
  if (!voiceIO.sttSupported || !voiceIO.ttsSupported) {
    return (
      <div className="app">
        <div className="app__unsupported">
          <h1>Browser Not Supported</h1>
          <p>Talkie requires speech recognition and synthesis. Please use Chrome or Edge.</p>
        </div>
      </div>
    )
  }

  if (!hasOnboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  // --- Main render ---
  return (
    <div className="app app--timeline">
      <header className="app__header">
        <div className="app__header-left">
          <div
            className={`app__avatar-status ${avatarState === 'idle' ? 'app__avatar-status--interactive' : ''}`}
            onMouseEnter={() => { if (avatarState === 'idle') { voiceIO.isAvatarHoverHappy.current = true; setAvatarState('happy') } }}
            onMouseLeave={() => { if (voiceIO.isAvatarHoverHappy.current) { voiceIO.isAvatarHoverHappy.current = false; setAvatarState('idle') } }}
          >
            <RobotAvatarSmall state={avatarState} />
          </div>
          <div className="app__logo"><Logo /></div>
          <button
            className={`app__theme-btn ${showThemePicker ? 'app__theme-btn--active' : ''}`}
            onClick={() => {
              if (!showThemePicker) setThemeBeforePicker(theme)
              setShowThemePicker(prev => !prev)
            }}
            title="Change theme"
          >
            <span className="app__theme-btn-eyebrow">THEME</span>
            <span className="app__theme-btn-row">
              <span className="app__theme-btn-swatch" />
              <span className="app__theme-btn-name">{themeList.find(t => t.name === theme)?.displayName}</span>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M7 10l5 5 5-5z" /></svg>
            </span>
          </button>
        </div>
        <div className="app__header-right">
          {voiceIO.isListening && (
            <div className="app__recording-indicator">
              <span className="app__recording-dot" />
              <span className="app__recording-label">REC</span>
            </div>
          )}
          <button className={`app__header-btn app__header-btn--eject ${isTapeEjected ? 'app__header-btn--active' : ''}`} onClick={() => setIsTapeEjected(prev => !prev)} title={isTapeEjected ? 'Close conversations' : 'Conversations'}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M5 17h14v2H5zm7-12L5.33 15h13.34z" /></svg>
          </button>
          <button className="app__header-btn" onClick={() => setShowSettings(true)} title="Settings">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </button>
          <button className="app__header-btn" onClick={() => setShowPlans(true)} title="Plans">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          </button>
          <button className={`app__header-btn ${linerNotes ? 'app__header-btn--has-notes' : ''}`} onClick={() => setShowLinerNotes(true)} title="Liner Notes">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          </button>
          <button className="app__header-btn" onClick={() => setShowMediaLibrary(true)} title="Media Library">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z"/></svg>
          </button>
        </div>
      </header>

      <JobStatusBar />

      <main className="app__main">
        <ChatTimeline
          messages={messages}
          activities={activities}
          storedActivities={storedActivities}
          avatarState={avatarState}
          streamingText={chat.responseText}
          onImageClick={(image, gallery) => { setLightboxImage(image); setLightboxGallery(gallery) }}
          onPinToLinerNotes={(content) => {
            if (currentConversationId) {
              const existing = linerNotes || ''
              const newNotes = existing ? existing + '\n\n---\n\n' + content : content
              saveLinerNotes(currentConversationId, newNotes)
              setShowLinerNotes(true)
            }
          }}
        />

        {chat.error && <div className="app__error">{chat.error}</div>}

        {chat.planNotification && (
          <button className="app__plan-notification" onClick={() => { setShowPlans(true); chat.setPlanNotification(null) }}>
            Plan saved: {chat.planNotification}
          </button>
        )}
      </main>

      {showThemePicker && (
        <div className="app__theme-modal-overlay" onClick={() => {
          if (themeBeforePicker) setTheme(themeBeforePicker as import('./contexts/ThemeContext').ThemeName)
          setShowThemePicker(false); setThemeBeforePicker(null)
        }}>
          <div className="app__theme-modal" onClick={e => e.stopPropagation()}>
            <div className="app__theme-modal-bubble">
              <h2 className="app__theme-modal-title">Choose a theme</h2>
              <p className="app__theme-modal-subtitle">Pick a vibe. You can always change it later.</p>
            </div>
            <div className="app__theme-modal-grid">
              {themeList.map(t => (
                <button key={t.name} className={`onboarding__theme-swatch onboarding__theme-swatch--${t.name} ${theme === t.name ? 'onboarding__theme-swatch--active' : ''}`} onClick={() => setTheme(t.name)}>
                  <span className="onboarding__theme-swatch-label">{t.displayName}</span>
                </button>
              ))}
            </div>
            <div className="app__theme-modal-actions">
              <button className="app__theme-modal-cancel" onClick={() => {
                if (themeBeforePicker) setTheme(themeBeforePicker as import('./contexts/ThemeContext').ThemeName)
                setShowThemePicker(false); setThemeBeforePicker(null)
              }}>Cancel</button>
              <button className="app__theme-modal-confirm" onClick={() => { setShowThemePicker(false); setThemeBeforePicker(null) }}>Choose theme</button>
            </div>
          </div>
        </div>
      )}

      <FileDropZone
        files={attachedFiles}
        onFilesAdd={handleFilesAdd}
        onFileRemove={removeFile}
        onClear={clearFiles}
        isDisabled={voiceIO.isSpeaking || avatarState === 'thinking'}
        analysisStatuses={analysisStatuses}
      />

      <TapeDeck
        currentConversation={conversations.find(c => c.id === currentConversationId) || null}
        conversations={conversations}
        transcript={transcript}
        isListening={voiceIO.isListening}
        isEjected={isTapeEjected}
        onSubmit={chat.handleSendMessage}
        onSelectConversation={(id) => { loadConversation(id); setIsTapeEjected(false) }}
        onNewConversation={() => { createConversation(); setIsTapeEjected(false) }}
        onDeleteConversation={deleteConversation}
        onCloseCollection={() => setIsTapeEjected(false)}
        onFilesAdd={handleFilesAdd}
        isDisabled={(!useClaudeCode && !apiKey) || voiceIO.isSpeaking || avatarState === 'thinking'}
        triggerWord={customTriggerWord || 'over'}
        onClearTranscript={() => setTranscript('')}
        isRecording={voiceIO.isListening}
        continuousListening={continuousListeningEnabled}
        onTalkStart={voiceIO.handleTalkStart}
        onTalkEnd={voiceIO.handleTalkEnd}
        contextIds={contextConversationIds}
        onToggleContext={toggleContextConversation}
      />

      {lightboxImage && (
        <ImageLightbox
          image={lightboxImage}
          images={lightboxGallery}
          onClose={() => { setLightboxImage(null); setLightboxGallery(undefined) }}
        />
      )}

      {showSettings && (
        <Settings
          useClaudeCode={useClaudeCode}
          setUseClaudeCode={setUseClaudeCode}
          connectedSessionId={connectedSessionId}
          onDisconnectSession={disconnectSession}
          ttsEnabled={ttsEnabled} setTtsEnabled={setTtsEnabled}
          ttsVoice={ttsVoice} setTtsVoice={setTtsVoice}
          soundEffectsEnabled={soundEffectsEnabled} setSoundEffectsEnabled={setSoundEffectsEnabled}
          continuousListeningEnabled={continuousListeningEnabled} setContinuousListeningEnabled={setContinuousListeningEnabled}
          wakeWordEnabled={wakeWordEnabled} setWakeWordEnabled={setWakeWordEnabled}
          customWakeWord={customWakeWord} setCustomWakeWord={setCustomWakeWord}
          customTriggerWord={customTriggerWord} setCustomTriggerWord={setCustomTriggerWord}
          triggerWordDelay={triggerWordDelay} setTriggerWordDelay={setTriggerWordDelay}
          claudeModel={claudeModel} setClaudeModel={setClaudeModel}
          claudeMaxTokens={claudeMaxTokens} setClaudeMaxTokens={setClaudeMaxTokens}
          claudeSystemPrompt={claudeSystemPrompt} setClaudeSystemPrompt={setClaudeSystemPrompt}
          apiKey={apiKey} setApiKey={setApiKey}
          onSaveApiKey={handleSaveApiKey}
          currentConversationTitle={conversations.find(c => c.id === currentConversationId)?.title || 'New conversation'}
          currentConversation={conversations.find(c => c.id === currentConversationId) || null}
          onRenameConversation={(title) => {
            if (currentConversationId) useStore.getState().renameConversation(currentConversationId, title)
          }}
          onResetOnboarding={() => { localStorage.removeItem('talkie_onboarded'); setHasOnboarded(false); setShowSettings(false) }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showMediaLibrary && <MediaLibrary conversations={conversations} onClose={() => setShowMediaLibrary(false)} />}

      <LinerNotes
        isOpen={showLinerNotes}
        linerNotes={linerNotes}
        conversationTitle={conversations.find(c => c.id === currentConversationId)?.title || 'New conversation'}
        onSave={(notes) => { if (currentConversationId) saveLinerNotes(currentConversationId, notes) }}
        onClose={() => setShowLinerNotes(false)}
      />

      <SearchOverlay
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onSelectResult={(conversationId) => { loadConversation(conversationId); setIsTapeEjected(false) }}
      />

      <Plans isOpen={showPlans} onClose={() => setShowPlans(false)} conversationId={currentConversationId || undefined} />

      <KeyboardShortcuts isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      <button
        ref={fabRef}
        className={`app__record-fab ${voiceIO.isListening ? 'app__record-fab--recording' : ''} ${showTapToTalk ? 'app__record-fab--tap-to-talk' : ''} ${isDraggingFab ? 'app__record-fab--dragging' : ''}`}
        style={{ right: fabPosition.x, bottom: fabPosition.y, width: fabSize, height: fabSize }}
        onClick={() => {
          if (dragStartRef.current) return
          if (continuousListeningEnabled) {
            voiceIO.isListening ? voiceIO.handleTalkEnd() : voiceIO.handleTalkStart()
          } else {
            voiceIO.handleTalkStart()
          }
        }}
        onMouseDown={handleFabDragStart}
        onTouchStart={(e) => {
          const touchStart = Date.now()
          const touch = e.touches[0]
          const startX = touch.clientX
          const startY = touch.clientY
          const checkForDrag = setTimeout(() => handleFabDragStart(e), 300)
          const handleTouchMove = (moveE: TouchEvent) => {
            const moveTouch = moveE.touches[0]
            const dx = Math.abs(moveTouch.clientX - startX)
            const dy = Math.abs(moveTouch.clientY - startY)
            if (dx > 10 || dy > 10) { clearTimeout(checkForDrag); handleFabDragStart(e) }
          }
          const handleTouchEnd = () => {
            clearTimeout(checkForDrag)
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchend', handleTouchEnd)
            if (!isDraggingFab && Date.now() - touchStart < 300) {
              if (continuousListeningEnabled) {
                voiceIO.isListening ? voiceIO.handleTalkEnd() : voiceIO.handleTalkStart()
              } else {
                voiceIO.handleTalkStart()
              }
            }
          }
          window.addEventListener('touchmove', handleTouchMove)
          window.addEventListener('touchend', handleTouchEnd)
        }}
        disabled={(!useClaudeCode && !apiKey) || voiceIO.isSpeaking || avatarState === 'thinking' || isTapeEjected}
        aria-label={voiceIO.isListening ? 'Stop recording' : 'Start recording'}
      >
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>
        <div className="app__record-fab-resize" onMouseDown={handleFabResizeStart} onTouchStart={handleFabResizeStart} />
      </button>
    </div>
  )
}

export default App
