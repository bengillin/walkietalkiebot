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
  onClear?: () => void
  isDisabled?: boolean
  analysisStatuses?: ImageAnalysisStatus[]
}

export function FileDropZone({
  files,
  onFilesAdd,
  onFileRemove,
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
            <svg viewBox="0 0 24 24" fill="currentColor" width="56" height="56">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
            <span>Drop it</span>
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
                >
                  <div className="dropzone-file__thumb-wrap">
                    <img
                      src={file.dataUrl}
                      alt={file.name}
                      className="dropzone-file__preview"
                    />
                    <button
                      className="dropzone-file__remove"
                      onClick={() => onFileRemove(file.id)}
                      title="Remove"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                    {analysis?.status === 'analyzing' && (
                      <div className="dropzone-file__analyzing-badge">Analyzing...</div>
                    )}
                  </div>
                </div>
              )
            })}
            <button
              className="dropzone-files__add"
              onClick={handleClick}
              disabled={isDisabled}
              title="Add more"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
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
