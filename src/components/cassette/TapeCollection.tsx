import { useState, useEffect, useRef, useCallback } from 'react'
import { ConversationItem } from './ConversationItem'
import { useTheme, type ThemeName } from '../../contexts/ThemeContext'
import type { Conversation } from '../../types'
import * as api from '../../lib/api'
import { parseImportJson } from '../../lib/export'
import './TapeCollection.css'

// Summarize title to 5 words or less
function summarizeTitle(title: string): string {
  const words = title.split(/\s+/).filter(Boolean)
  if (words.length <= 5) return title
  return words.slice(0, 5).join(' ')
}

const THEME_LABELS: Record<
  ThemeName,
  {
    title: string
    newBtn: string
    search: string
    switchPrompt: string
    empty: string
    emptyBtn: string
  }
> = {
  mccallister: {
    title: 'Recorded Conversations',
    newBtn: 'New Recording',
    search: 'Search tapes...',
    switchPrompt: 'Switch tapes?',
    empty: 'No tapes yet',
    emptyBtn: 'Create your first tape',
  },
  imessage: {
    title: 'Saved Tapes',
    newBtn: 'New Tape',
    search: 'Search tapes...',
    switchPrompt: 'Switch tapes?',
    empty: 'No tapes yet',
    emptyBtn: 'Record your first tape',
  },
  aol: {
    title: 'Tape Archive',
    newBtn: 'New Tape',
    search: 'Search tapes...',
    switchPrompt: 'Switch tapes?',
    empty: 'No tapes yet',
    emptyBtn: 'Record your first tape',
  },
  'classic-mac': {
    title: 'Tape Library',
    newBtn: 'New Tape',
    search: 'Search tapes...',
    switchPrompt: 'Switch tapes?',
    empty: 'No tapes yet',
    emptyBtn: 'Record your first tape',
  },
  geocities: {
    title: 'Tape Stash',
    newBtn: 'New Tape',
    search: 'Search tapes...',
    switchPrompt: 'Switch tapes?',
    empty: 'No tapes yet',
    emptyBtn: 'Record your first tape',
  },
  'apple-1984': {
    title: 'Tape Collection',
    newBtn: 'New Tape',
    search: 'Search tapes...',
    switchPrompt: 'Switch tapes?',
    empty: 'No tapes yet',
    emptyBtn: 'Record your first tape',
  },
}

interface TapeCollectionProps {
  conversations: Conversation[]
  currentId: string
  isOpen: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onClose: () => void
  onBranch?: (id: string) => void
  contextIds?: string[]
  onToggleContext?: (id: string) => void
}

export function TapeCollection({
  conversations,
  currentId,
  isOpen,
  onSelect,
  onNew,
  onDelete,
  onClose,
  onBranch,
  contextIds = [],
  onToggleContext,
}: TapeCollectionProps) {
  const { theme } = useTheme()
  const labels = THEME_LABELS[theme]
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null)
  const [isEjecting, setIsEjecting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Set<string> | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [planCounts, setPlanCounts] = useState<Record<string, number>>({})
  const searchInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const content = await file.text()
        const imported = parseImportJson(content)
        const result = await api.importConversation(imported)
        onSelect(result.id) // Switch to imported conversation
        onClose()
      } catch (err) {
        console.warn('Import failed:', err)
      }
      if (importInputRef.current) importInputRef.current.value = ''
    },
    [onSelect, onClose],
  )

  // Focus search input and load plan counts when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
      api
        .getPlanCounts()
        .then(setPlanCounts)
        .catch(() => {})
    } else {
      setSearchQuery('')
      setSearchResults(null)
    }
  }, [isOpen])

  // Debounced search
  const doSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults(null)
        setIsSearching(false)
        return
      }

      setIsSearching(true)
      try {
        const { results } = await api.searchMessages(query)
        const matchingIds = new Set(results.map((r) => r.conversationId))
        setSearchResults(matchingIds)
      } catch {
        // Fall back to local title search
        const lowerQuery = query.toLowerCase()
        const matchingIds = new Set(
          conversations.filter((c) => c.title.toLowerCase().includes(lowerQuery)).map((c) => c.id),
        )
        setSearchResults(matchingIds)
      }
      setIsSearching(false)
    },
    [conversations],
  )

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  if (!isOpen) return null

  const handleTapeClick = (id: string) => {
    if (id === currentId) return // Already selected
    setPendingSwitch(id)
  }

  const confirmSwitch = () => {
    if (!pendingSwitch) return
    setIsEjecting(true)
    // Brief eject animation, then switch
    setTimeout(() => {
      onSelect(pendingSwitch)
      setIsEjecting(false)
      setPendingSwitch(null)
      onClose()
    }, 400)
  }

  const cancelSwitch = () => {
    setPendingSwitch(null)
  }

  // Filter conversations by search results
  const displayConversations = searchResults
    ? conversations.filter((c) => searchResults.has(c.id))
    : conversations

  return (
    <div className="tape-collection">
      <div className="tape-collection__backdrop" onClick={onClose} />

      <div className="tape-collection__drawer">
        <div className="tape-collection__header">
          <h3 className="tape-collection__title">{labels.title}</h3>
          <div className="tape-collection__header-actions">
            <button
              className="tape-collection__import-btn"
              onClick={() => importInputRef.current?.click()}
              title="Import tape"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
              </svg>
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
            <button className="tape-collection__new-btn" onClick={onNew}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              {labels.newBtn}
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="tape-collection__search">
          <svg
            className="tape-collection__search-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            width="16"
            height="16"
          >
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className="tape-collection__search-input"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={labels.search}
          />
          {searchQuery && (
            <button
              className="tape-collection__search-clear"
              onClick={() => {
                setSearchQuery('')
                setSearchResults(null)
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}
          {isSearching && <span className="tape-collection__search-spinner" />}
        </div>

        <div className="tape-collection__grid">
          {displayConversations.map((conv, index) => {
            // Use original index for color consistency
            const originalIndex = conversations.indexOf(conv)
            return (
              <div
                key={conv.id}
                className={`tape-collection__item ${conv.id === currentId ? 'tape-collection__item--current' : ''} ${searchResults && searchResults.has(conv.id) ? 'tape-collection__item--match' : ''} ${contextIds.includes(conv.id) ? 'tape-collection__item--context' : ''}`}
              >
                <ConversationItem
                  title={summarizeTitle(conv.title)}
                  messageCount={conv.messages.length}
                  colorIndex={originalIndex >= 0 ? originalIndex : index}
                  isSelected={conv.id === currentId}
                  isEjecting={isEjecting && conv.id === currentId}
                  onClick={() => handleTapeClick(conv.id)}
                  planCount={planCounts[conv.id] || 0}
                />
                {/* Context toggle button - not shown on current item */}
                {conv.id !== currentId && onToggleContext && (
                  <button
                    className={`tape-collection__context-btn ${contextIds.includes(conv.id) ? 'tape-collection__context-btn--active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleContext(conv.id)
                    }}
                    title={contextIds.includes(conv.id) ? 'Remove from context' : 'Add as context'}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                    </svg>
                  </button>
                )}
                {onBranch && conv.messages.length > 0 && (
                  <button
                    className="tape-collection__branch-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onBranch(conv.id)
                    }}
                    title="Branch conversation"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                      <path d="M6 3v6c0 2.97 2.16 5.43 5 5.91V18H8v3h8v-3h-3v-3.09c2.84-.48 5-2.94 5-5.91V3h-4v6c0 1.66 1.34 3 3 3-.77 1.78-2.54 3-4.59 3h-.82C9.54 12 7.77 10.78 7 9c1.66 0 3-1.34 3-3V3H6z" />
                    </svg>
                  </button>
                )}
                {conv.id !== currentId && (
                  <button
                    className="tape-collection__delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(conv.id)
                    }}
                    title="Delete"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {displayConversations.length === 0 && !searchQuery && (
          <div className="tape-collection__empty">
            <p>{labels.empty}</p>
            <button className="tape-collection__empty-btn" onClick={onNew}>
              {labels.emptyBtn}
            </button>
          </div>
        )}

        {displayConversations.length === 0 && searchQuery && (
          <div className="tape-collection__empty">
            <p>No results found</p>
          </div>
        )}

        {/* Confirmation dialog */}
        {pendingSwitch && (
          <div className="tape-collection__confirm">
            <div className="tape-collection__confirm-content">
              <p>{labels.switchPrompt}</p>
              <span>Your current conversation will be saved.</span>
              <div className="tape-collection__confirm-buttons">
                <button className="tape-collection__confirm-cancel" onClick={cancelSwitch}>
                  Cancel
                </button>
                <button className="tape-collection__confirm-ok" onClick={confirmSwitch}>
                  Switch
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export { TapeCase } from './TapeCase'
export { CassetteTape } from './CassetteTape'
