import { useState, useEffect, useCallback } from 'react'
import './ImageLightbox.css'

export interface LightboxImage {
  dataUrl: string
  description?: string
  fileName: string
}

interface ImageLightboxProps {
  image: LightboxImage
  images?: LightboxImage[]  // Full gallery for navigation
  onClose: () => void
}

export function ImageLightbox({ image, images, onClose }: ImageLightboxProps) {
  // Find current index in gallery
  const gallery = images && images.length > 1 ? images : null
  const [currentIndex, setCurrentIndex] = useState(() =>
    gallery ? gallery.findIndex(img => img.dataUrl === image.dataUrl) : 0
  )

  const currentImage = gallery ? gallery[Math.max(0, currentIndex)] : image
  const hasPrev = gallery !== null && currentIndex > 0
  const hasNext = gallery !== null && currentIndex < gallery.length - 1

  const goToPrev = useCallback(() => {
    if (hasPrev) setCurrentIndex(i => i - 1)
  }, [hasPrev])

  const goToNext = useCallback(() => {
    if (hasNext) setCurrentIndex(i => i + 1)
  }, [hasNext])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goToPrev()
      if (e.key === 'ArrowRight') goToNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, goToPrev, goToNext])

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>

        <div className="lightbox-image-container">
          {hasPrev && (
            <button className="lightbox-nav lightbox-nav--prev" onClick={goToPrev} aria-label="Previous image">
              <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
              </svg>
            </button>
          )}
          <img src={currentImage.dataUrl} alt={currentImage.fileName} className="lightbox-image" />
          {hasNext && (
            <button className="lightbox-nav lightbox-nav--next" onClick={goToNext} aria-label="Next image">
              <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
              </svg>
            </button>
          )}
        </div>

        <div className="lightbox-info-bar">
          <span className="lightbox-filename">{currentImage.fileName}</span>
          {gallery && (
            <span className="lightbox-counter">{currentIndex + 1} / {gallery.length}</span>
          )}
        </div>

        {currentImage.description && (
          <div className="lightbox-sidebar">
            <h3>Analysis</h3>
            <p>{currentImage.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}
