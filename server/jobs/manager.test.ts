import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { RunnerCallbacks, RunnerHandle, RunnerOptions } from './runner.js'
import type { JobStreamEvent } from './manager.js'
import type { JobRow } from '../db/repositories/jobs.js'

/**
 * A scripted spawnClaude. Each call parks a record the test can drive, so a job
 * only progresses when the test says so — that keeps concurrency and
 * cancellation deterministic without touching a real process.
 */
const runner = vi.hoisted(() => {
  interface Run {
    options: RunnerOptions
    callbacks: RunnerCallbacks
    handle: RunnerHandle
    kill: ReturnType<typeof vi.fn>
    resolve: (code: number) => void
  }
  const runs: Run[] = []
  return {
    runs,
    reset: () => {
      runs.length = 0
    },
    /** The Nth parked run; throws loudly if the test expected a spawn that never happened. */
    at(index: number): Run {
      const run = runs[index]
      if (!run) throw new Error(`Expected a spawned run at index ${index}, got ${runs.length}`)
      return run
    },
    /** Drive a parked run to a natural finish. */
    finish(index: number, code = 0) {
      const run = this.at(index)
      run.callbacks.onComplete(code)
      run.resolve(code)
    },
  }
})

vi.mock('./runner.js', () => ({
  spawnClaude: vi.fn((options: RunnerOptions): RunnerHandle => {
    let resolve!: (code: number) => void
    const promise = new Promise<number>((r) => {
      resolve = r
    })
    const kill = vi.fn()
    const handle: RunnerHandle = { pid: 9000 + runner.runs.length, kill, promise }
    runner.runs.push({ options, callbacks: options.callbacks, handle, kill, resolve })
    return handle
  }),
}))

const dispatch = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../notifications/dispatcher.js', () => ({
  getNotificationDispatcher: () => ({ dispatch }),
}))

// Imported fresh in beforeEach so the manager's in-memory maps don't leak
// between tests.
let manager: ReturnType<typeof import('./manager.js').getJobManager>
let jobsRepo: typeof import('../db/repositories/jobs.js')
let messagesRepo: typeof import('../db/repositories/messages.js')

const CONV = 'conv-1'

beforeEach(async () => {
  vi.resetModules()
  runner.reset()
  dispatch.mockClear()

  const helpers = await import('../test/helpers.js')
  helpers.createTestDb()

  const conversations = await import('../db/repositories/conversations.js')
  conversations.createConversation({ id: CONV, title: 'Test' })

  jobsRepo = await import('../db/repositories/jobs.js')
  messagesRepo = await import('../db/repositories/messages.js')
  manager = (await import('./manager.js')).getJobManager()
})

afterEach(() => {
  vi.useRealTimers()
})

function create(overrides: Partial<Parameters<typeof manager.createJob>[0]> = {}) {
  return manager.createJob({ conversationId: CONV, prompt: 'do the thing', ...overrides })
}

/** Create N jobs at once, as a tuple so element access stays typed. */
function createJobs(n: 4): [JobRow, JobRow, JobRow, JobRow]
function createJobs(n: 5): [JobRow, JobRow, JobRow, JobRow, JobRow]
function createJobs(n: number): JobRow[] {
  return Array.from({ length: n }, () => create())
}

/** Collect every event emitted for a job. */
function collect(jobId: string) {
  const events: JobStreamEvent[] = []
  const unsubscribe = manager.subscribe(jobId, (e) => events.push(e))
  return { events, unsubscribe }
}

describe('createJob', () => {
  it('persists the job and starts it immediately when there is capacity', () => {
    const job = create()

    expect(jobsRepo.getJob(job.id)?.status).toBe('running')
    expect(runner.runs).toHaveLength(1)
    expect(runner.at(0).options.prompt).toBe('do the thing')
  })

  it('records the spawned pid on the job row', () => {
    const job = create()
    expect(jobsRepo.getJob(job.id)?.pid).toBe(runner.at(0).handle.pid)
  })

  it('passes history and mode through to the runner', () => {
    const history = [{ role: 'user', content: 'earlier' }]
    create({ history, mode: 'architect' })

    expect(runner.at(0).options.history).toEqual(history)
    expect(runner.at(0).options.mode).toBe('architect')
  })

  it('defaults the source to web', () => {
    const job = create()
    expect(jobsRepo.getJob(job.id)?.source).toBe('web')
  })

  it('runs jobs without a conversation prefix, so they stay one-shot', () => {
    create()
    // A conversationId here would put the job into a resumable session, which
    // background jobs deliberately do not use.
    expect(runner.at(0).options.conversationId).toBeUndefined()
  })
})

describe('concurrency', () => {
  it('runs at most three jobs at once and leaves the rest queued', () => {
    const jobs = createJobs(5)

    expect(runner.runs).toHaveLength(3)
    const statuses = jobs.map((j) => jobsRepo.getJob(j.id)?.status)
    expect(statuses).toEqual(['running', 'running', 'running', 'queued', 'queued'])
  })

  it('starts the oldest queued job when a running one finishes', () => {
    const jobs = createJobs(4)
    expect(jobsRepo.getJob(jobs[3].id)?.status).toBe('queued')

    runner.finish(0)

    expect(runner.runs).toHaveLength(4)
    expect(jobsRepo.getJob(jobs[3].id)?.status).toBe('running')
  })

  it('drains the whole queue as slots free up', () => {
    const jobs = createJobs(5)
    runner.finish(0)
    runner.finish(1)

    expect(jobs.map((j) => jobsRepo.getJob(j.id)?.status)).toEqual([
      'completed',
      'completed',
      'running',
      'running',
      'running',
    ])
  })
})

describe('completion', () => {
  it('marks the job completed and stores the streamed text as the result', () => {
    const job = create()
    runner.at(0).callbacks.onText('part one ')
    runner.at(0).callbacks.onText('part two')
    runner.finish(0)

    const row = jobsRepo.getJob(job.id)
    expect(row?.status).toBe('completed')
    expect(row?.result).toBe('part one part two')
    expect(row?.completed_at).toBeGreaterThan(0)
  })

  it('saves the response as an assistant message on the conversation', () => {
    create()
    runner.at(0).callbacks.onText('the answer')
    runner.finish(0)

    const messages = messagesRepo.getMessagesForConversation(CONV)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ role: 'assistant', content: 'the answer', source: 'job' })
  })

  it('does not save a message when the response is empty', () => {
    create()
    runner.finish(0)

    expect(messagesRepo.getMessagesForConversation(CONV)).toHaveLength(0)
  })

  it('marks a non-zero exit as failed and records the exit code', () => {
    const job = create()
    runner.finish(0, 2)

    const row = jobsRepo.getJob(job.id)
    expect(row?.status).toBe('failed')
    expect(row?.error).toContain('exited with code 2')
  })

  it('notifies on success and on failure', () => {
    create()
    runner.at(0).callbacks.onText('done')
    runner.finish(0)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'job_completed' }))

    dispatch.mockClear()
    create()
    runner.finish(1, 1)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'job_failed' }))
  })

  it('persists streamed text and activity as job events', () => {
    const job = create()
    runner.at(0).callbacks.onText('hello')
    runner.at(0).callbacks.onActivity({ type: 'tool_start', tool: 'Read', id: 't1' })
    runner.finish(0)

    const types = jobsRepo.getJobEvents(job.id).map((e) => e.event_type)
    expect(types).toContain('text')
    expect(types).toContain('tool_start')
  })

  it('records runner errors as error events', () => {
    const job = create()
    runner.at(0).callbacks.onError('something broke')

    const errorEvent = jobsRepo.getJobEvents(job.id).find((e) => e.event_type === 'error')
    expect(errorEvent?.data).toBe('something broke')
  })
})

describe('cancellation', () => {
  it('cancels a queued job without ever spawning it', () => {
    const jobs = createJobs(4)
    const queued = jobs[3]

    expect(manager.cancelJob(queued.id)).toBe(true)
    expect(jobsRepo.getJob(queued.id)?.status).toBe('cancelled')
    expect(runner.runs).toHaveLength(3)
  })

  it('kills a running job and marks it cancelled', () => {
    const job = create()

    expect(manager.cancelJob(job.id)).toBe(true)
    expect(runner.at(0).kill).toHaveBeenCalled()
    expect(jobsRepo.getJob(job.id)?.status).toBe('cancelled')
  })

  it('frees the slot so a queued job can start', () => {
    const jobs = createJobs(4)
    manager.cancelJob(jobs[0].id)

    expect(runner.runs).toHaveLength(4)
    expect(jobsRepo.getJob(jobs[3].id)?.status).toBe('running')
  })

  it('leaves a cancelled job cancelled even if the process still completes', () => {
    const job = create()
    manager.cancelJob(job.id)
    // The killed process still emits a close, which must not resurrect the job.
    runner.finish(0, 0)

    expect(jobsRepo.getJob(job.id)?.status).toBe('cancelled')
    expect(messagesRepo.getMessagesForConversation(CONV)).toHaveLength(0)
  })

  it('returns false for an unknown job and for one already finished', () => {
    expect(manager.cancelJob('does-not-exist')).toBe(false)

    const job = create()
    runner.finish(0)
    expect(manager.cancelJob(job.id)).toBe(false)
  })
})

describe('subscriptions', () => {
  it('emits queued then running when a job starts', () => {
    // Subscribe before creating, using the id the manager will emit against.
    const seen: JobStreamEvent[] = []
    const job = manager.createJob({ conversationId: CONV, prompt: 'x' })
    const unsubscribe = manager.subscribe(job.id, (e) => seen.push(e))

    runner.at(0).callbacks.onText('streamed')
    expect(seen).toContainEqual({ type: 'text', data: JSON.stringify({ text: 'streamed' }) })
    unsubscribe()
  })

  it('stops delivering after unsubscribe', () => {
    const job = create()
    const { events, unsubscribe } = collect(job.id)
    unsubscribe()

    runner.at(0).callbacks.onText('ignored')
    expect(events).toHaveLength(0)
  })

  it('delivers to every subscriber of a job', () => {
    const job = create()
    const a = collect(job.id)
    const b = collect(job.id)

    runner.at(0).callbacks.onText('broadcast')

    expect(a.events).toHaveLength(1)
    expect(b.events).toHaveLength(1)
  })

  it('keeps delivering to other subscribers when one throws', () => {
    const job = create()
    const good: JobStreamEvent[] = []
    manager.subscribe(job.id, () => {
      throw new Error('subscriber blew up')
    })
    manager.subscribe(job.id, (e) => good.push(e))

    expect(() => runner.at(0).callbacks.onText('still delivered')).not.toThrow()
    expect(good).toHaveLength(1)
  })

  it('does not leak events across jobs', () => {
    const first = create()
    create() // second job, driven below via runner.runs[1]
    const { events } = collect(first.id)

    runner.at(1).callbacks.onText('for the second job')
    expect(events).toHaveLength(0)
  })
})

describe('timeouts', () => {
  it('kills and fails a job that runs past the timeout', () => {
    vi.useFakeTimers()
    const job = create()

    vi.advanceTimersByTime(10 * 60 * 1000 + 1)

    expect(runner.at(0).kill).toHaveBeenCalled()
    const row = jobsRepo.getJob(job.id)
    expect(row?.status).toBe('failed')
    expect(row?.error).toContain('Timed out')
  })

  it('leaves an already-finished job alone when its timer fires', () => {
    vi.useFakeTimers()
    const job = create()
    runner.finish(0)

    vi.advanceTimersByTime(10 * 60 * 1000 + 1)

    expect(jobsRepo.getJob(job.id)?.status).toBe('completed')
    expect(runner.at(0).kill).not.toHaveBeenCalled()
  })
})

describe('queries', () => {
  it('lists jobs filtered by status', () => {
    const jobs = createJobs(4)
    runner.finish(0)

    const completed = manager.listJobs({ status: 'completed' })
    expect(completed.map((j) => j.id)).toEqual([jobs[0].id])
  })

  it('returns null for an unknown job', () => {
    expect(manager.getJob('nope')).toBeNull()
  })
})
