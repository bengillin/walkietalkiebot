import { useState, useRef, useEffect, useCallback } from 'react'
import * as api from '../../lib/api'
import type { SearchResult } from '../../lib/api'
import './SearchOverlay.css'

interface SearchOverlayProps {
  isOpen: boolean
  onClose: () => void
  onSelectResult: (conversationId: string) => void
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function SearchOverlay({ isOpen, onClose, onSelectResult }: SearchOverlayProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<number>(0)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Debounced search
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setSelectedIndex(0)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!value.trim()) {
      setResults([])
      return
    }

    setIsLoading(true)
    debounceRef.current = window.setTimeout(async () => {
      try {
        const { results: searchResults } = await api.searchMessages(value, 20)
        setResults(searchResults)
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 200)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      onSelectResult(results[selectedIndex].conversationId)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-overlay__panel" onClick={e => e.stopPropagation()}>
        <div className="search-overlay__input-row">
          <svg className="search-overlay__icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            ref={inputRef}
            className="search-overlay__input"
            type="text"
            placeholder="Search all conversations..."
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isLoading && <span className="search-overlay__spinner" />}
        </div>

        {results.length > 0 && (
          <div className="search-overlay__results">
            {results.map((result, index) => (
              <button
                key={`${result.messageId}-${index}`}
                className={`search-overlay__result ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  onSelectResult(result.conversationId)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="search-overlay__result-header">
                  <span className="search-overlay__result-tape">{result.conversationTitle}</span>
                  <span className="search-overlay__result-time">{formatTime(result.timestamp)}</span>
                </div>
                <div
                  className="search-overlay__result-snippet"
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
                <span className="search-overlay__result-role">{result.role}</span>
              </button>
            ))}
          </div>
        )}

        {query.trim() && !isLoading && results.length === 0 && (
          <div className="search-overlay__empty">No results found</div>
        )}
      </div>
    </div>
  )
}
