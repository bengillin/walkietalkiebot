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
  speakStreaming: (text: string, isComplete: boolean) => void
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

  // For streaming: buffer text and queue of sentences
  const bufferRef = useRef('')
  const queueRef = useRef<string[]>([])
  const isProcessingQueueRef = useRef(false)
  const hasStartedRef = useRef(false)

  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  // Refs for callbacks to avoid recreating effects
  const onStartRef = useRef(onStart)
  const onEndRef = useRef(onEnd)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onStartRef.current = onStart
    onEndRef.current = onEnd
    onErrorRef.current = onError
  })

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

  const getVoice = useCallback(() => {
    if (voice && voices.length > 0) {
      const selectedVoice = voices.find(
        (v) => v.name === voice || v.voiceURI === voice
      )
      if (selectedVoice) return selectedVoice
    }
    if (voices.length > 0) {
      return voices.find(
        (v) => v.lang.startsWith('en') && v.name.includes('Google')
      ) || voices.find((v) => v.lang.startsWith('en')) || null
    }
    return null
  }, [voice, voices])

  const processQueue = useCallback(() => {
    if (!isSupported || isProcessingQueueRef.current) {
      return
    }

    // Queue empty - check if we need to signal completion
    if (queueRef.current.length === 0) {
      if (hasStartedRef.current) {
        setIsSpeaking(false)
        hasStartedRef.current = false
        onEndRef.current?.()
      }
      return
    }

    const sentence = queueRef.current.shift()
    if (!sentence) return

    isProcessingQueueRef.current = true
    const utterance = new SpeechSynthesisUtterance(sentence)

    const selectedVoice = getVoice()
    if (selectedVoice) utterance.voice = selectedVoice

    utterance.pitch = pitch
    utterance.rate = rate

    utterance.onstart = () => {
      if (!hasStartedRef.current) {
        hasStartedRef.current = true
        setIsSpeaking(true)
        onStartRef.current?.()
      }
    }

    utterance.onend = () => {
      isProcessingQueueRef.current = false
      // Process next sentence
      processQueue()
    }

    utterance.onerror = (event) => {
      isProcessingQueueRef.current = false
      setIsSpeaking(false)
      hasStartedRef.current = false
      onErrorRef.current?.(event.error)
    }

    window.speechSynthesis.speak(utterance)
  }, [isSupported, getVoice, pitch, rate])

  // Extract complete sentences from buffer
  const extractSentences = (text: string): { sentences: string[], remaining: string } => {
    // Match sentence endings followed by space, or at end of text
    const sentences: string[] = []
    let remaining = text

    // Look for sentence boundaries (. ! ?) followed by space or end
    const sentencePattern = /^(.*?[.!?])(\s+|$)/
    let match

    while ((match = sentencePattern.exec(remaining)) !== null) {
      const sentence = match[1].trim()
      if (sentence) sentences.push(sentence)
      remaining = remaining.slice(match[0].length)
      if (!remaining) break
    }

    return { sentences, remaining }
  }

  // Streaming speech: add text chunk, speak complete sentences
  const speakStreaming = useCallback((chunk: string, isComplete: boolean) => {
    if (!isSupported) return

    bufferRef.current += chunk

    const { sentences, remaining } = extractSentences(bufferRef.current)
    bufferRef.current = remaining

    // Queue complete sentences
    for (const sentence of sentences) {
      queueRef.current.push(sentence)
    }

    // If complete, queue any remaining text
    if (isComplete && bufferRef.current.trim()) {
      queueRef.current.push(bufferRef.current.trim())
      bufferRef.current = ''
    }

    // Start processing queue if not already
    processQueue()
  }, [isSupported, processQueue])

  // Regular speak: cancel and speak full text
  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text) return

      // Cancel any ongoing speech and clear queue
      window.speechSynthesis.cancel()
      queueRef.current = []
      bufferRef.current = ''
      isProcessingQueueRef.current = false
      hasStartedRef.current = false

      const utterance = new SpeechSynthesisUtterance(text)

      const selectedVoice = getVoice()
      if (selectedVoice) utterance.voice = selectedVoice

      utterance.pitch = pitch
      utterance.rate = rate

      utterance.onstart = () => {
        setIsSpeaking(true)
        onStartRef.current?.()
      }

      utterance.onend = () => {
        setIsSpeaking(false)
        onEndRef.current?.()
      }

      utterance.onerror = (event) => {
        setIsSpeaking(false)
        onErrorRef.current?.(event.error)
      }

      window.speechSynthesis.speak(utterance)
    },
    [isSupported, getVoice, pitch, rate]
  )

  const cancel = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel()
      queueRef.current = []
      bufferRef.current = ''
      isProcessingQueueRef.current = false
      hasStartedRef.current = false
      setIsSpeaking(false)
    }
  }, [isSupported])

  return {
    speak,
    speakStreaming,
    cancel,
    isSpeaking,
    isSupported,
    voices,
  }
}
