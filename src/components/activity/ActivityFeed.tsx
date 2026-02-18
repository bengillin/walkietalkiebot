import { useState, useEffect } from 'react'
import type { Activity } from '../../types'
import { getToolIcon, getToolLabel, getToolCategoryClass } from '../../lib/toolConfig'
import './ActivityFeed.css'

interface ActivityFeedProps {
  activities: Activity[]
  isVisible: boolean
}

function formatInput(_tool: string, input?: string): string {
  if (!input) return ''

  // Input is now a plain string (file path, command, or pattern)
  // Try to parse as JSON first (for backwards compatibility)
  try {
    const parsed = JSON.parse(input)
    if (parsed.file_path) {
      return parsed.file_path.split('/').pop() || parsed.file_path
    }
    if (parsed.command) {
      return parsed.command.length > 40 ? parsed.command.slice(0, 40) + '...' : parsed.command
    }
    if (parsed.pattern) {
      return parsed.pattern
    }
  } catch {
    // Not JSON, treat as plain string
  }

  // For file paths, show just the filename
  if (input.includes('/')) {
    const parts = input.split('/')
    const filename = parts.pop() || input
    // Show parent dir too if it fits
    if (parts.length > 0) {
      const parent = parts.pop()
      const short = `${parent}/${filename}`
      if (short.length <= 40) return short
    }
    return filename.length > 40 ? filename.slice(0, 40) + '...' : filename
  }

  return input.length > 40 ? input.slice(0, 40) + '...' : input
}

export function ActivityFeed({ activities, isVisible }: ActivityFeedProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [shouldShow, setShouldShow] = useState(false)

  // Check if any activities are still running
  const hasRunning = activities.some((a) => a.status === 'running')

  // Auto-hide after activities complete
  useEffect(() => {
    if (isVisible && activities.length > 0) {
      setShouldShow(true)
    }

    if (!hasRunning && activities.length > 0) {
      // Hide after 5 seconds when all complete
      const timer = setTimeout(() => {
        setShouldShow(false)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [isVisible, hasRunning, activities.length])

  if (!shouldShow || activities.length === 0) {
    return null
  }

  // Show last 5 by default, or all if expanded
  const displayActivities = isExpanded ? activities : activities.slice(-5)
  const hasMore = activities.length > 5

  return (
    <div className={`activity-feed ${hasRunning ? '' : 'activity-feed--fading'}`}>
      <div className="activity-feed__header">
        <span className="activity-feed__title">Activity</span>
        <span className="activity-feed__count">{activities.length} actions</span>
        {hasMore && (
          <button
            className="activity-feed__toggle"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Show less' : 'Show all'}
          </button>
        )}
      </div>
      <div className="activity-feed__list">
        {displayActivities.map((activity) => (
          <div
            key={activity.id}
            className={`activity-feed__item activity-feed__item--${activity.status || 'running'} ${getToolCategoryClass(activity.tool || '')}`}
          >
            <span className="activity-feed__icon">
              {getToolIcon(activity.tool || '')}
            </span>
            <span className="activity-feed__label">
              {getToolLabel(activity.tool || '')}
              {activity.input && (
                <span className="activity-feed__detail">
                  {formatInput(activity.tool || '', activity.input)}
                </span>
              )}
            </span>
            {activity.status === 'running' && (
              <span className="activity-feed__spinner" />
            )}
            {activity.status === 'complete' && (
              <span className="activity-feed__check">✓</span>
            )}
            {activity.status === 'error' && (
              <span className="activity-feed__error">✗</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
