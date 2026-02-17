import { useEffect, useRef, useCallback, useState } from 'react'

interface UseWakeWordOptions {
  wakeWord?: string
  onWakeWord?: () => void
  enabled?: boolean
  language?: string
}

interface UseWakeWordResult {
  isListening: boolean
  isSupported: boolean
  lastHeard: string
}

/**
 * Wake word detection hook using the Web Speech API.
 * Runs continuously in the background, listening for a trigger phrase.
 * When the wake word is detected, it calls onWakeWord callback.
 */
export function useWakeWord({
  wakeWord = 'hey talkie',
  onWakeWord,
  enabled = false,
  language = 'en-US',
}: UseWakeWordOptions = {}): UseWakeWordResult {
  const [isListening, setIsListening] = useState(false)
  const [lastHeard, setLastHeard] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const onWakeWordRef = useRef(onWakeWord)
  const enabledRef = useRef(enabled)
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep refs up to date
  useEffect(() => {
    onWakeWordRef.current = onWakeWord
    enabledRef.current = enabled
  })

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Normalize text for comparison
  const normalize = useCallback((text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // remove punctuation
      .replace(/\s+/g, ' ')    // normalize whitespace
      .trim()
  }, [])

  // Check if text contains the wake word
  const containsWakeWord = useCallback((text: string, wake: string) => {
    const normalText = normalize(text)
    const normalWake = normalize(wake)

    // Exact match or contains
    if (normalText.includes(normalWake)) {
      return true
    }

    // Also try common mishearings
    const variants = [
      normalWake,
      normalWake.replace('hey', 'hay'),
      normalWake.replace('hey', 'a'),
      normalWake.replace('talkie', 'talk boy'),
      normalWake.replace('talkie', 'talk voice'),
      normalWake.replace('talkie', 'doc boy'),
    ]

    return variants.some(v => normalText.includes(v))
  }, [normalize])

  useEffect(() => {
    if (!isSupported || !enabled) {
      // Stop if disabled
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
      setIsListening(false)
      return
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language

    recognition.onstart = () => {
      console.log('[WakeWord] Started listening for:', wakeWord)
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      // Check both interim and final results for faster response
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript

        setLastHeard(transcript)

        if (containsWakeWord(transcript, wakeWord)) {
          console.log('[WakeWord] Wake word detected in:', transcript)
          // Stop listening temporarily to avoid double-triggers
          recognition.stop()
          onWakeWordRef.current?.()
          return
        }
      }
    }

    recognition.onerror = (event) => {
      // Ignore "no-speech" errors - that's normal for wake word detection
      if (event.error === 'no-speech') {
        return
      }
      // Ignore "aborted" - we do this intentionally
      if (event.error === 'aborted') {
        return
      }
      console.error('[WakeWord] Error:', event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      console.log('[WakeWord] Ended')
      setIsListening(false)

      // Auto-restart if still enabled (after a brief pause)
      if (enabledRef.current) {
        restartTimeoutRef.current = setTimeout(() => {
          if (enabledRef.current && recognitionRef.current) {
            try {
              console.log('[WakeWord] Auto-restarting...')
              recognitionRef.current.start()
            } catch (e) {
              console.error('[WakeWord] Failed to restart:', e)
            }
          }
        }, 300)
      }
    }

    recognitionRef.current = recognition

    // Start listening
    try {
      recognition.start()
    } catch (e) {
      console.error('[WakeWord] Failed to start:', e)
    }

    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      recognition.abort()
      recognitionRef.current = null
    }
  }, [isSupported, enabled, language, wakeWord, containsWakeWord])

  return {
    isListening,
    isSupported,
    lastHeard,
  }
}
