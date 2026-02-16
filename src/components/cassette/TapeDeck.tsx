import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react'
import { TapeCollection } from './TapeCollection'
import type { Conversation } from '../../types'
import './TapeDeck.css'

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
  onOpenSettings?: () => void
  onFilesAdd?: (files: import('../../types').DroppedFile[]) => void
  isDisabled?: boolean
  triggerWord?: string
  isRecording?: boolean
  continuousListening?: boolean
  onTalkStart?: () => void
  onTalkEnd?: () => void
  contextIds?: string[]
  onToggleContext?: (id: string) => void
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
  onOpenSettings,
  onFilesAdd,
  isDisabled = false,
  triggerWord = 'over',
  isRecording = false,
  continuousListening = false,
  onTalkStart,
  onTalkEnd,
  contextIds = [],
  onToggleContext,
}: TapeDeckProps) {
  const [manualInput, setManualInput] = useState('')  // What user typed manually
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const deckRef = useRef<HTMLDivElement>(null)
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

  // Track deck height so drawers can position relative to it
  useEffect(() => {
    const el = deckRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        document.documentElement.style.setProperty(
          '--tape-deck-height',
          `${entry.borderBoxSize[0].blockSize}px`
        )
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleSelectTape = (id: string) => {
    onSelectConversation(id)
  }

  const handleNewTape = () => {
    onNewConversation()
  }

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !onFilesAdd) return

    const droppedFiles: import('../../types').DroppedFile[] = []
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        droppedFiles.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: reader.result as string,
        })
        if (droppedFiles.length === files.length) {
          onFilesAdd(droppedFiles)
        }
      }
      reader.readAsDataURL(file)
    })

    // Reset input so same file can be selected again
    e.target.value = ''
  }

  return (
    <div ref={deckRef} className={`tape-deck ${isListening ? 'tape-deck--recording' : ''} ${isEjected ? 'tape-deck--ejected' : ''}`}>
      {/* Tape collection drawer */}
      <TapeCollection
        conversations={conversations}
        currentId={currentConversation?.id || ''}
        isOpen={isEjected}
        onSelect={handleSelectTape}
        onNew={handleNewTape}
        onDelete={onDeleteConversation}
        onClose={onCloseCollection}
        contextIds={contextIds}
        onToggleContext={onToggleContext}
      />

      {/* Main deck area - Option B integrated single row */}
      <div className="tape-deck__main">
        {/* Left side: drawer triggers */}
        <div className="tape-deck__left-actions">
          {/* Eject / Tape collection button */}
          <button
            className={`tape-deck__action-btn tape-deck__action-btn--eject ${isEjected ? 'tape-deck__action-btn--active' : ''}`}
            onClick={() => isEjected ? onCloseCollection() : onOpenCollection()}
            title={isEjected ? 'Close tape collection' : 'Eject tape'}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M5 17h14v2H5zm7-12L5.33 15h13.34z" />
            </svg>
          </button>

          {/* Settings button */}
          {onOpenSettings && (
            <button
              className="tape-deck__action-btn tape-deck__action-btn--settings"
              onClick={onOpenSettings}
              title="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
          )}
        </div>

        {/* Center: text input */}
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

        {/* Right side: input actions */}
        <div className="tape-deck__right-actions">
          {/* File attachment button */}
          {onFilesAdd && (
            <button
              className="tape-deck__action-btn tape-deck__action-btn--attach"
              onClick={handleFileClick}
              disabled={isDisabled || isEjected}
              title="Attach image"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </button>
          )}

          {/* Mic button (shown when not in continuous listening mode) */}
          {onTalkStart && !continuousListening && (
            <button
              className={`tape-deck__action-btn tape-deck__action-btn--mic ${isRecording ? 'tape-deck__action-btn--recording' : ''}`}
              onMouseDown={onTalkStart}
              onMouseUp={onTalkEnd}
              onMouseLeave={isRecording ? onTalkEnd : undefined}
              disabled={isDisabled || isEjected}
              title="Hold to record"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
              </svg>
            </button>
          )}

          {/* Send button */}
          <button
            className="tape-deck__action-btn tape-deck__action-btn--send"
            onClick={handleSubmit}
            disabled={isDisabled || isEjected || !inputValue.trim()}
            title="Send message"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
