import { useEffect, useState } from 'react'
import { useJobStore } from '../../lib/jobStore'
import * as api from '../../lib/api'
import { getToolIcon, getToolCategoryClass } from '../../lib/toolConfig'
import './JobDetailPanel.css'

interface JobDetailPanelProps {
  jobId: string
  onClose: () => void
}

interface JobEvent {
  type: string
  data: string | null
  timestamp: number
}

export function JobDetailPanel({ jobId, onClose }: JobDetailPanelProps) {
  const { jobs, cancelJob } = useJobStore()
  const job = jobs.find(j => j.id === jobId)
  const [events, setEvents] = useState<JobEvent[]>([])

  useEffect(() => {
    // Subscribe to live events
    const unsub = api.subscribeToJobEvents(
      jobId,
      (event) => {
        setEvents(prev => [...prev, {
          type: event.type,
          data: event.data,
          timestamp: Date.now(),
        }])
      },
      () => {
        // Stream ended
      }
    )

    return unsub
  }, [jobId])

  if (!job) {
    return (
      <div className="job-detail-panel">
        <div className="job-detail-panel__header">
          <span>Job not found</span>
          <button onClick={onClose} className="job-detail-panel__close">&times;</button>
        </div>
      </div>
    )
  }

  const isActive = job.status === 'running' || job.status === 'queued'
  const duration = job.started_at
    ? ((job.completed_at || Date.now()) - job.started_at) / 1000
    : 0

  return (
    <div className="job-detail-panel">
      <div className="job-detail-panel__header">
        <div className="job-detail-panel__title">
          <span className={`job-detail-panel__status job-detail-panel__status--${job.status}`}>
            {job.status}
          </span>
          <span className="job-detail-panel__prompt">{job.prompt}</span>
        </div>
        <button onClick={onClose} className="job-detail-panel__close">&times;</button>
      </div>

      <div className="job-detail-panel__meta">
        <span>Source: {job.source}</span>
        {duration > 0 && <span>Duration: {Math.round(duration)}s</span>}
        {isActive && (
          <button
            className="job-detail-panel__cancel"
            onClick={() => cancelJob(job.id)}
          >
            Cancel
          </button>
        )}
      </div>

      <div className="job-detail-panel__events">
        {events.length === 0 && isActive && (
          <div className="job-detail-panel__empty">Waiting for events...</div>
        )}
        {events.map((event, i) => (
          <EventItem key={i} event={event} />
        ))}
      </div>

      {job.result && (
        <div className="job-detail-panel__result">
          <div className="job-detail-panel__result-label">Result</div>
          <div className="job-detail-panel__result-text">{job.result}</div>
        </div>
      )}

      {job.error && (
        <div className="job-detail-panel__error">
          {job.error}
        </div>
      )}
    </div>
  )
}

function EventItem({ event }: { event: JobEvent }) {
  if (event.type === 'activity') {
    try {
      const activity = JSON.parse(event.data || '{}')
      const icon = getToolIcon(activity.tool)
      return (
        <div className={`job-detail-panel__event job-detail-panel__event--activity ${getToolCategoryClass(activity.tool || activity.type || '')}`}>
          <span className="job-detail-panel__event-icon">{icon}</span>
          <span className="job-detail-panel__event-tool">{activity.tool || activity.type}</span>
          {activity.input && (
            <span className="job-detail-panel__event-input">{activity.input}</span>
          )}
          {activity.status && (
            <span className={`job-detail-panel__event-status job-detail-panel__event-status--${activity.status}`}>
              {activity.status === 'complete' ? '\u2713' : activity.status === 'error' ? '\u2717' : ''}
            </span>
          )}
        </div>
      )
    } catch {
      return null
    }
  }

  if (event.type === 'text') {
    try {
      const { text } = JSON.parse(event.data || '{}')
      return (
        <div className="job-detail-panel__event job-detail-panel__event--text">
          {text}
        </div>
      )
    } catch {
      return null
    }
  }

  if (event.type === 'error') {
    return (
      <div className="job-detail-panel__event job-detail-panel__event--error">
        {event.data}
      </div>
    )
  }

  return null
}

// getToolIcon imported from lib/toolConfig
