import { spawnClaude, type RunnerHandle, type ActivityEvent } from './runner.js'
import { getNotificationDispatcher } from '../notifications/dispatcher.js'
import * as jobsRepo from '../db/repositories/jobs.js'
import * as messagesRepo from '../db/repositories/messages.js'
import * as conversationsRepo from '../db/repositories/conversations.js'
import type { Notification } from '../notifications/types.js'

type JobEventCallback = (event: JobStreamEvent) => void

export interface JobStreamEvent {
  type: 'text' | 'activity' | 'status_change' | 'error'
  data: string // JSON
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

class JobManager {
  private static readonly MAX_CONCURRENT_JOBS = 3
  private static readonly JOB_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

  private activeHandles: Map<string, RunnerHandle> = new Map()
  private activeTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private subscribers: Map<string, Set<JobEventCallback>> = new Map()

  init(): void {
    const cleaned = jobsRepo.cleanupStaleJobs()
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} stale jobs from previous run`)
    }
  }

  createJob(params: {
    conversationId: string
    prompt: string
    source?: string
    mode?: string
    history?: Array<{ role: string; content: string }>
  }): jobsRepo.JobRow {
    const id = generateId()
    const job = jobsRepo.createJob({
      id,
      conversationId: params.conversationId,
      prompt: params.prompt,
      source: params.source || 'web',
    })

    // Store history and mode in the event log for the runner to use
    if (params.history && params.history.length > 0) {
      jobsRepo.createJobEvent({
        jobId: id,
        eventType: 'context',
        data: JSON.stringify(params.history),
      })
    }
    if (params.mode) {
      jobsRepo.createJobEvent({
        jobId: id,
        eventType: 'mode',
        data: params.mode,
      })
    }

    this.emitEvent(id, {
      type: 'status_change',
      data: JSON.stringify({ status: 'queued', jobId: id }),
    })

    // Try to start processing immediately
    this.processNext()

    return job
  }

  getJob(id: string): jobsRepo.JobRow | null {
    return jobsRepo.getJob(id)
  }

  listJobs(filters?: { status?: string; conversationId?: string }): jobsRepo.JobRow[] {
    return jobsRepo.listJobs(filters)
  }

  getJobEvents(jobId: string, since?: number): jobsRepo.JobEventRow[] {
    return jobsRepo.getJobEvents(jobId, since)
  }

  cancelJob(id: string): boolean {
    const job = jobsRepo.getJob(id)
    if (!job) return false

    if (job.status === 'queued') {
      jobsRepo.updateJob(id, { status: 'cancelled', completed_at: Date.now() })
      this.emitEvent(id, {
        type: 'status_change',
        data: JSON.stringify({ status: 'cancelled' }),
      })
      return true
    }

    if (job.status === 'running') {
      const handle = this.activeHandles.get(id)
      if (handle) {
        handle.kill()
        this.activeHandles.delete(id)
        const timeout = this.activeTimeouts.get(id)
        if (timeout) { clearTimeout(timeout); this.activeTimeouts.delete(id) }
      }
      jobsRepo.updateJob(id, { status: 'cancelled', completed_at: Date.now() })
      this.emitEvent(id, {
        type: 'status_change',
        data: JSON.stringify({ status: 'cancelled' }),
      })
      this.processNext()
      return true
    }

    return false
  }

  subscribe(jobId: string, callback: JobEventCallback): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set())
    }
    this.subscribers.get(jobId)!.add(callback)

    return () => {
      const subs = this.subscribers.get(jobId)
      if (subs) {
        subs.delete(callback)
        if (subs.size === 0) {
          this.subscribers.delete(jobId)
        }
      }
    }
  }

  private emitEvent(jobId: string, event: JobStreamEvent): void {
    const subs = this.subscribers.get(jobId)
    if (subs) {
      for (const callback of subs) {
        try {
          callback(event)
        } catch (e) {
          console.error('Job event subscriber error:', e)
        }
      }
    }
  }

  private processNext(): void {
    if (this.activeHandles.size >= JobManager.MAX_CONCURRENT_JOBS) return

    const queued = jobsRepo.listJobs({ status: 'queued' })
    if (queued.length === 0) return

    queued.sort((a, b) => a.created_at - b.created_at)
    const capacity = JobManager.MAX_CONCURRENT_JOBS - this.activeHandles.size
    const toStart = queued.slice(0, capacity)

    for (const job of toStart) {
      this.runJob(job)
    }
  }

  private async runJob(job: jobsRepo.JobRow): Promise<void> {
    const jobId = job.id

    // Mark as running
    jobsRepo.updateJob(jobId, { status: 'running', started_at: Date.now() })
    this.emitEvent(jobId, {
      type: 'status_change',
      data: JSON.stringify({ status: 'running' }),
    })

    // Retrieve history and mode from context events
    let history: Array<{ role: string; content: string }> = []
    let mode: string | undefined
    const events = jobsRepo.getJobEvents(jobId)
    const contextEvent = events.find(e => e.event_type === 'context')
    if (contextEvent?.data) {
      try { history = JSON.parse(contextEvent.data) } catch { /* ignore */ }
    }
    const modeEvent = events.find(e => e.event_type === 'mode')
    if (modeEvent?.data) {
      mode = modeEvent.data
    }

    let fullResponse = ''

    const handle = spawnClaude({
      prompt: job.prompt,
      history,
      mode,
      callbacks: {
        onText: (text) => {
          fullResponse += text
          jobsRepo.createJobEvent({ jobId, eventType: 'text', data: text })
          this.emitEvent(jobId, { type: 'text', data: JSON.stringify({ text }) })
        },
        onActivity: (event: ActivityEvent) => {
          jobsRepo.createJobEvent({ jobId, eventType: event.type, data: JSON.stringify(event) })
          this.emitEvent(jobId, { type: 'activity', data: JSON.stringify(event) })
        },
        onError: (error) => {
          jobsRepo.createJobEvent({ jobId, eventType: 'error', data: error })
          this.emitEvent(jobId, { type: 'error', data: JSON.stringify({ error }) })
        },
        onComplete: (code) => {
          const currentJob = jobsRepo.getJob(jobId)
          if (currentJob?.status === 'cancelled') return

          const now = Date.now()
          const status = code === 0 ? 'completed' : 'failed'
          const error = code !== 0 ? `Process exited with code ${code}` : undefined

          jobsRepo.updateJob(jobId, {
            status: status as 'completed' | 'failed',
            result: fullResponse || null,
            error: error || undefined,
            completed_at: now,
          })

          if (fullResponse.trim()) {
            try {
              messagesRepo.createMessage({
                id: generateId(),
                conversationId: job.conversation_id,
                role: 'assistant',
                content: fullResponse,
                source: 'job',
              })
              conversationsRepo.touchConversation(job.conversation_id)
            } catch (e) {
              console.error('Failed to save job response as message:', e)
            }
          }

          this.emitEvent(jobId, {
            type: 'status_change',
            data: JSON.stringify({ status, result: fullResponse, error }),
          })

          const dispatcher = getNotificationDispatcher()
          const notification: Notification = status === 'completed'
            ? { type: 'job_completed', jobId, title: 'Talkie: Task complete', body: fullResponse.slice(0, 80) || 'Done.' }
            : { type: 'job_failed', jobId, title: 'Talkie: Task failed', body: error || 'Unknown error' }
          dispatcher.dispatch(notification).catch(e => console.error('Notification dispatch failed:', e))

          // Clean up and process next queued jobs
          this.activeHandles.delete(jobId)
          const timeout = this.activeTimeouts.get(jobId)
          if (timeout) { clearTimeout(timeout); this.activeTimeouts.delete(jobId) }
          this.processNext()
        },
      },
    })

    this.activeHandles.set(jobId, handle)
    jobsRepo.updateJob(jobId, { pid: handle.pid })

    // Set a timeout to kill hung jobs
    const timeout = setTimeout(() => {
      const currentJob = jobsRepo.getJob(jobId)
      if (currentJob?.status === 'running') {
        console.warn(`Job ${jobId} timed out after ${JobManager.JOB_TIMEOUT_MS / 1000}s, killing`)
        handle.kill()
        jobsRepo.updateJob(jobId, {
          status: 'failed',
          error: `Timed out after ${JobManager.JOB_TIMEOUT_MS / 60000} minutes`,
          completed_at: Date.now(),
        })
        this.emitEvent(jobId, {
          type: 'status_change',
          data: JSON.stringify({ status: 'failed', error: 'Job timed out' }),
        })
        this.activeHandles.delete(jobId)
        this.activeTimeouts.delete(jobId)
        this.processNext()
      }
    }, JobManager.JOB_TIMEOUT_MS)
    this.activeTimeouts.set(jobId, timeout)

    // Clear timeout when job completes naturally
    handle.promise.then(() => {
      const t = this.activeTimeouts.get(jobId)
      if (t) { clearTimeout(t); this.activeTimeouts.delete(jobId) }
    })
  }
}

// Singleton
let manager: JobManager | null = null

export function getJobManager(): JobManager {
  if (!manager) {
    manager = new JobManager()
  }
  return manager
}
