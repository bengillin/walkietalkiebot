import './ImageLightbox.css'

interface ImageLightboxProps {
  image: {
    dataUrl: string
    description?: string
    fileName: string
  }
  onClose: () => void
}

export function ImageLightbox({ image, onClose }: ImageLightboxProps) {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>

        <div className="lightbox-image-container">
          <img src={image.dataUrl} alt={image.fileName} className="lightbox-image" />
        </div>

        {image.description && (
          <div className="lightbox-sidebar">
            <h3>Analysis</h3>
            <p>{image.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}
