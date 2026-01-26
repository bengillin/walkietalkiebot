import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
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
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync transcript to input when listening
  useEffect(() => {
    if (isListening && transcript) {
      setInputValue(transcript)
    }
  }, [isListening, transcript])

  const handleSubmit = () => {
    const text = inputValue.trim()
    if (text && !isDisabled) {
      onSubmit(text)
      setInputValue('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

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

      {/* Main deck area */}
      <div className="tape-deck__main">
        {/* Loaded cassette display */}
        <div className="tape-deck__cassette-slot">
          {currentConversation && !isEjected && (
            <CassetteTape
              title={currentConversation.title}
              subtitle={`${currentConversation.messages.length} messages`}
              state={tapeState}
              messageCount={currentConversation.messages.length}
              size="medium"
              color="black"
            />
          )}
          {isEjected && (
            <div className="tape-deck__empty-slot">
              <span>No tape loaded</span>
            </div>
          )}
        </div>

        {/* Controls row - just input and send */}
        <div className="tape-deck__controls">
          <div className="tape-deck__input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="tape-deck__input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? `Listening... say "${triggerWord}" to send` : 'Type a message...'}
              disabled={isDisabled || isEjected}
            />
          </div>

          {/* Send button */}
          <button
            className="tape-deck__send-btn"
            onClick={handleSubmit}
            disabled={isDisabled || isEjected || !inputValue.trim()}
            title="Send message"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
