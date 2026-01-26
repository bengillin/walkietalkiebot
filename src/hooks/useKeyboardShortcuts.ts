import { useEffect, useCallback } from 'react'

interface KeyboardShortcutsOptions {
  onEscape?: () => void
  onCmdK?: () => void
  onCmdE?: () => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  isRecording?: boolean
  isSearchOpen?: boolean
}

export function useKeyboardShortcuts({
  onEscape,
  onCmdK,
  onCmdE,
  onArrowUp,
  onArrowDown,
  isRecording = false,
  isSearchOpen = false,
}: KeyboardShortcutsOptions) {
  const isInputFocused = useCallback(() => {
    const active = document.activeElement
    const tagName = active?.tagName
    // Allow Cmd+K and Cmd+E even when in inputs
    return tagName === 'INPUT' || tagName === 'TEXTAREA'
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Escape - cancel recording (works globally)
      if (e.key === 'Escape') {
        if (isRecording && onEscape) {
          e.preventDefault()
          onEscape()
        }
        return
      }

      // Cmd/Ctrl+K - focus search (works even in inputs)
      if (isMod && e.key === 'k') {
        e.preventDefault()
        onCmdK?.()
        return
      }

      // Cmd/Ctrl+E - export (works even in inputs)
      if (isMod && e.key === 'e') {
        e.preventDefault()
        onCmdE?.()
        return
      }

      // Arrow keys for search navigation (only when search is open and not in input)
      if (isSearchOpen && !isInputFocused()) {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          onArrowUp?.()
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onArrowDown?.()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onEscape, onCmdK, onCmdE, onArrowUp, onArrowDown, isRecording, isSearchOpen, isInputFocused])
}
