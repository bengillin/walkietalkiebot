import { getDb } from '../index.js'

export interface JobRow {
  id: string
  conversation_id: string
  prompt: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  source: string
  result: string | null
  error: string | null
  pid: number | null
  created_at: number
  updated_at: number
  started_at: number | null
  completed_at: number | null
}

export interface CreateJobInput {
  id: string
  conversationId: string
  prompt: string
  source?: string
}

export interface UpdateJobInput {
  status?: JobRow['status']
  result?: string
  error?: string
  pid?: number | null
  started_at?: number
  completed_at?: number
}

export interface JobEventRow {
  id: number
  job_id: string
  event_type: string
  data: string | null
  timestamp: number
}

export interface CreateJobEventInput {
  jobId: string
  eventType: string
  data?: string
}

export function createJob(input: CreateJobInput): JobRow {
  const db = getDb()
  const now = Date.now()

  db.prepare(`
    INSERT INTO jobs (id, conversation_id, prompt, status, source, created_at, updated_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?)
  `).run(input.id, input.conversationId, input.prompt, input.source || 'web', now, now)

  return getJob(input.id)!
}

export function getJob(id: string): JobRow | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT id, conversation_id, prompt, status, source, result, error, pid,
           created_at, updated_at, started_at, completed_at
    FROM jobs WHERE id = ?
  `).get(id) as JobRow | undefined
  return row || null
}

export function listJobs(filters?: { status?: string; conversationId?: string }, limit = 50): JobRow[] {
  const db = getDb()
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (filters?.status) {
    conditions.push('status = ?')
    params.push(filters.status)
  }
  if (filters?.conversationId) {
    conditions.push('conversation_id = ?')
    params.push(filters.conversationId)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit)

  return db.prepare(`
    SELECT id, conversation_id, prompt, status, source, result, error, pid,
           created_at, updated_at, started_at, completed_at
    FROM jobs ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params) as JobRow[]
}

export function updateJob(id: string, input: UpdateJobInput): JobRow | null {
  const db = getDb()
  const updates: string[] = ['updated_at = ?']
  const values: (string | number | null)[] = [Date.now()]

  if (input.status !== undefined) {
    updates.push('status = ?')
    values.push(input.status)
  }
  if (input.result !== undefined) {
    updates.push('result = ?')
    values.push(input.result)
  }
  if (input.error !== undefined) {
    updates.push('error = ?')
    values.push(input.error)
  }
  if (input.pid !== undefined) {
    updates.push('pid = ?')
    values.push(input.pid)
  }
  if (input.started_at !== undefined) {
    updates.push('started_at = ?')
    values.push(input.started_at)
  }
  if (input.completed_at !== undefined) {
    updates.push('completed_at = ?')
    values.push(input.completed_at)
  }

  values.push(id)
  db.prepare(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  return getJob(id)
}

export function createJobEvent(input: CreateJobEventInput): JobEventRow {
  const db = getDb()
  const timestamp = Date.now()

  const result = db.prepare(`
    INSERT INTO job_events (job_id, event_type, data, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(input.jobId, input.eventType, input.data || null, timestamp)

  return {
    id: Number(result.lastInsertRowid),
    job_id: input.jobId,
    event_type: input.eventType,
    data: input.data || null,
    timestamp,
  }
}

export function getJobEvents(jobId: string, since?: number): JobEventRow[] {
  const db = getDb()

  if (since) {
    return db.prepare(`
      SELECT id, job_id, event_type, data, timestamp
      FROM job_events
      WHERE job_id = ? AND timestamp > ?
      ORDER BY timestamp ASC
    `).all(jobId, since) as JobEventRow[]
  }

  return db.prepare(`
    SELECT id, job_id, event_type, data, timestamp
    FROM job_events
    WHERE job_id = ?
    ORDER BY timestamp ASC
  `).all(jobId) as JobEventRow[]
}

export function cleanupStaleJobs(): number {
  const db = getDb()
  const result = db.prepare(`
    UPDATE jobs SET status = 'failed', error = 'Server restarted', updated_at = ?, completed_at = ?
    WHERE status IN ('queued', 'running')
  `).run(Date.now(), Date.now())
  return result.changes
}

export function deleteJob(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(id)
  return result.changes > 0
}
