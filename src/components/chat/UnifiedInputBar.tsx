import { useState, useCallback, useEffect, useRef, KeyboardEvent } from 'react'
import './UnifiedInputBar.css'

interface UnifiedInputBarProps {
  // Text/transcript state
  transcript: string
  isListening: boolean
  // Actions
  onSubmit: (text: string) => void
  onTalkStart: () => void
  onTalkEnd: () => void
  onGalleryOpen: () => void
  // State flags
  isDisabled: boolean
  continuousListening: boolean
  triggerWord: string
}

export function UnifiedInputBar({
  transcript,
  isListening,
  onSubmit,
  onTalkStart,
  onTalkEnd,
  onGalleryOpen,
  isDisabled,
  continuousListening,
  triggerWord,
}: UnifiedInputBarProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastSubmittedRef = useRef<string>('')

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [])

  // Sync transcript into text field while listening
  useEffect(() => {
    // Skip syncing if transcript matches what we just submitted
    if (transcript && transcript.trim() === lastSubmittedRef.current) {
      return
    }
    if (isListening && transcript) {
      setText(transcript)
    }
  }, [transcript, isListening])

  // Adjust height when text changes
  useEffect(() => {
    adjustTextareaHeight()
  }, [text, adjustTextareaHeight])

  const handleSubmit = useCallback(() => {
    const toSend = text.trim()
    if (toSend && !isDisabled) {
      lastSubmittedRef.current = toSend
      onSubmit(toSend)
      setText('')
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      // Clear lastSubmittedRef after a short delay so future transcripts can sync
      setTimeout(() => {
        lastSubmittedRef.current = ''
      }, 500)
    }
  }, [text, isDisabled, onSubmit])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Handle mic button press
  const handleMicMouseDown = () => {
    if (!isDisabled && !continuousListening) {
      setText('') // Clear any old text when starting to listen
      onTalkStart()
    }
  }

  const handleMicMouseUp = () => {
    if (isListening && !continuousListening) {
      onTalkEnd()
    }
  }

  const placeholderText = continuousListening
    ? `Say "${triggerWord}" to send...`
    : isListening
    ? 'Listening...'
    : 'Type or hold mic to speak...'

  return (
    <div className={`unified-input-bar ${isListening ? 'listening' : ''}`}>
      {/* Gallery/Photo button */}
      <button
        className="unified-input-bar__gallery"
        onClick={onGalleryOpen}
        disabled={isDisabled}
        aria-label="Open photo gallery"
        title="Photos"
      >
        <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
          <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor"/>
          <path d="M21 15l-5-5-4 4-2-2-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Text input field */}
      <div className="unified-input-bar__field-wrapper">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={isDisabled}
          className={`unified-input-bar__field ${isListening ? 'listening' : ''}`}
          rows={1}
        />
        {isListening && (
          <div className="unified-input-bar__listening-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
      </div>

      {/* Mic button - only show if not in continuous mode */}
      {!continuousListening && (
        <button
          className={`unified-input-bar__mic ${isListening ? 'active' : ''}`}
          onMouseDown={handleMicMouseDown}
          onMouseUp={handleMicMouseUp}
          onTouchStart={handleMicMouseDown}
          onTouchEnd={handleMicMouseUp}
          onMouseLeave={isListening ? handleMicMouseUp : undefined}
          disabled={isDisabled}
          aria-label={isListening ? 'Release to stop' : 'Hold to speak'}
          title={isListening ? 'Release to stop' : 'Hold to speak'}
        >
          {isListening ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
              <rect x="9" y="6" width="6" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </button>
      )}

      {/* Send button */}
      <button
        className="unified-input-bar__send"
        onClick={handleSubmit}
        disabled={isDisabled || !text.trim()}
        aria-label="Send message"
        title="Send"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
        </svg>
      </button>
    </div>
  )
}
