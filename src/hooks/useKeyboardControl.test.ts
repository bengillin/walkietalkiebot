import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardControl } from './useKeyboardControl'
import type { AvatarState } from '../types'

function setup(overrides: Partial<Parameters<typeof useKeyboardControl>[0]> = {}) {
  const params = {
    isListening: false,
    isSpeaking: false,
    avatarState: 'idle' as AvatarState,
    continuousListeningEnabled: false,
    handleTalkStart: vi.fn(),
    autoTalkStart: vi.fn(),
    handleTalkEnd: vi.fn(),
    stopListening: vi.fn(),
    setTranscript: vi.fn(),
    setAvatarState: vi.fn(),
    playSound: vi.fn(),
    setShowSearch: vi.fn(),
    setShowShortcuts: vi.fn(),
    currentConversationId: null,
    conversations: [],
    finalTranscriptRef: { current: '' },
    closeTopmostLayer: vi.fn(() => true),
    micBlocked: false,
    recognitionFailures: 0,
    ...overrides,
  }
  const view = renderHook((p: typeof params) => useKeyboardControl(p), { initialProps: params })
  return { ...view, params }
}

function pressEscape() {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Escape', () => {
  it('closes the topmost layer when not recording', () => {
    const { params } = setup()
    const event = pressEscape()
    expect(params.closeTopmostLayer).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('cancels recording (and closes nothing) while recording', () => {
    const { params } = setup({ isListening: true })
    pressEscape()
    expect(params.stopListening).toHaveBeenCalled()
    expect(params.setTranscript).toHaveBeenCalledWith('')
    expect(params.setAvatarState).toHaveBeenCalledWith('idle')
    expect(params.closeTopmostLayer).not.toHaveBeenCalled()
  })

  it('leaves the event alone when nothing was open', () => {
    const { params } = setup({ closeTopmostLayer: vi.fn(() => false) })
    const event = pressEscape()
    expect(params.closeTopmostLayer).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does nothing when an inner handler already consumed it', () => {
    const { params } = setup()
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    event.preventDefault()
    act(() => {
      window.dispatchEvent(event)
    })
    expect(params.closeTopmostLayer).not.toHaveBeenCalled()
  })
})

describe('continuous listening restarts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('starts listening when idle', () => {
    const { params } = setup({ continuousListeningEnabled: true })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(params.autoTalkStart).toHaveBeenCalledTimes(1)
  })

  it('never restarts against a blocked mic', () => {
    const { params } = setup({ continuousListeningEnabled: true, micBlocked: true })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(params.autoTalkStart).not.toHaveBeenCalled()
    expect(params.handleTalkStart).not.toHaveBeenCalled()
  })

  it('backs off after failures', () => {
    const { params } = setup({ continuousListeningEnabled: true, recognitionFailures: 2 })
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(params.autoTalkStart).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(params.autoTalkStart).toHaveBeenCalledTimes(1)
  })

  it('gives up after repeated failures', () => {
    const { params } = setup({ continuousListeningEnabled: true, recognitionFailures: 5 })
    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    expect(params.autoTalkStart).not.toHaveBeenCalled()
  })

  it('does not loop when an error bounces the avatar back to idle', () => {
    // error → confused → idle (with the failure counted) → one backed-off retry
    const { params, rerender } = setup({ continuousListeningEnabled: true })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(params.autoTalkStart).toHaveBeenCalledTimes(1)
    rerender({ ...params, avatarState: 'confused', recognitionFailures: 1 })
    rerender({ ...params, avatarState: 'idle', recognitionFailures: 1 })
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(params.autoTalkStart).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(params.autoTalkStart).toHaveBeenCalledTimes(2)
  })
})
