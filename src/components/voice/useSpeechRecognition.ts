import { useEffect, useRef, useCallback, useState } from 'react'

interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string) => void
  onInterimResult?: (transcript: string) => void
  onError?: (error: string) => void
  onEnd?: () => void
  continuous?: boolean
  language?: string
}

interface SpeechRecognitionResult {
  isListening: boolean
  isSupported: boolean
  start: () => void
  stop: () => void
  transcript: string
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
  continuous = false,
  language = 'en-US',
}: UseSpeechRecognitionOptions = {}): SpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Use refs for callbacks to avoid recreating recognition on every render
  const onResultRef = useRef(onResult)
  const onInterimResultRef = useRef(onInterimResult)
  const onErrorRef = useRef(onError)
  const onEndRef = useRef(onEnd)

  // Keep refs up to date
  useEffect(() => {
    onResultRef.current = onResult
    onInterimResultRef.current = onInterimResult
    onErrorRef.current = onError
    onEndRef.current = onEnd
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

      if (interimTranscript) {
        setTranscript(interimTranscript)
        onInterimResultRef.current?.(interimTranscript)
      }

      if (finalTranscript) {
        setTranscript(finalTranscript)
        onResultRef.current?.(finalTranscript)
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
    }
  }, [isSupported, continuous, language])

  const start = useCallback(() => {
    console.log('[Speech] start() called, recognitionRef:', !!recognitionRef.current)
    if (recognitionRef.current) {
      setTranscript('')
      try {
        recognitionRef.current.start()
      } catch (e) {
        console.error('Failed to start recognition:', e)
      }
    }
  }, [])

  const stop = useCallback(() => {
    console.log('[Speech] stop() called')
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }, [])

  return {
    isListening,
    isSupported,
    start,
    stop,
    transcript,
  }
}
