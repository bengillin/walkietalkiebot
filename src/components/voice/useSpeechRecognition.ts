import { useEffect, useRef, useCallback, useState } from 'react'

interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string) => void
  onInterimResult?: (transcript: string) => void
  onError?: (error: string) => void
  onEnd?: () => void
  onTriggerWord?: (transcript: string) => void
  continuous?: boolean
  language?: string
  triggerWord?: string
  triggerWordDelay?: number  // ms of silence required after trigger word (default 1000)
}

interface SpeechRecognitionResult {
  isListening: boolean
  isSupported: boolean
  start: () => void
  stop: () => void
  transcript: string
  clearTranscript: () => void
}

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResultItem
}

interface SpeechRecognitionResultItem {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export function useSpeechRecognition({
  onResult,
  onInterimResult,
  onError,
  onEnd,
  onTriggerWord,
  continuous = true,
  language = 'en-US',
  triggerWord,
  triggerWordDelay = 1000,
}: UseSpeechRecognitionOptions = {}): SpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscriptState] = useState('')
  const transcriptRef = useRef('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const fullTranscriptRef = useRef('')

  // Wrapper to avoid re-renders when transcript hasn't changed
  const setTranscript = useCallback((value: string) => {
    if (transcriptRef.current !== value) {
      transcriptRef.current = value
      setTranscriptState(value)
    }
  }, [])
  const triggerFiredRef = useRef(false)
  const triggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTriggerTranscriptRef = useRef('')

  // Use refs for callbacks to avoid recreating recognition on every render
  const onResultRef = useRef(onResult)
  const onInterimResultRef = useRef(onInterimResult)
  const onErrorRef = useRef(onError)
  const onEndRef = useRef(onEnd)
  const onTriggerWordRef = useRef(onTriggerWord)
  const triggerWordRef = useRef(triggerWord)
  const triggerWordDelayRef = useRef(triggerWordDelay)

  // Keep refs up to date
  useEffect(() => {
    onResultRef.current = onResult
    onInterimResultRef.current = onInterimResult
    onErrorRef.current = onError
    onEndRef.current = onEnd
    onTriggerWordRef.current = onTriggerWord
    triggerWordRef.current = triggerWord
    triggerWordDelayRef.current = triggerWordDelay
  })

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  useEffect(() => {
    if (!isSupported) return

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.lang = language

    recognition.onstart = () => {
      console.log('[Speech] Started listening')
      setIsListening(true)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      console.log('[Speech] Result:', { interimTranscript, finalTranscript })

      // Accumulate final transcripts
      if (finalTranscript) {
        fullTranscriptRef.current += finalTranscript
      }

      // Build display transcript (accumulated + current interim)
      const displayTranscript = fullTranscriptRef.current + interimTranscript
      setTranscript(displayTranscript)

      if (interimTranscript) {
        onInterimResultRef.current?.(displayTranscript)
      }

      if (finalTranscript) {
        onResultRef.current?.(displayTranscript)
      }

      // Check for trigger word only on final results and only once
      const trigger = triggerWordRef.current
      if (trigger && finalTranscript && !triggerFiredRef.current) {
        const lowerFull = fullTranscriptRef.current.toLowerCase().trim()
        const lowerTrigger = trigger.toLowerCase()

        // Cancel any pending trigger if more speech came in
        if (triggerTimeoutRef.current) {
          clearTimeout(triggerTimeoutRef.current)
          triggerTimeoutRef.current = null
        }

        // Check if ends with trigger word (with some flexibility)
        if (lowerFull.endsWith(lowerTrigger) ||
            lowerFull.endsWith(lowerTrigger + '.') ||
            lowerFull.endsWith(lowerTrigger + ',')) {

          // Remove trigger word from transcript
          const cleanTranscript = fullTranscriptRef.current
            .replace(new RegExp(`\\s*${trigger}[.,]?\\s*$`, 'i'), '')
            .trim()

          console.log('[Speech] Trigger word detected, waiting for silence...')
          pendingTriggerTranscriptRef.current = cleanTranscript

          // Wait for silence before triggering (configurable delay)
          triggerTimeoutRef.current = setTimeout(() => {
            if (!triggerFiredRef.current) {
              triggerFiredRef.current = true
              console.log('[Speech] Silence confirmed, triggering with:', pendingTriggerTranscriptRef.current)
              recognition.stop()
              onTriggerWordRef.current?.(pendingTriggerTranscriptRef.current)
            }
          }, triggerWordDelayRef.current)
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[Speech] Error:', event.error)
      onErrorRef.current?.(event.error)
      setIsListening(false)
    }

    recognition.onend = () => {
      console.log('[Speech] Ended')
      setIsListening(false)
      onEndRef.current?.()
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
      if (triggerTimeoutRef.current) {
        clearTimeout(triggerTimeoutRef.current)
      }
    }
  }, [isSupported, continuous, language])

  const start = useCallback(() => {
    console.log('[Speech] start() called, recognitionRef:', !!recognitionRef.current)
    if (recognitionRef.current) {
      // Only update transcript state if needed to avoid re-renders
      setTranscript('')
      fullTranscriptRef.current = ''
      triggerFiredRef.current = false
      pendingTriggerTranscriptRef.current = ''
      if (triggerTimeoutRef.current) {
        clearTimeout(triggerTimeoutRef.current)
        triggerTimeoutRef.current = null
      }
      try {
        recognitionRef.current.start()
      } catch (e) {
        console.error('Failed to start recognition:', e)
      }
    }
  }, [setTranscript])

  const stop = useCallback(() => {
    console.log('[Speech] stop() called')
    if (triggerTimeoutRef.current) {
      clearTimeout(triggerTimeoutRef.current)
      triggerTimeoutRef.current = null
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }, [])

  const clearTranscript = useCallback(() => {
    setTranscript('')
    fullTranscriptRef.current = ''
  }, [setTranscript])

  return {
    isListening,
    isSupported,
    start,
    stop,
    transcript,
    clearTranscript,
  }
}
