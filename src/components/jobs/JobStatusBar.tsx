import { useEffect, useState } from 'react'
import { useJobStore } from '../../lib/jobStore'
import { JobDetailPanel } from './JobDetailPanel'
import './JobStatusBar.css'

export function JobStatusBar() {
  const { jobs, refreshJobs } = useJobStore()
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  // Poll for job updates
  useEffect(() => {
    refreshJobs()
    const interval = setInterval(refreshJobs, 3000)
    return () => clearInterval(interval)
  }, [refreshJobs])

  const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'queued')
  const recentCompleted = jobs.filter(j =>
    ['completed', 'failed'].includes(j.status) &&
    j.completed_at && Date.now() - j.completed_at < 30000
  )

  // Don't render if nothing to show
  if (activeJobs.length === 0 && recentCompleted.length === 0) {
    return null
  }

  return (
    <>
      <div className="job-status-bar">
        {activeJobs.map(job => (
          <div
            key={job.id}
            className={`job-status-bar__item job-status-bar__item--${job.status}`}
            onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
          >
            <span className="job-status-bar__spinner" />
            <span className="job-status-bar__prompt">
              {job.prompt.length > 50 ? job.prompt.slice(0, 50) + '...' : job.prompt}
            </span>
            {job.started_at && (
              <span className="job-status-bar__time">
                <ElapsedTime since={job.started_at} />
              </span>
            )}
            {job.status === 'queued' && (
              <span className="job-status-bar__badge">queued</span>
            )}
          </div>
        ))}
        {recentCompleted.map(job => (
          <div
            key={job.id}
            className={`job-status-bar__item job-status-bar__item--${job.status}`}
            onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
          >
            <span className={`job-status-bar__icon job-status-bar__icon--${job.status}`}>
              {job.status === 'completed' ? '\u2713' : '\u2717'}
            </span>
            <span className="job-status-bar__prompt">
              {job.status === 'completed'
                ? (job.result?.slice(0, 60) || 'Done') + (job.result && job.result.length > 60 ? '...' : '')
                : job.error || 'Failed'
              }
            </span>
          </div>
        ))}
      </div>

      {expandedJobId && (
        <JobDetailPanel
          jobId={expandedJobId}
          onClose={() => setExpandedJobId(null)}
        />
      )}
    </>
  )
}

function ElapsedTime({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - since) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [since])

  if (elapsed < 60) return <>{elapsed}s</>
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return <>{mins}m {secs}s</>
}
