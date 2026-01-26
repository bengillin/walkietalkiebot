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

interface LightboxState {
  isOpen: boolean
  item: MediaItem | null
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function MediaLibrary({ conversations, onClose }: MediaLibraryProps) {
  const [lightbox, setLightbox] = useState<LightboxState>({ isOpen: false, item: null })
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

  return (
    <div className="media-library">
      <div className="media-library__header">
        <h2 className="media-library__title">Media Library</h2>
        <div className="media-library__controls">
          <select
            className="media-library__sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button className="media-library__close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>

      {mediaItems.length === 0 ? (
        <div className="media-library__empty">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          <p>No images yet</p>
          <span>Images shared in conversations will appear here</span>
        </div>
      ) : (
        <>
          <div className="media-library__count">
            {mediaItems.length} image{mediaItems.length !== 1 ? 's' : ''}
          </div>
          <div className="media-library__grid">
            {mediaItems.map((item, index) => (
              <div
                key={`${item.image.id}-${index}`}
                className="media-library__item"
                onClick={() => setLightbox({ isOpen: true, item })}
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
            ))}
          </div>
        </>
      )}

      {lightbox.isOpen && lightbox.item && (
        <div
          className="media-library__lightbox"
          onClick={() => setLightbox({ isOpen: false, item: null })}
        >
          <div
            className="media-library__lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="media-library__lightbox-close"
              onClick={() => setLightbox({ isOpen: false, item: null })}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
            <div className="media-library__lightbox-main">
              <img
                src={lightbox.item.image.dataUrl}
                alt={lightbox.item.image.fileName}
                className="media-library__lightbox-image"
              />
            </div>
            <div className="media-library__lightbox-sidebar">
              <span className="media-library__lightbox-filename">{lightbox.item.image.fileName}</span>
              <span className="media-library__lightbox-meta">
                From: {lightbox.item.conversationTitle}
              </span>
              <span className="media-library__lightbox-meta">
                {formatDate(lightbox.item.messageTimestamp)}
              </span>
              <h3 className="media-library__lightbox-heading">Analysis</h3>
              {lightbox.item.image.description ? (
                <p className="media-library__lightbox-description">{lightbox.item.image.description}</p>
              ) : (
                <p className="media-library__lightbox-no-analysis">No analysis available</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
