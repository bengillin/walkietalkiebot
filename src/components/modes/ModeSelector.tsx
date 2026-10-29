import { useState, useRef, useEffect } from 'react'
import type { ModeInfo } from '../../lib/api'
import './ModeSelector.css'

interface ModeSelectorProps {
  modes: ModeInfo[]
  currentMode: string
  onSelectMode: (mode: string) => void
}

export function ModeSelector({ modes, currentMode, onSelectMode }: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const current = modes.find((m) => m.name === currentMode) || modes[0]

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    // Escape closes the dropdown (and only the dropdown: stop it reaching the
    // app-wide handler, which would close the next layer down too)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!current) return null

  return (
    <div className="mode-selector" ref={dropdownRef}>
      <button
        className="mode-selector__trigger"
        onClick={() => setIsOpen(!isOpen)}
        title={`Mode: ${current.label} — ${current.description}`}
        aria-label={`Mode: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className="mode-selector__icon" aria-hidden="true">
          {current.icon}
        </span>
        <span className="mode-selector__text">
          <span className="mode-selector__eyebrow" aria-hidden="true">
            Mode
          </span>
          <span className="mode-selector__label">{current.label}</span>
        </span>
        <svg
          className={`mode-selector__chevron ${isOpen ? 'mode-selector__chevron--open' : ''}`}
          viewBox="0 0 24 24"
          fill="currentColor"
          width="14"
          height="14"
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {isOpen && (
        <div className="mode-selector__dropdown" role="menu" aria-label="Mode">
          {modes.map((mode) => (
            <button
              key={mode.name}
              role="menuitemradio"
              aria-checked={mode.name === currentMode}
              className={`mode-selector__option ${mode.name === currentMode ? 'mode-selector__option--active' : ''}`}
              onClick={() => {
                onSelectMode(mode.name)
                setIsOpen(false)
              }}
            >
              <span className="mode-selector__option-icon">{mode.icon}</span>
              <div className="mode-selector__option-text">
                <span className="mode-selector__option-label">{mode.label}</span>
                <span className="mode-selector__option-desc">{mode.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
