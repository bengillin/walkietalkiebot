import './TalkButton.css'

interface TalkButtonProps {
  isListening: boolean
  isDisabled?: boolean
  onMouseDown: () => void
  onMouseUp: () => void
}

export function TalkButton({
  isListening,
  isDisabled,
  onMouseDown,
  onMouseUp,
}: TalkButtonProps) {
  return (
    <button
      className={`talk-button ${isListening ? 'talk-button--active' : ''}`}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchStart={onMouseDown}
      onTouchEnd={onMouseUp}
      onMouseLeave={isListening ? onMouseUp : undefined}
      disabled={isDisabled}
      aria-label={isListening ? 'Release to send' : 'Hold to talk'}
    >
      <div className="talk-button__icon">
        {isListening ? (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="9" y="6" width="6" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
      </div>
      <span className="talk-button__label">
        {isListening ? 'Listening...' : 'Hold to talk'}
      </span>
    </button>
  )
}
