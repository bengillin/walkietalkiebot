import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSpeechSynthesisOptions {
  voice?: string
  pitch?: number
  rate?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: string) => void
}

interface UseSpeechSynthesisResult {
  speak: (text: string) => void
  cancel: () => void
  isSpeaking: boolean
  isSupported: boolean
  voices: SpeechSynthesisVoice[]
}

export function useSpeechSynthesis({
  voice,
  pitch = 1.1,
  rate = 0.95,
  onStart,
  onEnd,
  onError,
}: UseSpeechSynthesisOptions = {}): UseSpeechSynthesisResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    if (!isSupported) return

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      setVoices(availableVoices)
    }

    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices

    return () => {
      window.speechSynthesis.cancel()
    }
  }, [isSupported])

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text) return

      // Cancel any ongoing speech
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)

      // Find the requested voice or use default
      if (voice && voices.length > 0) {
        const selectedVoice = voices.find(
          (v) => v.name === voice || v.voiceURI === voice
        )
        if (selectedVoice) {
          utterance.voice = selectedVoice
        }
      } else if (voices.length > 0) {
        // Try to find a good English voice
        const englishVoice = voices.find(
          (v) => v.lang.startsWith('en') && v.name.includes('Google')
        ) || voices.find((v) => v.lang.startsWith('en'))
        if (englishVoice) {
          utterance.voice = englishVoice
        }
      }

      utterance.pitch = pitch
      utterance.rate = rate

      utterance.onstart = () => {
        setIsSpeaking(true)
        onStart?.()
      }

      utterance.onend = () => {
        setIsSpeaking(false)
        onEnd?.()
      }

      utterance.onerror = (event) => {
        setIsSpeaking(false)
        onError?.(event.error)
      }

      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    },
    [isSupported, voice, voices, pitch, rate, onStart, onEnd, onError]
  )

  const cancel = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [isSupported])

  return {
    speak,
    cancel,
    isSpeaking,
    isSupported,
    voices,
  }
}
