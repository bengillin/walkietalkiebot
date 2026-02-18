import { useCallback, useEffect, useRef } from 'react'
import { useSpeechRecognition } from '../components/voice/useSpeechRecognition'
import { useSpeechSynthesis } from '../components/voice/useSpeechSynthesis'
import { useWakeWord } from '../components/voice/useWakeWord'
import { useSoundEffects } from './useSoundEffects'
import type { AvatarState } from '../types'

interface UseVoiceIOParams {
  onSendMessageRef: React.MutableRefObject<(text: string) => void>
  avatarState: AvatarState
  setAvatarState: (state: AvatarState) => void
  transcript: string
  setTranscript: (text: string) => void
  ttsEnabled: boolean
  ttsVoice: string
  soundEffectsEnabled: boolean
  wakeWordEnabled: boolean
  customWakeWord: string
  customTriggerWord: string
  triggerWordDelay: number
}

export function useVoiceIO({
  onSendMessageRef,
  avatarState,
  setAvatarState,
  setTranscript,
  ttsVoice,
  soundEffectsEnabled,
  wakeWordEnabled,
  customWakeWord,
  customTriggerWord,
  triggerWordDelay,
}: UseVoiceIOParams) {
  const { play: playSound } = useSoundEffects(soundEffectsEnabled)

  // Refs for transcript capture
  const finalTranscriptRef = useRef('')
  const triggerWordUsedRef = useRef(false)
  const isAvatarHoverHappy = useRef(false)

  // Speech recognition
  const {
    isListening,
    isSupported: sttSupported,
    start: startListening,
    stop: stopListening,
    clearTranscript: clearSpeechTranscript,
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
      if (triggerWordUsedRef.current) {
        triggerWordUsedRef.current = false
        return
      }
      const textToSend = finalTranscriptRef.current.trim()
      if (textToSend) {
        onSendMessageRef.current(textToSend)
        finalTranscriptRef.current = ''
      } else {
        setAvatarState('idle')
      }
    },
    onTriggerWord: (text) => {
      triggerWordUsedRef.current = true
      finalTranscriptRef.current = ''
      if (text.trim()) {
        onSendMessageRef.current(text)
      } else {
        setAvatarState('idle')
      }
    },
    onError: (err) => {
      setTranscript(`Speech recognition error: ${err}`)
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
    isSupported: ttsSupported,
  } = useSpeechSynthesis({
    voice: ttsVoice || undefined,
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

  // Play success sound when response completes (not on hover)
  useEffect(() => {
    if (avatarState === 'happy' && !isAvatarHoverHappy.current) {
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
          body: JSON.stringify({ avatarState }),
        })
      } catch {
        // Ignore sync errors
      }
    }
    syncState()
  }, [avatarState])

  // Wake word detection
  useWakeWord({
    wakeWord: customWakeWord || 'hey talkie',
    enabled: wakeWordEnabled && !isListening && !isSpeaking && avatarState !== 'thinking',
    onWakeWord: () => {
      console.log('[App] Wake word detected, starting recording')
      handleTalkStart()
    },
  })

  // Talk handlers
  const handleTalkStart = useCallback(() => {
    finalTranscriptRef.current = ''
    triggerWordUsedRef.current = false
    playSound('startListening')
    startListening()
  }, [startListening, playSound])

  const handleTalkEnd = useCallback(() => {
    playSound('stopListening')
    stopListening()
  }, [stopListening, playSound])

  return {
    isListening,
    isSpeaking,
    sttSupported,
    ttsSupported,
    speak,
    speakStreaming,
    handleTalkStart,
    handleTalkEnd,
    clearSpeechTranscript,
    isAvatarHoverHappy,
    playSound,
    startListening,
    stopListening,
    finalTranscriptRef,
  }
}
