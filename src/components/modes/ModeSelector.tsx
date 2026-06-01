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
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  if (!current) return null

  return (
    <div className="mode-selector" ref={dropdownRef}>
      <button
        className="mode-selector__trigger"
        onClick={() => setIsOpen(!isOpen)}
        title={`Mode: ${current.label} — ${current.description}`}
      >
        <span className="mode-selector__icon">{current.icon}</span>
        <span className="mode-selector__label">{current.label}</span>
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
        <div className="mode-selector__dropdown">
          {modes.map((mode) => (
            <button
              key={mode.name}
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
