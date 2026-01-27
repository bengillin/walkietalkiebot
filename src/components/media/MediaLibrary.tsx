import { useState, useMemo } from 'react'
import type { Conversation, MessageImage } from '../../types'
import './MediaLibrary.css'

interface MediaItem {
  image: MessageImage
  conversationId: string
  conversationTitle: string
  messageTimestamp: number
}

interface MediaLibraryProps {
  conversations: Conversation[]
  onClose: () => void
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function MediaLibrary({ conversations, onClose }: MediaLibraryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

  // Extract all images from all conversations
  const mediaItems = useMemo(() => {
    const items: MediaItem[] = []

    for (const conv of conversations) {
      for (const message of conv.messages) {
        if (message.images && message.images.length > 0) {
          for (const image of message.images) {
            items.push({
              image,
              conversationId: conv.id,
              conversationTitle: conv.title,
              messageTimestamp: message.timestamp,
            })
          }
        }
      }
    }

    // Sort by timestamp
    items.sort((a, b) =>
      sortOrder === 'newest'
        ? b.messageTimestamp - a.messageTimestamp
        : a.messageTimestamp - b.messageTimestamp
    )

    return items
  }, [conversations, sortOrder])

  const selectedItem = selectedIndex !== null ? mediaItems[selectedIndex] : null
  const hasPrev = selectedIndex !== null && selectedIndex > 0
  const hasNext = selectedIndex !== null && selectedIndex < mediaItems.length - 1

  const goToPrev = () => {
    if (hasPrev) setSelectedIndex(selectedIndex - 1)
  }

  const goToNext = () => {
    if (hasNext) setSelectedIndex(selectedIndex + 1)
  }

  return (
    <div className="media-library">
      <div className="media-library__backdrop" onClick={onClose} />

      <div className={`media-library__drawer ${selectedIndex !== null ? 'media-library__drawer--expanded' : ''}`}>
        <div className="media-library__header">
          {selectedItem ? (
            <>
              <button
                className="media-library__back"
                onClick={() => setSelectedIndex(null)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
                Back
              </button>
              <h3 className="media-library__title">Details</h3>
            </>
          ) : (
            <>
              <h3 className="media-library__title">Media Library</h3>
              <select
                className="media-library__sort"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </>
          )}
        </div>

        {selectedItem ? (
          <div className="media-library__detail">
            <div className="media-library__detail-image-container">
              <button
                className="media-library__nav media-library__nav--prev"
                onClick={goToPrev}
                disabled={!hasPrev}
                aria-label="Previous image"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                </svg>
              </button>
              <img
                src={selectedItem.image.dataUrl}
                alt={selectedItem.image.fileName}
                className="media-library__detail-image"
              />
              <button
                className="media-library__nav media-library__nav--next"
                onClick={goToNext}
                disabled={!hasNext}
                aria-label="Next image"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
                </svg>
              </button>
            </div>
            <div className="media-library__detail-info">
              <span className="media-library__detail-filename">{selectedItem.image.fileName}</span>
              <span className="media-library__detail-meta">
                From: {selectedItem.conversationTitle}
              </span>
              <span className="media-library__detail-meta">
                {formatDate(selectedItem.messageTimestamp)}
              </span>
              <h3 className="media-library__detail-heading">Analysis</h3>
              {selectedItem.image.description ? (
                <p className="media-library__detail-description">{selectedItem.image.description}</p>
              ) : (
                <p className="media-library__detail-no-analysis">No analysis available</p>
              )}
            </div>
          </div>
        ) : mediaItems.length === 0 ? (
          <div className="media-library__empty">
            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
            <p>No images yet</p>
            <span>Images shared in conversations will appear here</span>
          </div>
        ) : (
          mediaItems.map((item, index) => (
            <div
              key={`${item.image.id}-${index}`}
              className="media-library__item"
              onClick={() => setSelectedIndex(index)}
            >
              <img
                src={item.image.dataUrl}
                alt={item.image.fileName}
                className="media-library__thumbnail"
              />
              <div className="media-library__item-overlay">
                <span className="media-library__item-name">{item.image.fileName}</span>
                <span className="media-library__item-date">{formatDate(item.messageTimestamp)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
