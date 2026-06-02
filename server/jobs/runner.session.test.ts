import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'

// Mock child_process so no real `claude` process is spawned. execFileSync backs
// isClaudeCliAvailable(); returning a value makes the CLI appear installed.
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(() => ''),
}))

import { spawn } from 'child_process'
import { spawnClaude, _resetSessionTracking } from './runner.js'

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: () => void
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = 4321
  child.kill = vi.fn()
  return child
}

/** Queue a scripted process for the next spawn() call. */
function nextProcess(drive: (c: FakeChild) => void) {
  spawnMock.mockImplementationOnce(() => {
    const c = fakeChild()
    setImmediate(() => drive(c))
    return c
  })
}

function emitAssistantText(c: FakeChild, text: string) {
  c.stdout.emit(
    'data',
    Buffer.from(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } }) + '\n',
    ),
  )
}

const UUID = '11111111-2222-3333-4444-555555555555'

function noopCallbacks() {
  return {
    onText: vi.fn(),
    onActivity: vi.fn(),
    onError: vi.fn(),
    onComplete: vi.fn(),
  }
}

/** The args array passed to the Nth spawn() call. */
function argsOf(call: number): string[] {
  return spawnMock.mock.calls[call][1] as string[]
}

describe('spawnClaude session strategy', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    _resetSessionTracking()
  })

  it('creates a new session with --session-id and seeds history on the first turn', async () => {
    nextProcess((c) => {
      emitAssistantText(c, 'hello')
      c.emit('close', 0)
    })

    const cb = noopCallbacks()
    const handle = spawnClaude({
      prompt: 'hi',
      conversationId: UUID,
      history: [{ role: 'user', content: 'earlier message' }],
      callbacks: cb,
    })
    await handle.promise

    const args = argsOf(0)
    expect(args).toContain('--session-id')
    expect(args).toContain(UUID)
    expect(args).not.toContain('--resume')
    // History is seeded into the create prompt.
    expect(args[1]).toContain('[Recent conversation]')
    expect(cb.onComplete).toHaveBeenCalledWith(0)
  })

  it('resumes with --resume and omits history once the session is established', async () => {
    // First turn establishes the session.
    nextProcess((c) => {
      emitAssistantText(c, 'first')
      c.emit('close', 0)
    })
    await spawnClaude({ prompt: 'one', conversationId: UUID, callbacks: noopCallbacks() }).promise

    // Second turn should resume.
    nextProcess((c) => {
      emitAssistantText(c, 'second')
      c.emit('close', 0)
    })
    await spawnClaude({
      prompt: 'two',
      conversationId: UUID,
      history: [{ role: 'user', content: 'one' }],
      callbacks: noopCallbacks(),
    }).promise

    const args = argsOf(1)
    expect(args).toContain('--resume')
    expect(args).toContain(UUID)
    expect(args).not.toContain('--session-id')
    expect(args[1]).not.toContain('[Recent conversation]')
  })

  it('falls back to --session-id when --resume reports no such session', async () => {
    // Pretend the session is established so the first attempt resumes...
    nextProcess((c) => {
      emitAssistantText(c, 'x')
      c.emit('close', 0)
    })
    await spawnClaude({ prompt: 'seed', conversationId: UUID, callbacks: noopCallbacks() }).promise
    spawnMock.mockReset()

    // ...but the on-disk session is gone: resume fails, create succeeds.
    nextProcess((c) => {
      c.stderr.emit('data', Buffer.from(`No conversation found with session ID: ${UUID}\n`))
      c.emit('close', 1)
    })
    nextProcess((c) => {
      emitAssistantText(c, 'recovered')
      c.emit('close', 0)
    })

    const cb = noopCallbacks()
    await spawnClaude({
      prompt: 'again',
      conversationId: UUID,
      history: [{ role: 'user', content: 'seed' }],
      callbacks: cb,
    }).promise

    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(argsOf(0)).toContain('--resume')
    expect(argsOf(1)).toContain('--session-id')
    // The session-not-found error is swallowed, not surfaced to the client.
    expect(cb.onError).not.toHaveBeenCalled()
    expect(cb.onComplete).toHaveBeenCalledTimes(1)
    expect(cb.onComplete).toHaveBeenCalledWith(0)
    // The successful recovery text reached the client.
    expect(cb.onText).toHaveBeenCalledWith('recovered')
  })

  it('uses a one-shot process (no session flags) when no conversationId is given', async () => {
    nextProcess((c) => {
      emitAssistantText(c, 'job')
      c.emit('close', 0)
    })
    await spawnClaude({ prompt: 'run a job', callbacks: noopCallbacks() }).promise

    const args = argsOf(0)
    expect(args).toContain('--no-session-persistence')
    expect(args).not.toContain('--session-id')
    expect(args).not.toContain('--resume')
  })
})
