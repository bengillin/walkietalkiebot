import { useState, useCallback, useEffect, useRef } from 'react'

interface FabPosition {
  x: number
  y: number
}

export function useDraggableFab() {
  const [fabPosition, setFabPosition] = useState<FabPosition>(() => {
    const saved = localStorage.getItem('wtb_fab_position')
    return saved ? JSON.parse(saved) : { x: 20, y: 100 }
  })
  const [fabSize, setFabSize] = useState(() => {
    const saved = localStorage.getItem('wtb_fab_size')
    return saved ? parseInt(saved, 10) : 64
  })
  const [isDraggingFab, setIsDraggingFab] = useState(false)
  const [isResizingFab, setIsResizingFab] = useState(false)
  const fabRef = useRef<HTMLButtonElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; fabX: number; fabY: number } | null>(null)
  const resizeStartRef = useRef<{ size: number; startY: number } | null>(null)

  // Drag handlers
  const handleFabDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('app__record-fab-resize')) return
    e.preventDefault()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragStartRef.current = { x: clientX, y: clientY, fabX: fabPosition.x, fabY: fabPosition.y }
    setIsDraggingFab(true)
  }, [fabPosition])

  const handleFabDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!dragStartRef.current || !isDraggingFab) return
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const deltaX = dragStartRef.current.x - clientX
    const deltaY = dragStartRef.current.y - clientY
    const newX = Math.max(10, Math.min(window.innerWidth - fabSize - 10, dragStartRef.current.fabX + deltaX))
    const newY = Math.max(10, Math.min(window.innerHeight - fabSize - 10, dragStartRef.current.fabY + deltaY))
    setFabPosition({ x: newX, y: newY })
  }, [isDraggingFab, fabSize])

  const handleFabDragEnd = useCallback(() => {
    if (isDraggingFab) {
      localStorage.setItem('wtb_fab_position', JSON.stringify(fabPosition))
    }
    dragStartRef.current = null
    setIsDraggingFab(false)
  }, [isDraggingFab, fabPosition])

  // Resize handlers
  const handleFabResizeStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    resizeStartRef.current = { size: fabSize, startY: clientY }
    setIsResizingFab(true)
  }, [fabSize])

  const handleFabResizeMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!resizeStartRef.current || !isResizingFab) return
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const deltaY = resizeStartRef.current.startY - clientY
    const newSize = Math.max(48, Math.min(120, resizeStartRef.current.size + deltaY))
    setFabSize(newSize)
  }, [isResizingFab])

  const handleFabResizeEnd = useCallback(() => {
    if (isResizingFab) {
      localStorage.setItem('wtb_fab_size', String(fabSize))
    }
    resizeStartRef.current = null
    setIsResizingFab(false)
  }, [isResizingFab, fabSize])

  // Global listeners for drag
  useEffect(() => {
    if (isDraggingFab) {
      window.addEventListener('mousemove', handleFabDragMove)
      window.addEventListener('mouseup', handleFabDragEnd)
      window.addEventListener('touchmove', handleFabDragMove)
      window.addEventListener('touchend', handleFabDragEnd)
      return () => {
        window.removeEventListener('mousemove', handleFabDragMove)
        window.removeEventListener('mouseup', handleFabDragEnd)
        window.removeEventListener('touchmove', handleFabDragMove)
        window.removeEventListener('touchend', handleFabDragEnd)
      }
    }
  }, [isDraggingFab, handleFabDragMove, handleFabDragEnd])

  // Global listeners for resize
  useEffect(() => {
    if (isResizingFab) {
      window.addEventListener('mousemove', handleFabResizeMove)
      window.addEventListener('mouseup', handleFabResizeEnd)
      window.addEventListener('touchmove', handleFabResizeMove)
      window.addEventListener('touchend', handleFabResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleFabResizeMove)
        window.removeEventListener('mouseup', handleFabResizeEnd)
        window.removeEventListener('touchmove', handleFabResizeMove)
        window.removeEventListener('touchend', handleFabResizeEnd)
      }
    }
  }, [isResizingFab, handleFabResizeMove, handleFabResizeEnd])

  return {
    fabRef,
    fabPosition,
    fabSize,
    isDraggingFab,
    isResizingFab,
    dragStartRef,
    handleFabDragStart,
    handleFabResizeStart,
  }
}
