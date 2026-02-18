import { useEffect } from 'react'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { exportConversation } from '../lib/export'
import type { AvatarState, Conversation } from '../types'
import type { SoundType } from './useSoundEffects'

interface UseKeyboardControlParams {
  isListening: boolean
  isSpeaking: boolean
  avatarState: AvatarState
  useClaudeCode: boolean
  apiKey: string
  continuousListeningEnabled: boolean
  handleTalkStart: () => void
  handleTalkEnd: () => void
  stopListening: () => void
  startListening: () => void
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
  isListening,
  isSpeaking,
  avatarState,
  useClaudeCode,
  apiKey,
  continuousListeningEnabled,
  handleTalkStart,
  handleTalkEnd,
  stopListening,
  startListening,
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
      if (isListening) {
        playSound('stopListening')
        stopListening()
        setTranscript('')
        finalTranscriptRef.current = ''
        setAvatarState('idle')
      }
    },
    onCmdK: () => {
      setShowSearch(prev => !prev)
    },
    onCmdE: () => {
      const conv = conversations.find(c => c.id === currentConversationId)
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
        setShowShortcuts(prev => !prev)
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

  // Detect mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  // Auto-start listening when continuous mode is enabled
  useEffect(() => {
    if (continuousListeningEnabled && !isListening && avatarState === 'idle') {
      const canTalk = useClaudeCode || apiKey
      if (canTalk && !isSpeaking) {
        handleTalkStart()
      }
    }
  }, [continuousListeningEnabled, isListening, avatarState, useClaudeCode, apiKey, isSpeaking, handleTalkStart])

  // Restart listening after response in continuous mode (desktop only)
  useEffect(() => {
    if (isMobile) return
    if (continuousListeningEnabled && avatarState === 'idle' && !isListening && !isSpeaking) {
      const canTalk = useClaudeCode || apiKey
      if (canTalk) {
        const timer = setTimeout(() => {
          startListening()
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [continuousListeningEnabled, avatarState, isListening, isSpeaking, useClaudeCode, apiKey, startListening, isMobile])

  // On mobile, show visual prompt to tap when ready
  const showTapToTalk = isMobile && continuousListeningEnabled && avatarState === 'idle' && !isListening && !isSpeaking

  return { showTapToTalk, isMobile }
}
