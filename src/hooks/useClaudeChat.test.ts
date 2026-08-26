import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useClaudeChat } from './useClaudeChat'
import { sendMessageViaClaudeCode, type ActivityEvent, type PlanEvent } from '../lib/claude'
import { detectAndSavePlan } from '../lib/planDetection'
import * as api from '../lib/api'
import type { DroppedFile, Message } from '../types'

vi.mock('../lib/claude', () => ({ sendMessageViaClaudeCode: vi.fn() }))
vi.mock('../lib/planDetection', () => ({ detectAndSavePlan: vi.fn(async () => null) }))
vi.mock('../lib/api', () => ({
  createPlan: vi.fn(async (p: { title: string }) => ({ id: 'plan-1', title: p.title })),
  orchestrateJobs: vi.fn(async () => ({ jobs: [{ id: 'j1' }, { id: 'j2' }] })),
}))

const sendMock = vi.mocked(sendMessageViaClaudeCode)

const MODES: api.ModeInfo[] = [
  { name: 'voice', label: 'Voice', description: '', icon: '🎙️' },
  { name: 'architect', label: 'Architect', description: '', icon: '📐' },
  { name: 'code-review', label: 'Code Review', description: '', icon: '🔍' },
]

/** Params with every collaborator stubbed, so tests assert on the calls. */
function makeParams(overrides: Partial<Parameters<typeof useClaudeChat>[0]> = {}) {
  return {
    ttsEnabled: false,
    messages: [] as Message[],
    addMessage: vi.fn(),
    setAvatarState: vi.fn(),
    setTranscript: vi.fn(),
    speak: vi.fn(),
    playSound: vi.fn(),
    clearSpeechTranscript: vi.fn(),
    attachedFiles: [],
    clearFiles: vi.fn(),
    clearImageAnalyses: vi.fn(),
    getImageContext: vi.fn(() => ''),
    addActivity: vi.fn(() => 'activity-id'),
    updateActivity: vi.fn(),
    clearActivities: vi.fn(),
    finalizeActivities: vi.fn(),
    currentConversationId: 'conv-1',
    mode: 'voice',
    onModeChange: vi.fn(),
    availableModes: MODES,
    ...overrides,
  }
}

function setup(overrides: Partial<Parameters<typeof useClaudeChat>[0]> = {}) {
  const params = makeParams(overrides)
  const { result } = renderHook(() => useClaudeChat(params))
  return { result, params }
}

/** Default: stream nothing and resolve. */
beforeEach(() => {
  vi.clearAllMocks()
  sendMock.mockImplementation(async () => '')
  vi.mocked(detectAndSavePlan).mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sending a message', () => {
  it('ignores empty and whitespace-only input', async () => {
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('   ')
    })

    expect(sendMock).not.toHaveBeenCalled()
    expect(params.addMessage).not.toHaveBeenCalled()
  })

  it('adds the user message and streams the response into responseText', async () => {
    sendMock.mockImplementation(async (_msg, onChunk) => {
      onChunk('Hello ')
      onChunk('world')
      return 'Hello world'
    })
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('hi there')
    })

    expect(params.addMessage).toHaveBeenCalledWith({ role: 'user', content: 'hi there' }, undefined)
    expect(params.addMessage).toHaveBeenCalledWith({ role: 'assistant', content: 'Hello world' })
    // Cleared once the assistant message is committed, so it is not shown twice.
    expect(result.current.responseText).toBe('')
  })

  it('sets thinking state and clears prior transcript and activities', async () => {
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('hi')
    })

    expect(params.setAvatarState).toHaveBeenCalledWith('thinking')
    expect(params.playSound).toHaveBeenCalledWith('thinking')
    expect(params.clearActivities).toHaveBeenCalled()
    expect(params.clearSpeechTranscript).toHaveBeenCalled()
  })

  it('passes prior messages as history and threads the conversation id', async () => {
    const messages = [
      { id: '1', role: 'user', content: 'earlier', timestamp: 0 },
      { id: '2', role: 'assistant', content: 'reply', timestamp: 1 },
    ] as Message[]
    const { result } = setup({ messages })

    await act(async () => {
      await result.current.handleSendMessage('next')
    })

    expect(sendMock.mock.calls[0]?.[2]).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'reply' },
    ])
    expect(sendMock.mock.calls[0]?.[7]).toBe('conv-1')
  })

  it('speaks the response when TTS is on, and shows a happy avatar when it is off', async () => {
    sendMock.mockImplementation(async (_m, onChunk) => {
      onChunk('spoken')
      return 'spoken'
    })

    const withTts = setup({ ttsEnabled: true })
    await act(async () => {
      await withTts.result.current.handleSendMessage('hi')
    })
    expect(withTts.params.speak).toHaveBeenCalledWith('spoken')

    const withoutTts = setup({ ttsEnabled: false })
    await act(async () => {
      await withoutTts.result.current.handleSendMessage('hi')
    })
    expect(withoutTts.params.speak).not.toHaveBeenCalled()
    expect(withoutTts.params.setAvatarState).toHaveBeenCalledWith('happy')
  })
})

describe('image attachments', () => {
  const file: DroppedFile = {
    id: 'f1',
    dataUrl: 'data:image/png;base64,abc',
    name: 'shot.png',
    type: 'image/png',
    size: 1024,
    description: 'a screenshot',
  }

  it('attaches images to the user message and forwards them to the API', async () => {
    const { result, params } = setup({ attachedFiles: [file] })

    await act(async () => {
      await result.current.handleSendMessage('what is this')
    })

    expect(params.addMessage).toHaveBeenCalledWith({ role: 'user', content: 'what is this' }, [
      { id: 'f1', dataUrl: file.dataUrl, fileName: 'shot.png', description: 'a screenshot' },
    ])
    expect(sendMock.mock.calls[0]?.[4]).toEqual([{ dataUrl: file.dataUrl, fileName: 'shot.png' }])
  })

  it('clears attachments and their analyses after a successful send', async () => {
    const { result, params } = setup({ attachedFiles: [file] })

    await act(async () => {
      await result.current.handleSendMessage('hi')
    })

    expect(params.clearFiles).toHaveBeenCalled()
    expect(params.clearImageAnalyses).toHaveBeenCalled()
  })

  it('prepends stored image context when nothing is freshly attached', async () => {
    const { result } = setup({
      attachedFiles: [],
      getImageContext: vi.fn(() => 'a red circle'),
    })

    await act(async () => {
      await result.current.handleSendMessage('describe it')
    })

    const sentMessage = sendMock.mock.calls[0]?.[0]
    expect(sentMessage).toContain('[Image Context]')
    expect(sentMessage).toContain('a red circle')
    expect(sentMessage).toContain('describe it')
  })

  it('does not add image context when images are attached directly', async () => {
    const getImageContext = vi.fn(() => 'stale context')
    const { result } = setup({ attachedFiles: [file], getImageContext })

    await act(async () => {
      await result.current.handleSendMessage('hi')
    })

    expect(getImageContext).not.toHaveBeenCalled()
    expect(sendMock.mock.calls[0]?.[0]).toBe('hi')
  })
})

describe('mode switching', () => {
  it('switches mode from a spoken command and uses it for the same turn', async () => {
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('switch to architect mode and plan this')
    })

    expect(params.onModeChange).toHaveBeenCalledWith('architect')
    expect(sendMock.mock.calls[0]?.[6]).toBe('architect')
  })

  it('matches a mode by its single-word label as well as its name', async () => {
    const { result, params } = setup({ mode: 'architect' })

    await act(async () => {
      await result.current.handleSendMessage('use voice mode')
    })

    expect(params.onModeChange).toHaveBeenCalledWith('voice')
  })

  it('matches a hyphenated mode name', async () => {
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('switch to code-review mode')
    })

    expect(params.onModeChange).toHaveBeenCalledWith('code-review')
  })

  // Known gap: MODE_SWITCH_PATTERN captures a single `\w[\w-]*` token, which
  // cannot span a space, so a multi-word label like "Code Review" never reaches
  // the label comparison. Spoken naturally ("use code review mode") this is a
  // silent no-op. Pinned here so a fix to the pattern shows up as a failure.
  it('does not yet match a multi-word label spoken with spaces', async () => {
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('use code review mode')
    })

    expect(params.onModeChange).not.toHaveBeenCalled()
  })

  it('keeps the current mode when the requested one is unknown', async () => {
    const { result, params } = setup({ mode: 'voice' })

    await act(async () => {
      await result.current.handleSendMessage('switch to nonsense mode')
    })

    expect(params.onModeChange).not.toHaveBeenCalled()
    expect(sendMock.mock.calls[0]?.[6]).toBe('voice')
  })
})

describe('multi-mode orchestration', () => {
  it('dispatches parallel jobs when two or more modes are named', async () => {
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('run architect and code review on the auth flow')
    })

    expect(api.orchestrateJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        tasks: [
          { prompt: 'the auth flow', mode: 'architect' },
          { prompt: 'the auth flow', mode: 'code-review' },
        ],
      }),
    )
    // Orchestration short-circuits the normal send.
    expect(sendMock).not.toHaveBeenCalled()
    expect(params.addMessage).toHaveBeenCalledWith({
      role: 'user',
      content: 'run architect and code review on the auth flow',
    })
  })

  it('announces the dispatch, then clears the notice after five seconds', async () => {
    vi.useFakeTimers()
    const { result } = setup()

    await act(async () => {
      await result.current.handleSendMessage('run architect and code review on this')
    })
    // The notice is set from the orchestrate promise; flush microtasks. (waitFor
    // polls on real timers and would deadlock against the fake clock.)
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.planNotification).toContain('2 jobs dispatched')

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.planNotification).toBeNull()
  })

  it('falls through to a normal send when only one mode is named', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.handleSendMessage('run architect on this')
    })

    expect(api.orchestrateJobs).not.toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalled()
  })

  it('does not orchestrate without a conversation to attach the jobs to', async () => {
    const { result } = setup({ currentConversationId: null })

    await act(async () => {
      await result.current.handleSendMessage('run architect and code review on this')
    })

    expect(api.orchestrateJobs).not.toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalled()
  })
})

describe('tool activity tracking', () => {
  /** Run a turn that emits the given activity events mid-stream. */
  async function withActivity(events: ActivityEvent[], params = makeParams()) {
    sendMock.mockImplementation(async (_m, _c, _h, onActivity) => {
      events.forEach((e) => onActivity?.(e))
      return ''
    })
    const { result } = renderHook(() => useClaudeChat(params))
    await act(async () => {
      await result.current.handleSendMessage('go')
    })
    return params
  }

  it('opens a running activity for each tool_start', async () => {
    const params = await withActivity([
      { type: 'tool_start', tool: 'Read', id: 't1', input: '/a.ts' },
    ])

    expect(params.addActivity).toHaveBeenCalledWith({
      type: 'tool_start',
      tool: 'Read',
      input: '/a.ts',
      status: 'running',
    })
  })

  it('updates the matching activity when the tool input arrives late', async () => {
    const params = makeParams({ addActivity: vi.fn(() => 'act-7') })
    await withActivity(
      [
        { type: 'tool_start', tool: 'Write', id: 't1' },
        { type: 'tool_input', id: 't1', input: '/out.md' },
      ],
      params,
    )

    expect(params.updateActivity).toHaveBeenCalledWith('act-7', { input: '/out.md' })
  })

  it('closes the activity on tool_end, carrying status and output', async () => {
    const params = makeParams({ addActivity: vi.fn(() => 'act-9') })
    await withActivity(
      [
        { type: 'tool_start', tool: 'Bash', id: 't2' },
        { type: 'tool_end', id: 't2', status: 'error', output: 'boom' },
      ],
      params,
    )

    expect(params.updateActivity).toHaveBeenCalledWith('act-9', {
      status: 'error',
      output: 'boom',
    })
  })

  it('ignores updates for a tool id that was never started', async () => {
    const params = await withActivity([{ type: 'tool_end', id: 'unknown', status: 'complete' }])
    expect(params.updateActivity).not.toHaveBeenCalled()
  })

  it('marks every open activity complete on all_complete', async () => {
    const ids = ['act-1', 'act-2']
    const params = makeParams({ addActivity: vi.fn(() => ids.shift() as string) })
    await withActivity(
      [
        { type: 'tool_start', tool: 'Read', id: 'a' },
        { type: 'tool_start', tool: 'Grep', id: 'b' },
        { type: 'all_complete', status: 'complete' },
      ],
      params,
    )

    expect(params.updateActivity).toHaveBeenCalledWith('act-1', { status: 'complete' })
    expect(params.updateActivity).toHaveBeenCalledWith('act-2', { status: 'complete' })
  })
})

describe('plan detection', () => {
  const plan: PlanEvent = { title: 'Migration Plan', content: '# Migration Plan\n- step' }

  it('saves a plan reported through tool use and announces it', async () => {
    sendMock.mockImplementation(async (_m, onChunk, _h, _a, _i, onPlan) => {
      onPlan?.(plan)
      onChunk('done')
      return 'done'
    })
    const { result } = setup()

    await act(async () => {
      await result.current.handleSendMessage('plan it')
    })

    expect(api.createPlan).toHaveBeenCalledWith({
      title: 'Migration Plan',
      content: plan.content,
      status: 'draft',
      conversationId: 'conv-1',
    })
    await waitFor(() => expect(result.current.planNotification).toBe('Migration Plan'))
  })

  it('falls back to detecting a plan in the response text', async () => {
    vi.mocked(detectAndSavePlan).mockResolvedValue({ id: 'p2', title: 'Detected Plan' } as never)
    sendMock.mockImplementation(async (_m, onChunk) => {
      onChunk('some plan-ish prose')
      return 'some plan-ish prose'
    })
    const { result } = setup()

    await act(async () => {
      await result.current.handleSendMessage('plan it')
    })

    expect(detectAndSavePlan).toHaveBeenCalledWith('some plan-ish prose', 'conv-1')
    await waitFor(() => expect(result.current.planNotification).toBe('Detected Plan'))
  })

  it('prefers the tool-use plan over text detection', async () => {
    sendMock.mockImplementation(async (_m, onChunk, _h, _a, _i, onPlan) => {
      onPlan?.(plan)
      onChunk('text that also looks like a plan')
      return 'text'
    })
    const { result } = setup()

    await act(async () => {
      await result.current.handleSendMessage('plan it')
    })

    expect(api.createPlan).toHaveBeenCalled()
    expect(detectAndSavePlan).not.toHaveBeenCalled()
  })

  it('does not run text detection on an empty response', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.handleSendMessage('hi')
    })

    expect(detectAndSavePlan).not.toHaveBeenCalled()
  })
})

describe('error handling', () => {
  it('surfaces the error message and shows a confused avatar', async () => {
    sendMock.mockRejectedValue(new Error('network down'))
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('hi')
    })

    expect(result.current.error).toBe('network down')
    expect(params.playSound).toHaveBeenCalledWith('error')
    expect(params.setAvatarState).toHaveBeenCalledWith('confused')
  })

  it('keeps a partial response when the stream fails mid-way', async () => {
    sendMock.mockImplementation(async (_m, onChunk) => {
      onChunk('partial answer')
      throw new Error('connection reset')
    })
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('hi')
    })

    expect(params.addMessage).toHaveBeenCalledWith({
      role: 'assistant',
      content: 'partial answer',
    })
    expect(params.finalizeActivities).toHaveBeenCalled()
  })

  it('does not add an empty assistant message when nothing streamed', async () => {
    sendMock.mockRejectedValue(new Error('failed immediately'))
    const { result, params } = setup()

    await act(async () => {
      await result.current.handleSendMessage('hi')
    })

    const assistantCalls = vi
      .mocked(params.addMessage)
      .mock.calls.filter((c) => (c[0] as { role: string }).role === 'assistant')
    expect(assistantCalls).toHaveLength(0)
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    sendMock.mockRejectedValue('just a string')
    const { result } = setup()

    await act(async () => {
      await result.current.handleSendMessage('hi')
    })

    expect(result.current.error).toBe('Something went wrong')
  })

  it('clears a previous error on the next send', async () => {
    sendMock.mockRejectedValueOnce(new Error('first failure'))
    const { result } = setup()

    await act(async () => {
      await result.current.handleSendMessage('one')
    })
    expect(result.current.error).toBe('first failure')

    sendMock.mockImplementation(async () => '')
    await act(async () => {
      await result.current.handleSendMessage('two')
    })
    expect(result.current.error).toBe('')
  })
})
