import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react'
import { RetroTape, getTapeColor } from './RetroTape'
import { TapeCollection } from './TapeCollection'
import type { Conversation } from '../../types'
import './TapeDeck.css'

// Summarize title to 5 words or less (same as TapeCollection)
function summarizeTitle(title: string): string {
  const words = title.split(/\s+/).filter(Boolean)
  if (words.length <= 5) return title
  return words.slice(0, 5).join(' ')
}

interface TapeDeckProps {
  currentConversation: Conversation | null
  conversations: Conversation[]
  transcript: string
  isListening: boolean
  isEjected: boolean
  onSubmit: (text: string) => void
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  onCloseCollection: () => void
  onOpenCollection: () => void
  onClearTranscript?: () => void
  isDisabled?: boolean
  triggerWord?: string
}

export function TapeDeck({
  currentConversation,
  conversations,
  transcript,
  isListening,
  isEjected,
  onSubmit,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onCloseCollection,
  onOpenCollection,
  onClearTranscript,
  isDisabled = false,
  triggerWord = 'over',
}: TapeDeckProps) {
  const [manualInput, setManualInput] = useState('')  // What user typed manually
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const justSubmittedRef = useRef(false)
  const wasListeningRef = useRef(false)
  const lastIncorporatedTranscriptRef = useRef('')  // Track what transcript we've already incorporated

  // Compute display value: manual input + voice transcript when listening
  const inputValue = isListening && transcript
    ? (manualInput ? manualInput + ' ' + transcript : transcript)
    : manualInput

  // When listening stops, commit any transcript to manual input (only if it's new)
  useEffect(() => {
    if (!isListening && wasListeningRef.current && !justSubmittedRef.current) {
      // Listening just stopped - incorporate transcript into manual input if it's new
      if (transcript && transcript !== lastIncorporatedTranscriptRef.current) {
        setManualInput(prev => prev ? prev + ' ' + transcript : transcript)
        lastIncorporatedTranscriptRef.current = transcript
        // Clear the store transcript so it doesn't get re-added on next listen cycle
        onClearTranscript?.()
      }
    }
    wasListeningRef.current = isListening
  }, [isListening, transcript, onClearTranscript])

  const handleSubmit = () => {
    const text = inputValue.trim()
    if (text && !isDisabled) {
      justSubmittedRef.current = true
      onSubmit(text)
      setManualInput('')
      lastIncorporatedTranscriptRef.current = ''  // Reset so new transcripts can be incorporated
      // Reset the flag after a short delay
      setTimeout(() => {
        justSubmittedRef.current = false
      }, 500)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    // When listening, the displayed value includes transcript, so we need to
    // extract just the manual portion if user edits during listening
    if (isListening && transcript) {
      const newValue = e.target.value
      // If they're editing, assume they want to replace the whole thing as manual input
      // (This handles case where user deletes/edits while voice is being transcribed)
      if (!newValue.endsWith(transcript)) {
        setManualInput(newValue)
      } else {
        // They're typing before the transcript - extract that part
        const manualPart = newValue.slice(0, newValue.length - transcript.length).trimEnd()
        setManualInput(manualPart)
      }
    } else {
      setManualInput(e.target.value)
    }
    adjustTextareaHeight()
  }

  // Adjust height when input value changes (e.g., from transcript)
  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue, transcript])

  const handleSelectTape = (id: string) => {
    onSelectConversation(id)
  }

  const handleNewTape = () => {
    onNewConversation()
  }

  return (
    <div className={`tape-deck ${isListening ? 'tape-deck--recording' : ''} ${isEjected ? 'tape-deck--ejected' : ''}`}>
      {/* Tape collection drawer */}
      <TapeCollection
        conversations={conversations}
        currentId={currentConversation?.id || ''}
        isOpen={isEjected}
        onSelect={handleSelectTape}
        onNew={handleNewTape}
        onDelete={onDeleteConversation}
        onClose={onCloseCollection}
      />

      {/* Main deck area - horizontal layout */}
      <div className="tape-deck__main">
        {/* Loaded cassette display - uses same RetroTape as drawer */}
        <div className="tape-deck__cassette-slot" onClick={onOpenCollection} role="button" tabIndex={0}>
          {currentConversation && (
            <RetroTape
              title={summarizeTitle(currentConversation.title)}
              color={getTapeColor(conversations.findIndex(c => c.id === currentConversation.id))}
              tapeUsage={Math.min(currentConversation.messages.length / 50, 1)}
              size="mini"
            />
          )}
          {!currentConversation && (
            <div className="tape-deck__empty-slot">
              <span>No tape</span>
            </div>
          )}
        </div>

        {/* Input and send button - flex remaining */}
        <div className="tape-deck__controls">
          <div className="tape-deck__input-wrapper">
            <textarea
              ref={textareaRef}
              className="tape-deck__input"
              value={inputValue}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? `Listening... say "${triggerWord}" to send` : 'Type a message...'}
              disabled={isDisabled || isEjected}
              rows={1}
            />
          </div>

          <button
            className="tape-deck__send-btn"
            onClick={handleSubmit}
            disabled={isDisabled || isEjected || !inputValue.trim()}
            title="Send message"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
