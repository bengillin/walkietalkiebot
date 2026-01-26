import { TapeCase } from './TapeCase'
import type { Conversation } from '../../types'
import './TapeCollection.css'

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
  if (!isOpen) return null

  return (
    <div className="tape-collection">
      <div className="tape-collection__backdrop" onClick={onClose} />

      <div className="tape-collection__drawer">
        <div className="tape-collection__header">
          <h3 className="tape-collection__title">Tape Collection</h3>
          <button className="tape-collection__new-btn" onClick={onNew}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            New Tape
          </button>
        </div>

        <div className="tape-collection__grid">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`tape-collection__item ${conv.id === currentId ? 'tape-collection__item--current' : ''}`}
            >
              <TapeCase
                title={conv.title}
                subtitle={`${conv.messages.length} msgs`}
                messageCount={conv.messages.length}
                onClick={() => onSelect(conv.id)}
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
              {conv.id === currentId && (
                <div className="tape-collection__current-badge">Loaded</div>
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
      </div>
    </div>
  )
}

export { TapeCase } from './TapeCase'
export { CassetteTape } from './CassetteTape'
