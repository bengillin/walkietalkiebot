import { useCallback, useState, useRef, useEffect } from 'react'
import './FileDropZone.css'

export interface DroppedFile {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string
}

export interface ImageAnalysisStatus {
  fileId: string
  status: 'analyzing' | 'complete' | 'error'
  description?: string
}

interface FileDropZoneProps {
  files: DroppedFile[]
  onFilesAdd: (files: DroppedFile[]) => void
  onFileRemove: (id: string) => void
  onClear: () => void
  isDisabled?: boolean
  analysisStatuses?: ImageAnalysisStatus[]
}

export function FileDropZone({
  files,
  onFilesAdd,
  onFileRemove,
  onClear,
  isDisabled = false,
  analysisStatuses = [],
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(async (fileList: FileList) => {
    const newFiles: DroppedFile[] = []

    for (const file of Array.from(fileList)) {
      // Only accept images for now
      if (!file.type.startsWith('image/')) continue

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      newFiles.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
      })
    }

    if (newFiles.length > 0) {
      onFilesAdd(newFiles)
    }
  }, [onFilesAdd])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    if (isDisabled) return

    const { files } = e.dataTransfer
    if (files && files.length > 0) {
      processFiles(files)
    }
  }, [isDisabled, processFiles])

  const handleClick = useCallback(() => {
    if (!isDisabled && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }, [isDisabled])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target
    if (files && files.length > 0) {
      processFiles(files)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }, [processFiles])

  // Global drag listeners for full-page drop
  useEffect(() => {
    const handleGlobalDragEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current++
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true)
      }
    }

    const handleGlobalDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current--
      if (dragCounter.current === 0) {
        setIsDragging(false)
      }
    }

    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault()
    }

    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      dragCounter.current = 0
    }

    document.addEventListener('dragenter', handleGlobalDragEnter)
    document.addEventListener('dragleave', handleGlobalDragLeave)
    document.addEventListener('dragover', handleGlobalDragOver)
    document.addEventListener('drop', handleGlobalDrop)

    return () => {
      document.removeEventListener('dragenter', handleGlobalDragEnter)
      document.removeEventListener('dragleave', handleGlobalDragLeave)
      document.removeEventListener('dragover', handleGlobalDragOver)
      document.removeEventListener('drop', handleGlobalDrop)
    }
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <>
      {/* Full-page drop overlay */}
      {isDragging && (
        <div
          className="dropzone-overlay"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="dropzone-overlay__content">
            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
            </svg>
            <span>Drop images here</span>
          </div>
        </div>
      )}

      {/* File preview bar - only show when files are attached */}
      {files.length > 0 && (
        <div className="dropzone-files">
          <div className="dropzone-files__list">
            {files.map((file) => {
              const analysis = analysisStatuses.find(a => a.fileId === file.id)
              return (
                <div
                  key={file.id}
                  className={`dropzone-file ${analysis?.status === 'analyzing' ? 'dropzone-file--analyzing' : ''}`}
                  title={analysis?.status === 'complete' && analysis.description ? analysis.description : undefined}
                >
                  <img
                    src={file.dataUrl}
                    alt={file.name}
                    className="dropzone-file__preview"
                  />
                  <div className="dropzone-file__info">
                    <span className="dropzone-file__name">{file.name}</span>
                    <span className="dropzone-file__size">
                      {analysis?.status === 'analyzing' ? 'Analyzing...' :
                       analysis?.status === 'complete' ? 'Analyzed' :
                       analysis?.status === 'error' ? 'Failed' :
                       formatFileSize(file.size)}
                    </span>
                    {analysis?.status === 'complete' && analysis.description && (
                      <span className="dropzone-file__analysis">{analysis.description}</span>
                    )}
                  </div>
                  <button
                    className="dropzone-file__remove"
                    onClick={() => onFileRemove(file.id)}
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="dropzone-files__actions">
            <button
              className="dropzone-files__add"
              onClick={handleClick}
              disabled={isDisabled}
            >
              + Add
            </button>
            <button
              className="dropzone-files__clear"
              onClick={onClear}
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
    </>
  )
}
