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
  private currentHandle: RunnerHandle | null = null
  private currentJobId: string | null = null
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
    history?: Array<{ role: string; content: string }>
  }): jobsRepo.JobRow {
    const id = generateId()
    const job = jobsRepo.createJob({
      id,
      conversationId: params.conversationId,
      prompt: params.prompt,
      source: params.source || 'web',
    })

    // Store history in the event log for the runner to use
    if (params.history && params.history.length > 0) {
      jobsRepo.createJobEvent({
        jobId: id,
        eventType: 'context',
        data: JSON.stringify(params.history),
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

    if (job.status === 'running' && this.currentJobId === id && this.currentHandle) {
      this.currentHandle.kill()
      jobsRepo.updateJob(id, { status: 'cancelled', completed_at: Date.now() })
      this.emitEvent(id, {
        type: 'status_change',
        data: JSON.stringify({ status: 'cancelled' }),
      })
      this.currentHandle = null
      this.currentJobId = null
      // Process next queued job
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
    // Don't start a new job if one is already running
    if (this.currentHandle) return

    // Find the oldest queued job
    const queued = jobsRepo.listJobs({ status: 'queued' })
    if (queued.length === 0) return

    // Sort by created_at ascending (oldest first)
    queued.sort((a, b) => a.created_at - b.created_at)
    const job = queued[0]

    this.runJob(job)
  }

  private async runJob(job: jobsRepo.JobRow): Promise<void> {
    const jobId = job.id
    this.currentJobId = jobId

    // Mark as running
    jobsRepo.updateJob(jobId, { status: 'running', started_at: Date.now() })
    this.emitEvent(jobId, {
      type: 'status_change',
      data: JSON.stringify({ status: 'running' }),
    })

    // Retrieve history from context event if available
    let history: Array<{ role: string; content: string }> = []
    const events = jobsRepo.getJobEvents(jobId)
    const contextEvent = events.find(e => e.event_type === 'context')
    if (contextEvent?.data) {
      try {
        history = JSON.parse(contextEvent.data)
      } catch {
        // Ignore
      }
    }

    let fullResponse = ''

    const handle = spawnClaude({
      prompt: job.prompt,
      history,
      callbacks: {
        onText: (text) => {
          fullResponse += text
          jobsRepo.createJobEvent({
            jobId,
            eventType: 'text',
            data: text,
          })
          this.emitEvent(jobId, {
            type: 'text',
            data: JSON.stringify({ text }),
          })
        },
        onActivity: (event: ActivityEvent) => {
          jobsRepo.createJobEvent({
            jobId,
            eventType: event.type,
            data: JSON.stringify(event),
          })
          this.emitEvent(jobId, {
            type: 'activity',
            data: JSON.stringify(event),
          })
        },
        onError: (error) => {
          jobsRepo.createJobEvent({
            jobId,
            eventType: 'error',
            data: error,
          })
          this.emitEvent(jobId, {
            type: 'error',
            data: JSON.stringify({ error }),
          })
        },
        onComplete: (code) => {
          // If already cancelled, don't overwrite the status
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

          // Save the assistant response as a message in the conversation
          if (fullResponse.trim()) {
            try {
              const msgId = generateId()
              messagesRepo.createMessage({
                id: msgId,
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

          // Fire notification
          const dispatcher = getNotificationDispatcher()
          const notification: Notification = status === 'completed'
            ? {
                type: 'job_completed',
                jobId,
                title: 'TalkBoy: Task complete',
                body: fullResponse.slice(0, 80) || 'Done.',
              }
            : {
                type: 'job_failed',
                jobId,
                title: 'TalkBoy: Task failed',
                body: error || 'Unknown error',
              }
          dispatcher.dispatch(notification).catch(e => {
            console.error('Notification dispatch failed:', e)
          })

          // Clean up and process next
          this.currentHandle = null
          this.currentJobId = null
          this.processNext()
        },
      },
    })

    this.currentHandle = handle
    jobsRepo.updateJob(jobId, { pid: handle.pid })
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
