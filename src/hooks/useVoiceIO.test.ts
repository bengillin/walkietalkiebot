import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import { useVoiceIO } from './useVoiceIO'
import type { AvatarState } from '../types'

/**
 * The voice sub-hooks are thin wrappers over browser speech APIs that jsdom does
 * not implement. Mock them and capture the options each receives, so tests can
 * fire the callbacks the way the real APIs would.
 */
const captured = vi.hoisted(() => ({
  recognition: null as Record<string, never> | null,
  wakeWord: null as Record<string, never> | null,
  synthesis: null as Record<string, never> | null,
  isListening: false,
  isSpeaking: false,
  start: vi.fn(),
  stop: vi.fn(),
  clearTranscript: vi.fn(),
  play: vi.fn(),
  reset() {
    this.recognition = null
    this.wakeWord = null
    this.synthesis = null
    this.isListening = false
    this.isSpeaking = false
    this.start.mockClear()
    this.stop.mockClear()
    this.clearTranscript.mockClear()
    this.play.mockClear()
  },
}))

vi.mock('../components/voice/useSpeechRecognition', () => ({
  useSpeechRecognition: (options: Record<string, never>) => {
    captured.recognition = options
    return {
      isListening: captured.isListening,
      isSupported: true,
      start: captured.start,
      stop: captured.stop,
      clearTranscript: captured.clearTranscript,
    }
  },
}))

vi.mock('../components/voice/useSpeechSynthesis', () => ({
  useSpeechSynthesis: (options: Record<string, never>) => {
    captured.synthesis = options
    return {
      speak: vi.fn(),
      speakStreaming: vi.fn(),
      isSpeaking: captured.isSpeaking,
      isSupported: true,
    }
  },
}))

vi.mock('../components/voice/useWakeWord', () => ({
  useWakeWord: (options: Record<string, never>) => {
    captured.wakeWord = options
  },
}))

vi.mock('./useSoundEffects', () => ({
  useSoundEffects: () => ({ play: captured.play }),
}))

/** Callbacks the hook handed to useSpeechRecognition. */
function recognition() {
  return captured.recognition as unknown as {
    onInterimResult: (t: string) => void
    onResult: (t: string) => void
    onEnd: () => void
    onTriggerWord: (t: string) => void
    onError: (e: string) => void
    triggerWord: string
    triggerWordDelay: number
  }
}

function synthesis() {
  return captured.synthesis as unknown as {
    onStart: () => void
    onEnd: () => void
    onError: (e: string) => void
    voice?: string
  }
}

function wakeWord() {
  return captured.wakeWord as unknown as {
    wakeWord: string
    enabled: boolean
    onWakeWord: () => void
  }
}

function setup(overrides: Partial<Parameters<typeof useVoiceIO>[0]> = {}) {
  const onSendMessage = vi.fn()
  const onSendMessageRef = createRef<(text: string) => void>() as React.MutableRefObject<
    (text: string) => void
  >
  onSendMessageRef.current = onSendMessage

  const params = {
    onSendMessageRef,
    avatarState: 'idle' as AvatarState,
    setAvatarState: vi.fn(),
    transcript: '',
    setTranscript: vi.fn(),
    ttsEnabled: true,
    ttsVoice: 'Samantha',
    soundEffectsEnabled: true,
    wakeWordEnabled: true,
    customWakeWord: '',
    customTriggerWord: '',
    triggerWordDelay: 500,
    ...overrides,
  }

  const view = renderHook((p: typeof params) => useVoiceIO(p), { initialProps: params })
  return { ...view, params, onSendMessage }
}

beforeEach(() => {
  captured.reset()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('transcript capture', () => {
  it('publishes interim and final results as they arrive', () => {
    const { params } = setup()

    act(() => recognition().onInterimResult('partial sp'))
    expect(params.setTranscript).toHaveBeenCalledWith('partial sp')

    act(() => recognition().onResult('partial speech'))
    expect(params.setTranscript).toHaveBeenCalledWith('partial speech')
  })

  it('sends the captured transcript when recognition ends', () => {
    const { onSendMessage } = setup()

    act(() => recognition().onResult('what is the weather'))
    act(() => recognition().onEnd())

    expect(onSendMessage).toHaveBeenCalledWith('what is the weather')
  })

  it('trims surrounding whitespace before sending', () => {
    const { onSendMessage } = setup()

    act(() => recognition().onResult('  padded  '))
    act(() => recognition().onEnd())

    expect(onSendMessage).toHaveBeenCalledWith('padded')
  })

  it('goes idle instead of sending when nothing was captured', () => {
    const { params, onSendMessage } = setup()

    act(() => recognition().onEnd())

    expect(onSendMessage).not.toHaveBeenCalled()
    expect(params.setAvatarState).toHaveBeenCalledWith('idle')
  })

  it('does not resend the previous transcript on a later empty turn', () => {
    const { onSendMessage } = setup()

    act(() => recognition().onResult('first message'))
    act(() => recognition().onEnd())
    expect(onSendMessage).toHaveBeenCalledTimes(1)

    // The ref is cleared after a send, so an empty second turn sends nothing.
    act(() => recognition().onEnd())
    expect(onSendMessage).toHaveBeenCalledTimes(1)
  })
})

describe('trigger word', () => {
  it('sends immediately when the trigger word fires', () => {
    const { onSendMessage } = setup()

    act(() => recognition().onTriggerWord('deploy the app'))

    expect(onSendMessage).toHaveBeenCalledWith('deploy the app')
  })

  // onTriggerWord already clears the transcript ref, so the end-of-recognition
  // guard is not what prevents a second send -- it is what stops onEnd from
  // yanking the avatar back to idle while the response is already in flight.
  it('sends once and leaves the avatar alone when recognition then ends', () => {
    const { params, onSendMessage } = setup()

    act(() => recognition().onTriggerWord('deploy the app'))
    act(() => recognition().onEnd())

    expect(onSendMessage).toHaveBeenCalledTimes(1)
    expect(params.setAvatarState).not.toHaveBeenCalledWith('idle')
  })

  it('re-arms after the suppressed end, so the next turn behaves normally', () => {
    const { params, onSendMessage } = setup()

    act(() => recognition().onTriggerWord('first'))
    act(() => recognition().onEnd())
    expect(params.setAvatarState).not.toHaveBeenCalledWith('idle')

    act(() => recognition().onResult('second'))
    act(() => recognition().onEnd())
    expect(onSendMessage).toHaveBeenCalledTimes(2)
    expect(onSendMessage).toHaveBeenLastCalledWith('second')

    // Guard is back down: an empty third turn resets the avatar again.
    act(() => recognition().onEnd())
    expect(params.setAvatarState).toHaveBeenCalledWith('idle')
  })

  it('goes idle when the trigger word fires with nothing to send', () => {
    const { params, onSendMessage } = setup()

    act(() => recognition().onTriggerWord('   '))

    expect(onSendMessage).not.toHaveBeenCalled()
    expect(params.setAvatarState).toHaveBeenCalledWith('idle')
  })

  it('defaults the trigger word to "over" and honours a custom one', () => {
    setup()
    expect(recognition().triggerWord).toBe('over')

    setup({ customTriggerWord: 'roger' })
    expect(recognition().triggerWord).toBe('roger')
  })

  it('passes the configured trigger delay through', () => {
    setup({ triggerWordDelay: 1200 })
    expect(recognition().triggerWordDelay).toBe(1200)
  })
})

describe('recognition errors', () => {
  it('shows the error, looks confused, then returns to idle', () => {
    vi.useFakeTimers()
    const { params } = setup()

    act(() => recognition().onError('no-speech'))

    expect(params.setTranscript).toHaveBeenCalledWith('Speech recognition error: no-speech')
    expect(params.setAvatarState).toHaveBeenCalledWith('confused')

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(params.setAvatarState).toHaveBeenCalledWith('idle')
  })

  it('discards the pending transcript so it is not sent after an error', () => {
    const { onSendMessage } = setup()

    act(() => recognition().onResult('half heard'))
    act(() => recognition().onError('audio-capture'))
    act(() => recognition().onEnd())

    expect(onSendMessage).not.toHaveBeenCalled()
  })
})

describe('speech synthesis wiring', () => {
  it('shows the speaking avatar while TTS plays', () => {
    const { params } = setup()

    act(() => synthesis().onStart())
    expect(params.setAvatarState).toHaveBeenCalledWith('speaking')
  })

  it('goes happy then idle when TTS finishes', () => {
    vi.useFakeTimers()
    const { params } = setup()

    act(() => synthesis().onEnd())
    expect(params.setAvatarState).toHaveBeenCalledWith('happy')

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(params.setAvatarState).toHaveBeenCalledWith('idle')
  })

  it('drops straight to idle on a TTS error', () => {
    const { params } = setup()

    act(() => synthesis().onError('synthesis-failed'))
    expect(params.setAvatarState).toHaveBeenCalledWith('idle')
  })

  it('passes the selected voice, and undefined when none is chosen', () => {
    setup({ ttsVoice: 'Daniel' })
    expect(synthesis().voice).toBe('Daniel')

    setup({ ttsVoice: '' })
    expect(synthesis().voice).toBeUndefined()
  })
})

describe('push to talk', () => {
  it('starts listening with a sound cue', () => {
    const { result } = setup()

    act(() => result.current.handleTalkStart())

    expect(captured.play).toHaveBeenCalledWith('startListening')
    expect(captured.start).toHaveBeenCalled()
  })

  it('stops listening with a sound cue', () => {
    const { result } = setup()

    act(() => result.current.handleTalkEnd())

    expect(captured.play).toHaveBeenCalledWith('stopListening')
    expect(captured.stop).toHaveBeenCalled()
  })

  it('clears any leftover transcript when a new turn starts', () => {
    const { result, onSendMessage } = setup()

    act(() => recognition().onResult('stale text'))
    act(() => result.current.handleTalkStart())
    act(() => recognition().onEnd())

    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('re-arms the trigger word guard on a new turn', () => {
    const { result, onSendMessage } = setup()

    // A trigger-word send leaves the guard set; starting a new turn clears it.
    act(() => recognition().onTriggerWord('sent via trigger'))
    act(() => result.current.handleTalkStart())
    act(() => recognition().onResult('spoken normally'))
    act(() => recognition().onEnd())

    expect(onSendMessage).toHaveBeenLastCalledWith('spoken normally')
  })
})

describe('wake word', () => {
  it('defaults to "hey talkie" and honours a custom phrase', () => {
    setup()
    expect(wakeWord().wakeWord).toBe('hey talkie')

    setup({ customWakeWord: 'yo robot' })
    expect(wakeWord().wakeWord).toBe('yo robot')
  })

  it('is enabled only when idle and not already listening or speaking', () => {
    setup()
    expect(wakeWord().enabled).toBe(true)

    setup({ wakeWordEnabled: false })
    expect(wakeWord().enabled).toBe(false)

    // Suppressed while thinking, so it cannot interrupt a response.
    setup({ avatarState: 'thinking' })
    expect(wakeWord().enabled).toBe(false)

    captured.isListening = true
    setup()
    expect(wakeWord().enabled).toBe(false)
    captured.isListening = false

    captured.isSpeaking = true
    setup()
    expect(wakeWord().enabled).toBe(false)
    captured.isSpeaking = false
  })

  it('starts a recording turn when the wake word fires', () => {
    setup()

    act(() => wakeWord().onWakeWord())

    expect(captured.play).toHaveBeenCalledWith('startListening')
    expect(captured.start).toHaveBeenCalled()
  })
})

describe('avatar and sound side effects', () => {
  it('switches the avatar to listening once recognition is live', () => {
    captured.isListening = true
    const { params } = setup()

    expect(params.setAvatarState).toHaveBeenCalledWith('listening')
  })

  it('plays the success chime when the avatar turns happy', () => {
    setup({ avatarState: 'happy' })
    expect(captured.play).toHaveBeenCalledWith('success')
  })

  it('stays silent when happy is only a hover effect', () => {
    const { result, rerender, params } = setup({ avatarState: 'idle' })

    // The FAB sets this ref while the pointer is over the avatar.
    result.current.isAvatarHoverHappy.current = true
    rerender({ ...params, avatarState: 'happy' as AvatarState })

    expect(captured.play).not.toHaveBeenCalledWith('success')
  })
})

describe('state sync', () => {
  it('posts the avatar state so MCP tools can read it', async () => {
    setup({ avatarState: 'thinking' })

    expect(fetch).toHaveBeenCalledWith(
      '/api/state',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ avatarState: 'thinking' }),
      }),
    )
  })

  it('ignores sync failures rather than surfacing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('server down'))),
    )

    expect(() => setup()).not.toThrow()
    await act(async () => {
      await Promise.resolve()
    })
  })
})
