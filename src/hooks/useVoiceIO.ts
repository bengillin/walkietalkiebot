import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpeechRecognition } from '../components/voice/useSpeechRecognition'
import { useSpeechSynthesis } from '../components/voice/useSpeechSynthesis'
import { useWakeWord } from '../components/voice/useWakeWord'
import {
  MAX_SPEECH_RETRIES,
  describeSpeechError,
  isBenignSpeechError,
  isFatalSpeechError,
} from '../components/voice/speechErrors'
import { useSoundEffects } from './useSoundEffects'
import type { AvatarState } from '../types'

import { createLogger } from '../lib/logger'

const log = createLogger('voice')

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

  // Recognition health, so automatic (re)starts — continuous listening, wake
  // word — can stop instead of looping on a mic that will never work.
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [micBlocked, setMicBlocked] = useState(false)
  const [recognitionFailures, setRecognitionFailuresState] = useState(0)
  const failuresRef = useRef(0)
  const setRecognitionFailures = useCallback((n: number) => {
    failuresRef.current = n
    setRecognitionFailuresState(n)
  }, [])
  const reportVoiceError = useCallback((message: string) => {
    // One message, not one per attempt
    setVoiceError((prev) => prev ?? message)
  }, [])
  const dismissVoiceError = useCallback(() => setVoiceError(null), [])

  // Speech recognition
  const {
    isListening,
    isSupported: sttSupported,
    start: startListening,
    stop: stopListening,
    clearTranscript: clearSpeechTranscript,
  } = useSpeechRecognition({
    onInterimResult: (text) => {
      setRecognitionFailures(0)
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
      finalTranscriptRef.current = ''
      if (isFatalSpeechError(err)) {
        setMicBlocked(true)
        reportVoiceError(describeSpeechError(err))
        setTranscript('')
      } else {
        if (!isBenignSpeechError(err)) {
          const failures = failuresRef.current + 1
          setRecognitionFailures(failures)
          if (failures >= MAX_SPEECH_RETRIES) {
            reportVoiceError(
              `Voice input paused after repeated errors. ${describeSpeechError(err)}`,
            )
          }
        }
        setTranscript(`Speech recognition error: ${err}`)
      }
      setAvatarState('confused')
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
      log.error('TTS error:', err)
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
      log.debug('Wake word detected, starting recording')
      handleTalkStart()
    },
    onError: reportVoiceError,
  })

  // Talk handlers
  // Automatic start (continuous listening): respects the failure state
  const autoTalkStart = useCallback(() => {
    finalTranscriptRef.current = ''
    triggerWordUsedRef.current = false
    playSound('startListening')
    startListening()
  }, [startListening, playSound])

  // Explicit start (button, spacebar, wake word): always gets to try again
  const handleTalkStart = useCallback(() => {
    setMicBlocked(false)
    setRecognitionFailures(0)
    autoTalkStart()
  }, [autoTalkStart, setRecognitionFailures])

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
    autoTalkStart,
    handleTalkEnd,
    clearSpeechTranscript,
    isAvatarHoverHappy,
    playSound,
    startListening,
    stopListening,
    finalTranscriptRef,
    voiceError,
    dismissVoiceError,
    micBlocked,
    recognitionFailures,
  }
}
