import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react'
import { CassetteTape, type TapeState } from './CassetteTape'
import { TapeCollection } from './TapeCollection'
import type { Conversation } from '../../types'
import './TapeDeck.css'

interface TapeDeckProps {
  currentConversation: Conversation | null
  conversations: Conversation[]
  tapeState: TapeState
  transcript: string
  isListening: boolean
  isEjected: boolean
  onSubmit: (text: string) => void
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onDeleteConversation: (id: string) => void
  onCloseCollection: () => void
  isDisabled?: boolean
  triggerWord?: string
}

export function TapeDeck({
  currentConversation,
  conversations,
  tapeState,
  transcript,
  isListening,
  isEjected,
  onSubmit,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onCloseCollection,
  isDisabled = false,
  triggerWord = 'over',
}: TapeDeckProps) {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const justSubmittedRef = useRef(false)

  // Sync transcript to input when listening, but not right after submit
  useEffect(() => {
    if (justSubmittedRef.current) {
      return
    }
    if (isListening) {
      setInputValue(transcript)
    }
  }, [isListening, transcript])

  const handleSubmit = () => {
    const text = inputValue.trim()
    if (text && !isDisabled) {
      justSubmittedRef.current = true
      onSubmit(text)
      setInputValue('')
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
    setInputValue(e.target.value)
    adjustTextareaHeight()
  }

  // Adjust height when input value changes (e.g., from transcript)
  useEffect(() => {
    adjustTextareaHeight()
  }, [inputValue])

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
        {/* Loaded cassette display - 25% width */}
        <div className="tape-deck__cassette-slot">
          {currentConversation && !isEjected && (
            <CassetteTape
              title={currentConversation.title}
              state={tapeState}
              messageCount={currentConversation.messages.length}
              size="mini"
              color="black"
            />
          )}
          {isEjected && (
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
