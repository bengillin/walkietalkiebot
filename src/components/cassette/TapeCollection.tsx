import { useState } from 'react'
import { RetroTape, getTapeColor } from './RetroTape'
import type { Conversation } from '../../types'
import './TapeCollection.css'

// Summarize title to 5 words or less
function summarizeTitle(title: string): string {
  const words = title.split(/\s+/).filter(Boolean)
  if (words.length <= 5) return title
  return words.slice(0, 5).join(' ')
}

interface TapeCollectionProps {
  conversations: Conversation[]
  currentId: string
  isOpen: boolean
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function TapeCollection({
  conversations,
  currentId,
  isOpen,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: TapeCollectionProps) {
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null)
  const [isEjecting, setIsEjecting] = useState(false)

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

  return (
    <div className="tape-collection">
      <div className="tape-collection__backdrop" onClick={onClose} />

      <div className="tape-collection__drawer">
        <div className="tape-collection__header">
          <h3 className="tape-collection__title">Recorded Conversations</h3>
          <button className="tape-collection__new-btn" onClick={onNew}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            New Recording
          </button>
        </div>

        <div className="tape-collection__grid">
          {conversations.map((conv, index) => (
            <div
              key={conv.id}
              className={`tape-collection__item ${conv.id === currentId ? 'tape-collection__item--current' : ''}`}
            >
              <RetroTape
                title={summarizeTitle(conv.title)}
                color={getTapeColor(index)}
                tapeUsage={Math.min(conv.messages.length / 50, 1)}
                isSelected={conv.id === currentId}
                isEjecting={isEjecting && conv.id === currentId}
                onClick={() => handleTapeClick(conv.id)}
              />
              {conv.id !== currentId && (
                <button
                  className="tape-collection__delete-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(conv.id)
                  }}
                  title="Delete tape"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {conversations.length === 0 && (
          <div className="tape-collection__empty">
            <p>No tapes yet</p>
            <button className="tape-collection__empty-btn" onClick={onNew}>
              Create your first tape
            </button>
          </div>
        )}

        {/* Confirmation dialog */}
        {pendingSwitch && (
          <div className="tape-collection__confirm">
            <div className="tape-collection__confirm-content">
              <p>Switch tapes?</p>
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
