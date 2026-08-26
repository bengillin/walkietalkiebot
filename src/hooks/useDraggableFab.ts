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

  /**
   * Pointer coordinates for a mouse or touch event. Returns null when a touch
   * event carries no active touches — `touches` is empty on touchend, which would
   * otherwise read `undefined.clientX` and throw.
   */
  function pointerPosition(
    e: TouchEvent | MouseEvent | React.TouchEvent | React.MouseEvent,
  ): { x: number; y: number } | null {
    if ('touches' in e) {
      const touch = e.touches[0]
      return touch ? { x: touch.clientX, y: touch.clientY } : null
    }
    return { x: e.clientX, y: e.clientY }
  }

  // Drag handlers
  const handleFabDragStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('app__record-fab-resize')) return
      e.preventDefault()
      const pos = pointerPosition(e)
      if (!pos) return
      dragStartRef.current = { x: pos.x, y: pos.y, fabX: fabPosition.x, fabY: fabPosition.y }
      setIsDraggingFab(true)
    },
    [fabPosition],
  )

  const handleFabDragMove = useCallback(
    (e: TouchEvent | MouseEvent) => {
      if (!dragStartRef.current || !isDraggingFab) return
      const pos = pointerPosition(e)
      if (!pos) return
      const deltaX = dragStartRef.current.x - pos.x
      const deltaY = dragStartRef.current.y - pos.y
      const newX = Math.max(
        10,
        Math.min(window.innerWidth - fabSize - 10, dragStartRef.current.fabX + deltaX),
      )
      const newY = Math.max(
        10,
        Math.min(window.innerHeight - fabSize - 10, dragStartRef.current.fabY + deltaY),
      )
      setFabPosition({ x: newX, y: newY })
    },
    [isDraggingFab, fabSize],
  )

  const handleFabDragEnd = useCallback(() => {
    if (isDraggingFab) {
      localStorage.setItem('wtb_fab_position', JSON.stringify(fabPosition))
    }
    dragStartRef.current = null
    setIsDraggingFab(false)
  }, [isDraggingFab, fabPosition])

  // Resize handlers
  const handleFabResizeStart = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = pointerPosition(e)
      if (!pos) return
      resizeStartRef.current = { size: fabSize, startY: pos.y }
      setIsResizingFab(true)
    },
    [fabSize],
  )

  const handleFabResizeMove = useCallback(
    (e: TouchEvent | MouseEvent) => {
      if (!resizeStartRef.current || !isResizingFab) return
      const pos = pointerPosition(e)
      if (!pos) return
      const deltaY = resizeStartRef.current.startY - pos.y
      const newSize = Math.max(48, Math.min(120, resizeStartRef.current.size + deltaY))
      setFabSize(newSize)
    },
    [isResizingFab],
  )

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
    return undefined
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
    return undefined
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
