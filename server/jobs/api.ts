import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getJobManager } from './manager.js'

export const jobRoutes = new Hono()

// POST /api/jobs - Create a new background job
jobRoutes.post('/', async (c) => {
  const { conversationId, prompt, source, history } = await c.req.json()
  if (!conversationId || !prompt) {
    return c.json({ error: 'conversationId and prompt are required' }, 400)
  }

  const manager = getJobManager()
  const job = manager.createJob({ conversationId, prompt, source, history })

  return c.json({ id: job.id, status: job.status })
})

// GET /api/jobs - List jobs
jobRoutes.get('/', (c) => {
  const status = c.req.query('status')
  const conversationId = c.req.query('conversationId')
  const manager = getJobManager()

  const filters: { status?: string; conversationId?: string } = {}
  if (status) filters.status = status
  if (conversationId) filters.conversationId = conversationId

  const jobs = manager.listJobs(filters)
  return c.json({ jobs })
})

// GET /api/jobs/:id - Get job detail
jobRoutes.get('/:id', (c) => {
  const id = c.req.param('id')
  const manager = getJobManager()
  const job = manager.getJob(id)

  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  return c.json(job)
})

// GET /api/jobs/:id/events - SSE stream of job events
jobRoutes.get('/:id/events', async (c) => {
  const id = c.req.param('id')
  const manager = getJobManager()
  const job = manager.getJob(id)

  if (!job) {
    return c.json({ error: 'Job not found' }, 404)
  }

  return streamSSE(c, async (stream) => {
    // Send existing events first
    const existingEvents = manager.getJobEvents(id)
    for (const event of existingEvents) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: event.event_type,
          data: event.data,
          timestamp: event.timestamp,
        }),
      })
    }

    // If job is already terminal, close the stream
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      await stream.writeSSE({ data: JSON.stringify({ done: true, status: job.status }) })
      return
    }

    // Subscribe to live events
    let closed = false
    const unsubscribe = manager.subscribe(id, (event) => {
      if (closed) return
      stream.writeSSE({
        data: JSON.stringify(event),
      }).catch(() => {
        closed = true
        unsubscribe()
      })

      // Close stream on terminal status
      if (event.type === 'status_change') {
        try {
          const data = JSON.parse(event.data)
          if (['completed', 'failed', 'cancelled'].includes(data.status)) {
            stream.writeSSE({ data: JSON.stringify({ done: true, status: data.status }) })
              .catch(() => {})
            closed = true
            unsubscribe()
          }
        } catch {
          // Ignore
        }
      }
    })

    // Keep stream open until closed
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (closed) {
          clearInterval(check)
          resolve()
        }
      }, 500)

      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(check)
        closed = true
        unsubscribe()
        resolve()
      }, 600000)
    })
  })
})

// DELETE /api/jobs/:id - Cancel a job
jobRoutes.delete('/:id', (c) => {
  const id = c.req.param('id')
  const manager = getJobManager()

  const cancelled = manager.cancelJob(id)
  if (!cancelled) {
    const job = manager.getJob(id)
    if (!job) {
      return c.json({ error: 'Job not found' }, 404)
    }
    return c.json({ error: `Cannot cancel job with status: ${job.status}` }, 400)
  }

  return c.json({ success: true })
})
