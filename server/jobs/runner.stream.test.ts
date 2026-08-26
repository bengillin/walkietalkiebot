import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'

// Mock child_process so no real `claude` process is spawned. execFileSync backs
// isClaudeCliAvailable(); returning a value makes the CLI appear installed.
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(() => ''),
}))

// Stub only the writes so image attachments never touch the real filesystem.
// Partial mock: modes.ts still needs the real existsSync/readdirSync to load
// custom modes.
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

import { spawn } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { spawnClaude, _resetSessionTracking, type ActivityEvent } from './runner.js'

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: ReturnType<typeof vi.fn>
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

/** Feed one already-serialized stream-json event, newline-terminated. */
function emit(c: FakeChild, event: unknown) {
  c.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'))
}

function callbacks() {
  return {
    onText: vi.fn(),
    onActivity: vi.fn(),
    onPlan: vi.fn(),
    onError: vi.fn(),
    onComplete: vi.fn(),
  }
}

/** All activity events of a given type that reached the callbacks. */
function activitiesOfType(cb: ReturnType<typeof callbacks>, type: string): ActivityEvent[] {
  return cb.onActivity.mock.calls.map((c) => c[0] as ActivityEvent).filter((a) => a.type === type)
}

/**
 * Run a one-shot turn (no conversationId) against a scripted process and
 * resolve once the runner has finished.
 */
async function run(
  drive: (c: FakeChild) => void,
  options: Partial<Parameters<typeof spawnClaude>[0]> = {},
) {
  nextProcess(drive)
  const cb = callbacks()
  const handle = spawnClaude({ prompt: 'hi', callbacks: cb, ...options })
  await handle.promise
  return { cb, handle }
}

beforeEach(() => {
  spawnMock.mockReset()
  _resetSessionTracking()
  vi.mocked(writeFileSync).mockClear()
  vi.mocked(unlinkSync).mockClear()
})

describe('stream parsing: assistant text', () => {
  it('forwards assistant text to onText and reports the exit code', async () => {
    const { cb } = await run((c) => {
      emit(c, { type: 'assistant', message: { content: [{ type: 'text', text: 'hello there' }] } })
      c.emit('close', 0)
    })

    expect(cb.onText).toHaveBeenCalledWith('hello there')
    expect(cb.onComplete).toHaveBeenCalledWith(0)
  })

  it('strips <thinking> blocks from assistant text', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: '<thinking>secret reasoning</thinking>visible answer' }],
        },
      })
      c.emit('close', 0)
    })

    expect(cb.onText).toHaveBeenCalledWith('visible answer')
  })

  it('drops text that is only a <thinking> block, emitting nothing', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '<thinking>all internal</thinking>   ' }] },
      })
      c.emit('close', 0)
    })

    expect(cb.onText).not.toHaveBeenCalled()
  })

  it('forwards text_delta chunks as they stream', async () => {
    const { cb } = await run((c) => {
      emit(c, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'par' } })
      emit(c, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'tial' } })
      c.emit('close', 0)
    })

    expect(cb.onText.mock.calls.map((call) => call[0])).toEqual(['par', 'tial'])
  })
})

describe('stream parsing: chunk boundaries', () => {
  // The runner buffers stdout and splits on newlines; a JSON event split across
  // two data chunks must still parse exactly once.
  it('reassembles a JSON event split across two stdout chunks', async () => {
    const line =
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'split across chunks' }] },
      }) + '\n'
    const cut = Math.floor(line.length / 2)

    const { cb } = await run((c) => {
      c.stdout.emit('data', Buffer.from(line.slice(0, cut)))
      c.stdout.emit('data', Buffer.from(line.slice(cut)))
      c.emit('close', 0)
    })

    expect(cb.onText).toHaveBeenCalledTimes(1)
    expect(cb.onText).toHaveBeenCalledWith('split across chunks')
  })

  it('handles several events arriving in a single chunk', async () => {
    const { cb } = await run((c) => {
      const payload =
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'one' }] },
        }) +
        '\n' +
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'two' }] },
        }) +
        '\n'
      c.stdout.emit('data', Buffer.from(payload))
      c.emit('close', 0)
    })

    expect(cb.onText.mock.calls.map((call) => call[0])).toEqual(['one', 'two'])
  })

  it('skips malformed lines without dropping valid ones that follow', async () => {
    const { cb } = await run((c) => {
      c.stdout.emit('data', Buffer.from('{not valid json\n'))
      emit(c, { type: 'assistant', message: { content: [{ type: 'text', text: 'survived' }] } })
      c.emit('close', 0)
    })

    expect(cb.onText).toHaveBeenCalledWith('survived')
    expect(cb.onComplete).toHaveBeenCalledWith(0)
  })
})

describe('stream parsing: tool activity', () => {
  it('emits tool_start for a tool_use block and picks file_path as the detail', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/tmp/a.ts' } },
          ],
        },
      })
      c.emit('close', 0)
    })

    expect(activitiesOfType(cb, 'tool_start')[0]).toMatchObject({
      tool: 'Read',
      id: 't1',
      input: '/tmp/a.ts',
    })
  })

  it('falls back to command, then pattern, for the tool detail', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'ls -la' } },
            { type: 'tool_use', id: 'g1', name: 'Grep', input: { pattern: 'TODO' } },
          ],
        },
      })
      c.emit('close', 0)
    })

    const starts = activitiesOfType(cb, 'tool_start')
    expect(starts[0]).toMatchObject({ tool: 'Bash', input: 'ls -la' })
    expect(starts[1]).toMatchObject({ tool: 'Grep', input: 'TODO' })
  })

  it('accumulates input_json_delta and emits tool_input on content_block_stop', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'x1', name: 'Write' },
      })
      emit(c, {
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: '{"file_path":' },
      })
      emit(c, {
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: '"/tmp/out.md"}' },
      })
      emit(c, { type: 'content_block_stop' })
      c.emit('close', 0)
    })

    expect(activitiesOfType(cb, 'tool_start')[0]).toMatchObject({ tool: 'Write', id: 'x1' })
    expect(activitiesOfType(cb, 'tool_input')[0]).toMatchObject({
      id: 'x1',
      input: '/tmp/out.md',
    })
  })

  it('emits tool_end from a tool_result, resolving the tool name from its start', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'r1', name: 'Bash' },
      })
      emit(c, {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'command output' }],
        },
      })
      c.emit('close', 0)
    })

    expect(activitiesOfType(cb, 'tool_end')[0]).toMatchObject({
      tool: 'Bash',
      id: 'r1',
      status: 'complete',
      output: 'command output',
    })
  })

  it('marks a failed tool_result as an error', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'r9', content: 'boom', is_error: true }],
        },
      })
      c.emit('close', 0)
    })

    expect(activitiesOfType(cb, 'tool_end')[0]).toMatchObject({ status: 'error', output: 'boom' })
  })

  it('truncates tool output to 200 characters', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'r2', content: 'x'.repeat(500) }],
        },
      })
      c.emit('close', 0)
    })

    expect(activitiesOfType(cb, 'tool_end')[0].output).toHaveLength(200)
  })

  it('reads tool output from array-shaped tool_result content', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'r3',
              content: [{ type: 'text', text: 'from array' }],
            },
          ],
        },
      })
      c.emit('close', 0)
    })

    expect(activitiesOfType(cb, 'tool_end')[0].output).toBe('from array')
  })

  it('maps a result event to all_complete, flagging the error subtype', async () => {
    const ok = await run((c) => {
      emit(c, { type: 'result', subtype: 'success' })
      c.emit('close', 0)
    })
    expect(activitiesOfType(ok.cb, 'all_complete')[0]).toMatchObject({ status: 'complete' })

    const bad = await run((c) => {
      emit(c, { type: 'result', subtype: 'error' })
      c.emit('close', 0)
    })
    expect(activitiesOfType(bad.cb, 'all_complete')[0]).toMatchObject({ status: 'error' })
  })
})

describe('plan detection from tool use', () => {
  // Must clear detectPlanFromTool's 100-character minimum, and carry >= 2
  // headings and >= 4 list items to read as structured.
  const planContent = [
    '# Migration Plan',
    '',
    '## Phase one: extract the parser',
    '- pull the stream loop into its own module',
    '- thread the callbacks through unchanged',
    '',
    '## Phase two: cover it with tests',
    '- script a fake child process',
    '- assert on the emitted activity events',
  ].join('\n')

  it('reports a plan when a Write tool call carries plan-shaped content', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'p1',
              name: 'Write',
              input: { file_path: '/tmp/notes.md', content: planContent },
            },
          ],
        },
      })
      c.emit('close', 0)
    })

    expect(cb.onPlan).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Migration Plan', content: planContent }),
    )
  })

  it('ignores short content even when the file is named like a plan', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'p2',
              name: 'Write',
              input: { file_path: '/tmp/plan.md', content: 'too short' },
            },
          ],
        },
      })
      c.emit('close', 0)
    })

    expect(cb.onPlan).not.toHaveBeenCalled()
  })

  it('ignores tools other than Write and Edit', async () => {
    const { cb } = await run((c) => {
      emit(c, {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'p3',
              name: 'Read',
              input: { file_path: '/tmp/plan.md', content: planContent },
            },
          ],
        },
      })
      c.emit('close', 0)
    })

    expect(cb.onPlan).not.toHaveBeenCalled()
  })

  it('truncates an overlong plan title to 100 characters', async () => {
    const longTitle = 'Implementation ' + 'x'.repeat(200)
    const { cb } = await run((c) => {
      emit(c, {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'p4',
              name: 'Write',
              input: { file_path: '/tmp/p.md', content: `# ${longTitle}\n\n${planContent}` },
            },
          ],
        },
      })
      c.emit('close', 0)
    })

    const plan = cb.onPlan.mock.calls[0][0] as { title: string }
    expect(plan.title).toHaveLength(100)
    expect(plan.title.endsWith('...')).toBe(true)
  })
})

describe('process failures', () => {
  it('forwards stderr to onError', async () => {
    const { cb } = await run((c) => {
      c.stderr.emit('data', Buffer.from('something broke'))
      c.emit('close', 1)
    })

    expect(cb.onError).toHaveBeenCalledWith('something broke')
    expect(cb.onComplete).toHaveBeenCalledWith(1)
  })

  it('reports a spawn error as a failed completion', async () => {
    const { cb } = await run((c) => {
      c.emit('error', new Error('ENOENT'))
    })

    expect(cb.onError).toHaveBeenCalledWith('ENOENT')
    expect(cb.onComplete).toHaveBeenCalledWith(1)
  })

  it('propagates a non-zero exit code', async () => {
    const { cb } = await run((c) => {
      c.emit('close', 3)
    })

    expect(cb.onComplete).toHaveBeenCalledWith(3)
  })

  it('kill() sends SIGTERM to the child', () => {
    nextProcess(() => {})
    const handle = spawnClaude({ prompt: 'hi', callbacks: callbacks() })
    handle.kill()

    const child = spawnMock.mock.results[0].value as FakeChild
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('exposes the child pid on the handle', () => {
    nextProcess(() => {})
    const handle = spawnClaude({ prompt: 'hi', callbacks: callbacks() })
    expect(handle.pid).toBe(4321)
  })
})

describe('image attachments', () => {
  const png = { dataUrl: 'data:image/png;base64,aGVsbG8=', fileName: 'shot.png' }

  it('writes attachments to temp files and removes them once the turn completes', async () => {
    const { cb } = await run(
      (c) => {
        emit(c, { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } })
        c.emit('close', 0)
      },
      { images: [png], rawMode: true },
    )

    expect(writeFileSync).toHaveBeenCalledTimes(1)
    const [tempPath, buffer] = vi.mocked(writeFileSync).mock.calls[0]
    expect(String(tempPath)).toMatch(/wtb-images/)
    expect(String(tempPath)).toMatch(/\.png$/)
    // Payload is the decoded base64, not the data URL.
    expect((buffer as Buffer).toString()).toBe('hello')

    // Cleaned up after completion, using the same path it wrote.
    expect(unlinkSync).toHaveBeenCalledWith(tempPath)
    expect(cb.onComplete).toHaveBeenCalledWith(0)
  })

  it('references the temp image paths in the raw-mode prompt', async () => {
    await run(
      (c) => {
        c.emit('close', 0)
      },
      { images: [png], rawMode: true, prompt: 'what is this' },
    )

    const prompt = spawnMock.mock.calls[0][1][1] as string
    expect(prompt).toContain('Read these image files')
    expect(prompt).toMatch(/wtb-images/)
    expect(prompt).toContain('what is this')
  })

  it('skips attachments whose data URL carries no base64 payload', async () => {
    await run(
      (c) => {
        c.emit('close', 0)
      },
      { images: [{ dataUrl: 'not-a-data-url', fileName: 'bad.png' }], rawMode: true },
    )

    expect(writeFileSync).not.toHaveBeenCalled()
  })
})

describe('CLI availability', () => {
  it('fails fast with an install hint when the Claude CLI is missing', async () => {
    // isClaudeCliAvailable() caches for 60s, so this needs a fresh module
    // registry with execFileSync throwing from the very first call.
    vi.resetModules()
    vi.doMock('child_process', () => ({
      spawn: vi.fn(),
      execFileSync: vi.fn(() => {
        throw new Error('not found')
      }),
    }))

    const { spawnClaude: freshSpawn } = await import('./runner.js')
    const { spawn: freshSpawnProc } = await import('child_process')

    const cb = callbacks()
    const handle = freshSpawn({ prompt: 'hi', callbacks: cb })
    await handle.promise
    // The error path is scheduled on a timer, so let it drain.
    await new Promise((r) => setTimeout(r, 0))

    expect(handle.pid).toBe(0)
    expect(freshSpawnProc).not.toHaveBeenCalled()
    expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining('Claude Code CLI not found'))
    expect(cb.onComplete).toHaveBeenCalledWith(1)

    vi.doUnmock('child_process')
    vi.resetModules()
  })
})
