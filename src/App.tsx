import { useState, useCallback, useEffect, useRef } from 'react'
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
import { useTheme, type ThemeName } from './contexts/ThemeContext'
import { JobStatusBar } from './components/jobs/JobStatusBar'
import { LinerNotes } from './components/linernotes/LinerNotes'
import { KeyboardShortcuts } from './components/shortcuts/KeyboardShortcuts'
import { SearchOverlay } from './components/search/SearchOverlay'
import { Plans } from './components/plans/Plans'
import { ModeSelector } from './components/modes/ModeSelector'
import { useDraggableFab } from './hooks/useDraggableFab'
import { useServerSync } from './hooks/useServerSync'
import { useImageAnalysis } from './hooks/useImageAnalysis'
import { useVoiceIO } from './hooks/useVoiceIO'
import { useClaudeChat } from './hooks/useClaudeChat'
import { useKeyboardControl } from './hooks/useKeyboardControl'
import type { ModeInfo } from './lib/api'
import * as api from './lib/api'
import './App.css'

// Header icons. Plans (clipboard + check) and Liner Notes (sticky note) are
// deliberately distinct shapes.
const HEADER_ICONS = {
  conversations: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
      <path d="M5 17h14v2H5zm7-12L5.33 15h13.34z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
      <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
    </svg>
  ),
  linerNotes: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
      <path d="M19 3H4.99C3.89 3 3 3.9 3 5l.01 14c0 1.1.89 2 1.99 2h10l6-6V5c0-1.1-.9-2-2-2zM7 8h10v2H7V8zm5 6H7v-2h5v2zm2 5.5V14h5.5L14 19.5z" />
    </svg>
  ),
  media: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
      <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  ),
}

function App() {
  // --- Local UI state ---
  const [hasOnboarded, setHasOnboarded] = useState(
    () => localStorage.getItem('wtb_onboarded') === 'true',
  )
  const [showSettings, setShowSettings] = useState(false)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const [showLinerNotes, setShowLinerNotes] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [isTapeEjected, setIsTapeEjected] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [themeBeforePicker, setThemeBeforePicker] = useState<string | null>(null)
  const [lightboxImage, setLightboxImage] = useState<{
    dataUrl: string
    description?: string
    fileName: string
  } | null>(null)
  const [lightboxGallery, setLightboxGallery] = useState<
    { dataUrl: string; description?: string; fileName: string }[] | undefined
  >(undefined)
  const [currentMode, setCurrentMode] = useState('voice')
  const [availableModes, setAvailableModes] = useState<ModeInfo[]>([])

  // --- Theme ---
  const { theme, setTheme, themes: themeList } = useTheme()

  // --- Store ---
  const {
    avatarState,
    setAvatarState,
    messages,
    addMessage,
    transcript,
    setTranscript,
    currentConversationId,
    conversations,
    createConversation,
    loadConversation,
    deleteConversation,
    setConversationMode,
    hydrateConversations,
    contextConversationIds,
    toggleContextConversation,
    activities,
    addActivity,
    updateActivity,
    clearActivities,
    storedActivities,
    finalizeActivities,
    attachedFiles,
    addFiles,
    removeFile,
    updateFile,
    clearFiles,
    imageAnalyses,
    addImageAnalysis,
    updateImageAnalysis,
    clearImageAnalyses,
    getImageContext,
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
    linerNotes,
    saveLinerNotes,
    syncFromServer,
    migrateToServer,
  } = useStore()

  // --- Extracted hooks ---

  useServerSync(migrateToServer, syncFromServer)

  const {
    fabRef,
    fabPosition,
    fabSize,
    isDraggingFab,
    dragStartRef,
    handleFabDragStart,
    handleFabResizeStart,
  } = useDraggableFab()

  const { handleFilesAdd, analysisStatuses } = useImageAnalysis({
    addFiles,
    addImageAnalysis,
    updateImageAnalysis,
    updateFile,
    imageAnalyses,
  })

  // Fetch modes on mount and restore mode when switching conversations
  useEffect(() => {
    api
      .getModes()
      .then((data) => setAvailableModes(data.modes))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const conv = conversations.find((c) => c.id === currentConversationId)
    if (conv?.mode) setCurrentMode(conv.mode)
  }, [currentConversationId, conversations])

  const handleModeChange = useCallback(
    (mode: string) => {
      setCurrentMode(mode)
      if (currentConversationId) setConversationMode(currentConversationId, mode)
    },
    [currentConversationId, setConversationMode],
  )

  // Ref to break circular dependency: voice needs handleSendMessage, chat needs voice methods
  const sendMessageRef = useRef<(text: string) => void>(() => {})

  const voiceIO = useVoiceIO({
    onSendMessageRef: sendMessageRef,
    avatarState,
    setAvatarState,
    transcript,
    setTranscript,
    ttsEnabled,
    ttsVoice,
    soundEffectsEnabled,
    wakeWordEnabled,
    customWakeWord,
    customTriggerWord,
    triggerWordDelay,
  })

  const chat = useClaudeChat({
    ttsEnabled,
    messages,
    addMessage,
    setAvatarState,
    setTranscript,
    speak: voiceIO.speak,
    playSound: voiceIO.playSound,
    clearSpeechTranscript: voiceIO.clearSpeechTranscript,
    attachedFiles,
    clearFiles,
    clearImageAnalyses,
    getImageContext,
    addActivity,
    updateActivity,
    clearActivities,
    finalizeActivities,
    currentConversationId,
    mode: currentMode,
    onModeChange: handleModeChange,
    availableModes,
  })

  // Wire voice → chat: update the ref so voice callbacks invoke the real handleSendMessage
  sendMessageRef.current = chat.handleSendMessage

  const cancelThemePicker = () => {
    if (themeBeforePicker) setTheme(themeBeforePicker as ThemeName)
    setShowThemePicker(false)
    setThemeBeforePicker(null)
  }

  // Escape closes the topmost open layer, one per press. Order is top to
  // bottom of the visual stack. (The mode dropdown closes itself first.)
  const closeTopmostLayer = (): boolean => {
    const layers: Array<[boolean, () => void]> = [
      [
        lightboxImage !== null,
        () => {
          setLightboxImage(null)
          setLightboxGallery(undefined)
        },
      ],
      [showSearch, () => setShowSearch(false)],
      [showShortcuts, () => setShowShortcuts(false)],
      [showThemePicker, cancelThemePicker],
      [showHeaderMenu, () => setShowHeaderMenu(false)],
      [showSettings, () => setShowSettings(false)],
      [showMediaLibrary, () => setShowMediaLibrary(false)],
      [showPlans, () => setShowPlans(false)],
      [showLinerNotes, () => setShowLinerNotes(false)],
      [isTapeEjected, () => setIsTapeEjected(false)],
    ]
    const open = layers.find(([isOpen]) => isOpen)
    if (!open) return false
    open[1]()
    return true
  }

  // Secondary header actions; collapse into the overflow menu on narrow screens
  const headerActions: Array<{
    key: string
    label: string
    icon: React.ReactNode
    onSelect: () => void
    className?: string
  }> = [
    {
      key: 'settings',
      label: 'Settings',
      icon: HEADER_ICONS.settings,
      onSelect: () => setShowSettings(true),
    },
    { key: 'plans', label: 'Plans', icon: HEADER_ICONS.plans, onSelect: () => setShowPlans(true) },
    {
      key: 'liner-notes',
      label: 'Liner Notes',
      icon: HEADER_ICONS.linerNotes,
      onSelect: () => setShowLinerNotes(true),
      className: linerNotes ? 'app__header-btn--has-notes' : undefined,
    },
    {
      key: 'media',
      label: 'Media Library',
      icon: HEADER_ICONS.media,
      onSelect: () => {
        setShowMediaLibrary(true)
        // The library scans every tape's images: load ones not cached yet
        void hydrateConversations()
      },
    },
  ]

  const { showTapToTalk } = useKeyboardControl({
    closeTopmostLayer,
    isListening: voiceIO.isListening,
    isSpeaking: voiceIO.isSpeaking,
    avatarState,
    continuousListeningEnabled,
    handleTalkStart: voiceIO.handleTalkStart,
    autoTalkStart: voiceIO.autoTalkStart,
    handleTalkEnd: voiceIO.handleTalkEnd,
    micBlocked: voiceIO.micBlocked,
    recognitionFailures: voiceIO.recognitionFailures,
    stopListening: voiceIO.stopListening,
    setTranscript,
    setAvatarState,
    playSound: voiceIO.playSound,
    setShowSearch,
    setShowShortcuts,
    currentConversationId,
    conversations,
    finalTranscriptRef: voiceIO.finalTranscriptRef,
  })

  // --- Sync messages/transcript to API for MCP ---
  useEffect(() => {
    const syncState = async () => {
      try {
        await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            lastUserMessage: messages.filter((m) => m.role === 'user').pop()?.content || '',
            lastAssistantMessage:
              messages.filter((m) => m.role === 'assistant').pop()?.content || '',
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
            })),
          }),
        })
      } catch {
        // Ignore sync errors
      }
    }
    syncState()
  }, [transcript, messages])

  // --- Onboarding ---
  const handleOnboardingComplete = useCallback(
    (settings: OnboardingSettings) => {
      setTtsEnabled(settings.ttsEnabled)
      setSoundEffectsEnabled(settings.soundEffects)
      setWakeWordEnabled(settings.wakeWord)
      setContinuousListeningEnabled(settings.continuousListening)
      setHasOnboarded(true)
      localStorage.setItem('wtb_onboarded', 'true')
    },
    [setTtsEnabled, setSoundEffectsEnabled, setWakeWordEnabled, setContinuousListeningEnabled],
  )

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
            onMouseEnter={() => {
              if (avatarState === 'idle') {
                voiceIO.isAvatarHoverHappy.current = true
                setAvatarState('happy')
              }
            }}
            onMouseLeave={() => {
              if (voiceIO.isAvatarHoverHappy.current) {
                voiceIO.isAvatarHoverHappy.current = false
                setAvatarState('idle')
              }
            }}
          >
            <RobotAvatarSmall state={avatarState} />
          </div>
          <div className="app__logo">
            <Logo />
          </div>
          <button
            className={`app__theme-btn ${showThemePicker ? 'app__theme-btn--active' : ''}`}
            onClick={() => {
              if (!showThemePicker) setThemeBeforePicker(theme)
              setShowThemePicker((prev) => !prev)
            }}
            title="Change theme"
          >
            <span className="app__theme-btn-eyebrow">THEME</span>
            <span className="app__theme-btn-row">
              <span className="app__theme-btn-swatch" />
              <span className="app__theme-btn-name">
                {themeList.find((t) => t.name === theme)?.displayName}
              </span>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </span>
          </button>
          {availableModes.length > 0 && (
            <ModeSelector
              modes={availableModes}
              currentMode={currentMode}
              onSelectMode={handleModeChange}
            />
          )}
        </div>
        <div className="app__header-right">
          {voiceIO.isListening && (
            <div className="app__recording-indicator">
              <span className="app__recording-dot" />
              <span className="app__recording-label">REC</span>
            </div>
          )}
          <button
            className={`app__header-btn app__header-btn--eject ${isTapeEjected ? 'app__header-btn--active' : ''}`}
            onClick={() => setIsTapeEjected((prev) => !prev)}
            title={isTapeEjected ? 'Close conversations' : 'Conversations'}
            aria-label={isTapeEjected ? 'Close conversations' : 'Conversations'}
            aria-expanded={isTapeEjected}
          >
            {HEADER_ICONS.conversations}
          </button>
          {/* Secondary actions: inline on wide screens, in the overflow menu on narrow ones */}
          {headerActions.map((action) => (
            <button
              key={action.key}
              className={`app__header-btn app__header-btn--secondary ${action.className ?? ''}`}
              onClick={action.onSelect}
              title={action.label}
              aria-label={action.label}
            >
              {action.icon}
            </button>
          ))}
          <button
            className={`app__header-btn app__header-more-btn ${linerNotes ? 'app__header-btn--has-notes' : ''}`}
            onClick={() => setShowHeaderMenu((prev) => !prev)}
            title="More"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={showHeaderMenu}
          >
            {HEADER_ICONS.more}
          </button>
        </div>
        {showHeaderMenu && (
          <>
            <div
              className="app__mobile-menu-backdrop app__header-menu-backdrop"
              onClick={() => setShowHeaderMenu(false)}
            />
            <div
              className="app__mobile-menu app__header-menu"
              role="menu"
              aria-label="More actions"
            >
              {headerActions.map((action) => (
                <button
                  key={action.key}
                  role="menuitem"
                  className="app__mobile-menu-item"
                  onClick={() => {
                    setShowHeaderMenu(false)
                    action.onSelect()
                  }}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      <JobStatusBar />

      <main className="app__main">
        <ChatTimeline
          messages={messages}
          activities={activities}
          storedActivities={storedActivities}
          avatarState={avatarState}
          streamingText={chat.responseText}
          onImageClick={(image, gallery) => {
            setLightboxImage(image)
            setLightboxGallery(gallery)
          }}
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

        {voiceIO.voiceError && (
          <div className="app__error app__error--voice" role="alert">
            <span>{voiceIO.voiceError}</span>
            <button
              className="app__error-dismiss"
              onClick={voiceIO.dismissVoiceError}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {chat.planNotification && (
          <button
            className="app__plan-notification"
            onClick={() => {
              setShowPlans(true)
              chat.setPlanNotification(null)
            }}
          >
            Plan saved: {chat.planNotification}
          </button>
        )}
      </main>

      {showThemePicker && (
        <div className="app__theme-modal-overlay" onClick={cancelThemePicker}>
          <div className="app__theme-modal" onClick={(e) => e.stopPropagation()}>
            <div className="app__theme-modal-bubble">
              <h2 className="app__theme-modal-title">Choose a theme</h2>
              <p className="app__theme-modal-subtitle">
                Pick a vibe. You can always change it later.
              </p>
            </div>
            <div className="app__theme-modal-grid">
              {themeList.map((t) => (
                <button
                  key={t.name}
                  className={`onboarding__theme-swatch onboarding__theme-swatch--${t.name} ${theme === t.name ? 'onboarding__theme-swatch--active' : ''}`}
                  onClick={() => setTheme(t.name)}
                >
                  <span className="onboarding__theme-swatch-label">{t.displayName}</span>
                </button>
              ))}
            </div>
            <div className="app__theme-modal-actions">
              <button className="app__theme-modal-cancel" onClick={cancelThemePicker}>
                Cancel
              </button>
              <button
                className="app__theme-modal-confirm"
                onClick={() => {
                  setShowThemePicker(false)
                  setThemeBeforePicker(null)
                }}
              >
                Choose theme
              </button>
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
        currentConversation={conversations.find((c) => c.id === currentConversationId) || null}
        conversations={conversations}
        transcript={transcript}
        isListening={voiceIO.isListening}
        isEjected={isTapeEjected}
        onSubmit={chat.handleSendMessage}
        onSelectConversation={(id) => {
          loadConversation(id)
          setIsTapeEjected(false)
        }}
        onNewConversation={() => {
          createConversation()
          setIsTapeEjected(false)
        }}
        onDeleteConversation={deleteConversation}
        onBranchConversation={(id) => {
          createConversation(id)
          setIsTapeEjected(false)
        }}
        onCloseCollection={() => setIsTapeEjected(false)}
        onFilesAdd={handleFilesAdd}
        isDisabled={voiceIO.isSpeaking || avatarState === 'thinking'}
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
          onClose={() => {
            setLightboxImage(null)
            setLightboxGallery(undefined)
          }}
        />
      )}

      {showSettings && (
        <Settings
          ttsEnabled={ttsEnabled}
          setTtsEnabled={setTtsEnabled}
          ttsVoice={ttsVoice}
          setTtsVoice={setTtsVoice}
          soundEffectsEnabled={soundEffectsEnabled}
          setSoundEffectsEnabled={setSoundEffectsEnabled}
          continuousListeningEnabled={continuousListeningEnabled}
          setContinuousListeningEnabled={setContinuousListeningEnabled}
          wakeWordEnabled={wakeWordEnabled}
          setWakeWordEnabled={setWakeWordEnabled}
          customWakeWord={customWakeWord}
          setCustomWakeWord={setCustomWakeWord}
          customTriggerWord={customTriggerWord}
          setCustomTriggerWord={setCustomTriggerWord}
          triggerWordDelay={triggerWordDelay}
          setTriggerWordDelay={setTriggerWordDelay}
          currentConversationTitle={
            conversations.find((c) => c.id === currentConversationId)?.title || 'New conversation'
          }
          currentConversation={conversations.find((c) => c.id === currentConversationId) || null}
          onRenameConversation={(title) => {
            if (currentConversationId)
              useStore.getState().renameConversation(currentConversationId, title)
          }}
          onResetOnboarding={() => {
            localStorage.removeItem('wtb_onboarded')
            setHasOnboarded(false)
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showMediaLibrary && (
        <MediaLibrary conversations={conversations} onClose={() => setShowMediaLibrary(false)} />
      )}

      <LinerNotes
        isOpen={showLinerNotes}
        linerNotes={linerNotes}
        conversationTitle={
          conversations.find((c) => c.id === currentConversationId)?.title || 'New conversation'
        }
        onSave={(notes) => {
          if (currentConversationId) saveLinerNotes(currentConversationId, notes)
        }}
        onClose={() => setShowLinerNotes(false)}
      />

      <SearchOverlay
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onSelectResult={(conversationId) => {
          loadConversation(conversationId)
          setIsTapeEjected(false)
        }}
      />

      <Plans
        isOpen={showPlans}
        onClose={() => setShowPlans(false)}
        conversationId={currentConversationId || undefined}
        conversationTitle={conversations.find((c) => c.id === currentConversationId)?.title}
        onNavigateToConversation={(id) => {
          loadConversation(id)
          setShowPlans(false)
          setIsTapeEjected(false)
        }}
      />

      <KeyboardShortcuts isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      <button
        ref={fabRef}
        className={`app__record-fab ${voiceIO.isListening ? 'app__record-fab--recording' : ''} ${showTapToTalk ? 'app__record-fab--tap-to-talk' : ''} ${isDraggingFab ? 'app__record-fab--dragging' : ''}`}
        style={{ right: fabPosition.x, bottom: fabPosition.y, width: fabSize, height: fabSize }}
        onClick={() => {
          if (dragStartRef.current) return
          if (continuousListeningEnabled && voiceIO.isListening) {
            voiceIO.handleTalkEnd()
          } else {
            voiceIO.handleTalkStart()
          }
        }}
        onMouseDown={handleFabDragStart}
        onTouchStart={(e) => {
          const touchStart = Date.now()
          const touch = e.touches[0]
          if (!touch) return
          const startX = touch.clientX
          const startY = touch.clientY
          const checkForDrag = setTimeout(() => handleFabDragStart(e), 300)
          const handleTouchMove = (moveE: TouchEvent) => {
            // Empty on touchend/touchcancel.
            const moveTouch = moveE.touches[0]
            if (!moveTouch) return
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
            if (!isDraggingFab && Date.now() - touchStart < 300) {
              if (continuousListeningEnabled && voiceIO.isListening) {
                voiceIO.handleTalkEnd()
              } else {
                voiceIO.handleTalkStart()
              }
            }
          }
          window.addEventListener('touchmove', handleTouchMove)
          window.addEventListener('touchend', handleTouchEnd)
        }}
        disabled={voiceIO.isSpeaking || avatarState === 'thinking' || isTapeEjected}
        aria-label={voiceIO.isListening ? 'Stop recording' : 'Start recording'}
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
        </svg>
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
