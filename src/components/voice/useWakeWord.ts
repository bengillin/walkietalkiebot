import { useEffect, useRef, useCallback, useState } from 'react'

import { createLogger } from '../../lib/logger'
import {
  MAX_SPEECH_RETRIES,
  describeSpeechError,
  isBenignSpeechError,
  isFatalSpeechError,
  speechRetryDelay,
} from './speechErrors'

const log = createLogger('wake-word')

interface UseWakeWordOptions {
  wakeWord?: string
  onWakeWord?: () => void
  // Called once when wake word detection gives up (mic blocked/missing, or
  // repeated failures), with a message for the user
  onError?: (message: string) => void
  enabled?: boolean
  language?: string
}

interface UseWakeWordResult {
  isListening: boolean
  isSupported: boolean
  lastHeard: string
  // Why detection stopped for good, if it did
  error: string | null
}

/**
 * Wake word detection hook using the Web Speech API.
 * Runs continuously in the background, listening for a trigger phrase.
 * When the wake word is detected, it calls onWakeWord callback.
 */
export function useWakeWord({
  wakeWord = 'hey talkie',
  onWakeWord,
  onError,
  enabled = false,
  language = 'en-US',
}: UseWakeWordOptions = {}): UseWakeWordResult {
  const [isListening, setIsListening] = useState(false)
  const [lastHeard, setLastHeard] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const onWakeWordRef = useRef(onWakeWord)
  const enabledRef = useRef(enabled)
  const onErrorRef = useRef(onError)
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Persist across effect re-runs (which happen on every push-to-talk turn):
  // once the mic is blocked, stop trying until the page reloads or the wake
  // word / language changes, instead of hammering a denied permission.
  const blockedRef = useRef(false)
  const failuresRef = useRef(0)

  // Keep refs up to date
  useEffect(() => {
    onWakeWordRef.current = onWakeWord
    onErrorRef.current = onError
    enabledRef.current = enabled
  })

  // A new configuration gets a fresh chance
  useEffect(() => {
    blockedRef.current = false
    failuresRef.current = 0
    setError(null)
  }, [wakeWord, language])

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Normalize text for comparison
  const normalize = useCallback((text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // remove punctuation
      .replace(/\s+/g, ' ') // normalize whitespace
      .trim()
  }, [])

  // Check if text contains the wake word
  const containsWakeWord = useCallback(
    (text: string, wake: string) => {
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

      return variants.some((v) => normalText.includes(v))
    },
    [normalize],
  )

  useEffect(() => {
    if (!isSupported || !enabled || blockedRef.current) {
      // Stop if disabled
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
      setIsListening(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language

    recognition.onstart = () => {
      log.debug('Started listening for:', wakeWord)
      setIsListening(true)
    }

    const giveUp = (message: string) => {
      blockedRef.current = true
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      setError(message)
      onErrorRef.current?.(message)
    }

    recognition.onresult = (event) => {
      failuresRef.current = 0 // hearing anything means the mic works
      // Check both interim and final results for faster response
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result?.[0]?.transcript
        if (!transcript) continue

        setLastHeard(transcript)

        if (containsWakeWord(transcript, wakeWord)) {
          log.debug('Wake word detected in:', transcript)
          // Stop listening temporarily to avoid double-triggers
          recognition.stop()
          onWakeWordRef.current?.()
          return
        }
      }
    }

    recognition.onerror = (event) => {
      // "no-speech" (silence) and "aborted" (our own stop) are normal here
      if (isBenignSpeechError(event.error)) return

      setIsListening(false)
      if (isFatalSpeechError(event.error)) {
        // Permission/hardware: retrying can't help, and each retry may re-prompt
        log.warn('Wake word disabled:', event.error)
        giveUp(describeSpeechError(event.error))
        return
      }
      failuresRef.current += 1
      log.warn(`Error (${failuresRef.current}/${MAX_SPEECH_RETRIES}):`, event.error)
      if (failuresRef.current >= MAX_SPEECH_RETRIES) {
        giveUp(`Wake word stopped: ${describeSpeechError(event.error)}`)
      }
    }

    recognition.onend = () => {
      log.debug('Ended')
      setIsListening(false)

      // Auto-restart if still enabled, backing off after failures
      if (enabledRef.current && !blockedRef.current) {
        restartTimeoutRef.current = setTimeout(
          () => {
            if (enabledRef.current && !blockedRef.current && recognitionRef.current) {
              try {
                log.debug('Auto-restarting...')
                recognitionRef.current.start()
              } catch (e) {
                log.error('Failed to restart:', e)
              }
            }
          },
          speechRetryDelay(failuresRef.current, 300),
        )
      }
    }

    recognitionRef.current = recognition

    // Start listening
    try {
      recognition.start()
    } catch (e) {
      log.error('Failed to start:', e)
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
    error,
  }
}
