import { useEffect } from 'react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { exportConversation } from '../lib/export'
import type { AvatarState, Conversation } from '../types'
import type { SoundType } from './useSoundEffects'
import { MAX_SPEECH_RETRIES, speechRetryDelay } from '../components/voice/speechErrors'

interface UseKeyboardControlParams {
  // Close the topmost open panel/overlay; returns false if nothing was open
  closeTopmostLayer?: () => boolean
  isListening: boolean
  isSpeaking: boolean
  avatarState: AvatarState
  continuousListeningEnabled: boolean
  handleTalkStart: () => void
  // Start used by continuous listening's automatic (re)starts
  autoTalkStart?: () => void
  handleTalkEnd: () => void
  // The mic is blocked/missing: automatic starts would just fail again
  micBlocked?: boolean
  // Consecutive transient recognition failures (drives backoff)
  recognitionFailures?: number
  stopListening: () => void
  startListening?: () => void
  setTranscript: (text: string) => void
  setAvatarState: (state: AvatarState) => void
  playSound: (sound: SoundType) => void
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>
  setShowShortcuts: React.Dispatch<React.SetStateAction<boolean>>
  currentConversationId: string | null
  conversations: Conversation[]
  finalTranscriptRef: React.MutableRefObject<string>
}

export function useKeyboardControl({
  closeTopmostLayer,
  isListening,
  isSpeaking,
  avatarState,
  continuousListeningEnabled,
  handleTalkStart,
  autoTalkStart = handleTalkStart,
  handleTalkEnd,
  micBlocked = false,
  recognitionFailures = 0,
  stopListening,
  setTranscript,
  setAvatarState,
  playSound,
  setShowSearch,
  setShowShortcuts,
  currentConversationId,
  conversations,
  finalTranscriptRef,
}: UseKeyboardControlParams) {
  // Keyboard shortcuts (Escape, Cmd+K, Cmd+E)
  useKeyboardShortcuts({
    isRecording: isListening,
    onEscape: () => {
      // Recording takes priority: Escape cancels it and leaves panels alone
      if (isListening) {
        playSound('stopListening')
        stopListening()
        setTranscript('')
        finalTranscriptRef.current = ''
        setAvatarState('idle')
        return true
      }
      return closeTopmostLayer?.() ?? false
    },
    onCmdK: () => {
      setShowSearch((prev) => !prev)
    },
    onCmdE: () => {
      const conv = conversations.find((c) => c.id === currentConversationId)
      if (conv && conv.messages.length > 0) {
        exportConversation(conv, 'markdown')
      }
    },
  })

  // ? key to show keyboard shortcuts guide
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        const active = document.activeElement
        if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return
        setShowShortcuts((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setShowShortcuts])

  // Spacebar push-to-talk (disabled in continuous mode)
  useEffect(() => {
    if (continuousListeningEnabled) return

    const isInputFocused = () => {
      const active = document.activeElement
      return active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA'
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isInputFocused()) {
        e.preventDefault()
        if (!isListening && !isSpeaking && avatarState !== 'thinking') {
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
  }, [
    isListening,
    isSpeaking,
    avatarState,
    handleTalkStart,
    handleTalkEnd,
    continuousListeningEnabled,
  ])

  // Detect mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  // Continuous mode: (re)start listening whenever idle. On errors, back off
  // exponentially; stop entirely when the mic is blocked or after repeated
  // failures (an explicit push-to-talk resets both).
  useEffect(() => {
    if (!continuousListeningEnabled || isListening || isSpeaking || avatarState !== 'idle') {
      return undefined
    }
    if (micBlocked || recognitionFailures >= MAX_SPEECH_RETRIES) return undefined
    const delay = recognitionFailures === 0 ? 0 : speechRetryDelay(recognitionFailures, 500)
    const timer = setTimeout(() => autoTalkStart(), delay)
    return () => clearTimeout(timer)
  }, [
    continuousListeningEnabled,
    isListening,
    isSpeaking,
    avatarState,
    micBlocked,
    recognitionFailures,
    autoTalkStart,
  ])

  // On mobile, show visual prompt to tap when ready
  const showTapToTalk =
    isMobile && continuousListeningEnabled && avatarState === 'idle' && !isListening && !isSpeaking

  return { showTapToTalk, isMobile }
}
