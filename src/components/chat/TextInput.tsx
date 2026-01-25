import { useState, useCallback, KeyboardEvent } from 'react'
import './TextInput.css'

interface TextInputProps {
  onSubmit: (text: string) => void
  isDisabled: boolean
  placeholder?: string
}

export function TextInput({ onSubmit, isDisabled, placeholder = 'Type a message...' }: TextInputProps) {
  const [text, setText] = useState('')

  const handleSubmit = useCallback(() => {
    if (text.trim() && !isDisabled) {
      onSubmit(text.trim())
      setText('')
    }
  }, [text, isDisabled, onSubmit])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="text-input">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        className="text-input__field"
      />
      <button
        onClick={handleSubmit}
        disabled={isDisabled || !text.trim()}
        className="text-input__submit"
        aria-label="Send message"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  )
}
