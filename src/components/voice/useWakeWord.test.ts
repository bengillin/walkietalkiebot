import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWakeWord } from './useWakeWord'

/** Minimal stand-in for the browser's SpeechRecognition. */
class FakeRecognition {
  static instances: FakeRecognition[] = []
  continuous = false
  interimResults = false
  lang = ''
  onstart: (() => void) | null = null
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    FakeRecognition.instances.push(this)
  }
  /** The browser fires error then end. */
  fail(error: string) {
    act(() => {
      this.onerror?.({ error })
      this.onend?.()
    })
  }
}

function current() {
  const r = FakeRecognition.instances[FakeRecognition.instances.length - 1]
  if (!r) throw new Error('no recognition created')
  return r
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeRecognition.instances = []
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useWakeWord restart behaviour', () => {
  it('restarts quickly after a normal end (silence)', () => {
    renderHook(() => useWakeWord({ enabled: true }))
    const r = current()
    expect(r.start).toHaveBeenCalledTimes(1)
    r.fail('no-speech')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(r.start).toHaveBeenCalledTimes(2)
  })

  it.each(['not-allowed', 'audio-capture', 'service-not-allowed'])(
    'stops for good after %s and reports it once',
    (error) => {
      const onError = vi.fn()
      const { result, rerender } = renderHook(({ enabled }) => useWakeWord({ enabled, onError }), {
        initialProps: { enabled: true },
      })
      const r = current()
      r.fail(error)
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(r.start).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(result.current.error).toBeTruthy()

      // Toggling enabled (happens around every push-to-talk turn) must not
      // start a new attempt against a blocked mic
      rerender({ enabled: false })
      rerender({ enabled: true })
      expect(FakeRecognition.instances).toHaveLength(1)
    },
  )

  it('backs off exponentially on transient errors, then gives up', () => {
    const onError = vi.fn()
    renderHook(() => useWakeWord({ enabled: true, onError }))
    const r = current()

    r.fail('network') // failure 1 → 600ms
    act(() => {
      vi.advanceTimersByTime(599)
    })
    expect(r.start).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(r.start).toHaveBeenCalledTimes(2)

    r.fail('network') // failure 2 → 1200ms
    act(() => {
      vi.advanceTimersByTime(1199)
    })
    expect(r.start).toHaveBeenCalledTimes(2)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(r.start).toHaveBeenCalledTimes(3)

    r.fail('network')
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    r.fail('network')
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    const startsBeforeLimit = r.start.mock.calls.length
    r.fail('network') // 5th: give up
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(r.start).toHaveBeenCalledTimes(startsBeforeLimit)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('a result resets the failure count', () => {
    renderHook(() => useWakeWord({ enabled: true }))
    const r = current()
    r.fail('network')
    act(() => {
      vi.advanceTimersByTime(600)
    })
    act(() => {
      r.onresult?.({ resultIndex: 0, results: [[{ transcript: 'just chatting' }]] })
    })
    r.fail('network') // back to failure 1 → 600ms, not 1200ms
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(r.start).toHaveBeenCalledTimes(3)
  })

  it('a new wake word gets a fresh chance after being blocked', () => {
    const { rerender } = renderHook(({ wakeWord }) => useWakeWord({ enabled: true, wakeWord }), {
      initialProps: { wakeWord: 'hey talkie' },
    })
    current().fail('not-allowed')
    rerender({ wakeWord: 'yo robot' })
    expect(FakeRecognition.instances).toHaveLength(2)
    expect(current().start).toHaveBeenCalledTimes(1)
  })

  it('turning the wake word off and on again gives a blocked detector a fresh try', () => {
    const onError = vi.fn()
    const { result, rerender } = renderHook(
      ({ on }) => useWakeWord({ enabled: on, userEnabled: on, onError }),
      { initialProps: { on: true } },
    )
    current().fail('not-allowed')
    expect(result.current.error).not.toBeNull()

    rerender({ on: false })
    rerender({ on: true })
    expect(result.current.error).toBeNull()
    expect(FakeRecognition.instances).toHaveLength(2)
    expect(current().start).toHaveBeenCalledTimes(1)
  })
})
