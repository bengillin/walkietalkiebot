import { useEffect, useRef, useState } from 'react'
import { Message, Activity, AvatarState } from '../../types'
import { AvatarSmall } from '../avatar/Avatar'
import './ChatTimeline.css'

// Timeline item types - unified view of all events
type TimelineItem =
  | { type: 'message'; data: Message; timestamp: number }
  | { type: 'activity'; data: Activity; timestamp: number }
  | { type: 'thinking'; timestamp: number }
  | { type: 'streaming'; text: string; timestamp: number }

interface ChatTimelineProps {
  messages: Message[]
  activities: Activity[]
  avatarState: AvatarState
  streamingText: string
  onImageClick?: (image: { dataUrl: string; description?: string; fileName: string }) => void
}

// Merge messages and activities into a single timeline
function buildTimeline(
  messages: Message[],
  activities: Activity[],
  avatarState: AvatarState,
  streamingText: string
): TimelineItem[] {
  const items: TimelineItem[] = []

  // Add all messages
  for (const msg of messages) {
    items.push({ type: 'message', data: msg, timestamp: msg.timestamp })
  }

  // Add activities (only show tool_start, skip tool_end as we update the start)
  for (const activity of activities) {
    if (activity.type === 'tool_start' || activity.type === 'thinking') {
      items.push({ type: 'activity', data: activity, timestamp: activity.timestamp })
    }
  }

  // Sort by timestamp
  items.sort((a, b) => a.timestamp - b.timestamp)

  // Add thinking indicator if currently thinking (and no streaming yet)
  if (avatarState === 'thinking' && !streamingText && activities.length === 0) {
    items.push({ type: 'thinking', timestamp: Date.now() })
  }

  // Add streaming text if present
  if (streamingText) {
    items.push({ type: 'streaming', text: streamingText, timestamp: Date.now() })
  }

  return items
}

// Typing indicator component (3 dots)
function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
  )
}

// Tool activity badge component
function ToolBadge({ activity }: { activity: Activity }) {
  const toolIcons: Record<string, string> = {
    Read: '📖',
    Edit: '✏️',
    Write: '📝',
    Bash: '⚡',
    Glob: '🔍',
    Grep: '🔎',
    Task: '📋',
    default: '🔧',
  }

  const icon = toolIcons[activity.tool || ''] || toolIcons.default
  const isRunning = activity.status === 'running'
  const isError = activity.status === 'error'

  // Shorten input for display
  const shortInput = activity.input
    ? activity.input.length > 40
      ? '...' + activity.input.slice(-37)
      : activity.input
    : ''

  return (
    <div className={`tool-badge ${isRunning ? 'running' : ''} ${isError ? 'error' : ''}`}>
      <span className="tool-icon">{icon}</span>
      <span className="tool-name">{activity.tool}</span>
      {shortInput && <span className="tool-input">{shortInput}</span>}
      {isRunning && <span className="tool-spinner"></span>}
      {isError && <span className="tool-error">✗</span>}
      {!isRunning && !isError && activity.status === 'complete' && (
        <span className="tool-complete">✓</span>
      )}
    </div>
  )
}

// Message bubble component
function MessageBubble({
  message,
  onImageClick,
  avatarState,
  isActive,
}: {
  message: Message
  onImageClick?: (image: { dataUrl: string; description?: string; fileName: string }) => void
  avatarState?: AvatarState
  isActive?: boolean
}) {
  const isUser = message.role === 'user'
  const hasImages = message.images && message.images.length > 0
  const isAssistant = !isUser

  return (
    <div className={`message-wrapper ${isAssistant ? 'assistant' : 'user'}`}>
      <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
        <div className="message-bubble-content">
          {hasImages && (
            <div className="message-images">
              {message.images!.map((img) => (
                <img
                  key={img.id}
                  src={img.dataUrl}
                  alt={img.fileName}
                  className="message-image-thumb"
                  onClick={() => onImageClick?.({
                    dataUrl: img.dataUrl,
                    description: img.description,
                    fileName: img.fileName
                  })}
                />
              ))}
            </div>
          )}
          <div className="message-content">{message.content}</div>
        </div>
      </div>
      {isAssistant && (
        <div className={`message-footer ${isActive ? '' : 'inactive'}`}>
          <div className={`message-avatar ${isActive ? 'active' : 'inactive'}`}>
            <AvatarSmall state={isActive ? avatarState || 'idle' : 'idle'} />
          </div>
          <div className="message-status">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {!isActive && ' · Delivered'}
          </div>
        </div>
      )}
      {isUser && (
        <div className="message-time user-time">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}
    </div>
  )
}

// Streaming response bubble
function StreamingBubble({ text, avatarState }: { text: string; avatarState: AvatarState }) {
  return (
    <div className="message-wrapper assistant">
      <div className="message-bubble assistant streaming">
        <div className="message-bubble-content">
          <div className="message-content">{text}</div>
        </div>
      </div>
      <div className="message-footer">
        <div className="message-avatar active">
          <AvatarSmall state={avatarState} />
        </div>
        <div className="message-status">
          <TypingIndicator />
        </div>
      </div>
    </div>
  )
}

// Listening indicator moved to UnifiedInputBar

export function ChatTimeline({
  messages,
  activities,
  avatarState,
  streamingText,
  onImageClick,
}: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  // Build unified timeline
  const timeline = buildTimeline(messages, activities, avatarState, streamingText)

  // Group consecutive activities together
  const groupedTimeline: (TimelineItem | { type: 'activity-group'; items: Activity[]; timestamp: number })[] = []
  let currentActivityGroup: Activity[] = []

  for (const item of timeline) {
    if (item.type === 'activity') {
      currentActivityGroup.push(item.data)
    } else {
      if (currentActivityGroup.length > 0) {
        groupedTimeline.push({
          type: 'activity-group',
          items: [...currentActivityGroup],
          timestamp: currentActivityGroup[0].timestamp,
        })
        currentActivityGroup = []
      }
      groupedTimeline.push(item)
    }
  }
  // Don't forget trailing activities
  if (currentActivityGroup.length > 0) {
    groupedTimeline.push({
      type: 'activity-group',
      items: currentActivityGroup,
      timestamp: currentActivityGroup[0].timestamp,
    })
  }

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (shouldAutoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [timeline.length, streamingText, shouldAutoScroll])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
    setShouldAutoScroll(isAtBottom)
  }

  return (
    <div className="chat-timeline" ref={containerRef} onScroll={handleScroll}>
      {groupedTimeline.length === 0 && (
        <div className="timeline-empty">
          <p>Start a conversation by speaking or typing below</p>
        </div>
      )}

      {groupedTimeline.map((item, index) => {
        if (item.type === 'message') {
          // Find if this is the last assistant message and if we're currently active
          const isAssistant = item.data.role === 'assistant'
          const isLastAssistantMsg = isAssistant &&
            !groupedTimeline.slice(index + 1).some(i => i.type === 'message' && i.data.role === 'assistant') &&
            !streamingText // Not active if there's streaming (that bubble is active instead)
          const isActive = isLastAssistantMsg && (avatarState === 'speaking' || avatarState === 'happy')

          return (
            <div
              key={`msg-${item.data.id}`}
              className={`timeline-item ${item.data.role === 'user' ? 'right' : 'left'}`}
            >
              <MessageBubble
                message={item.data}
                onImageClick={onImageClick}
                avatarState={avatarState}
                isActive={isActive}
              />
            </div>
          )
        }

        if (item.type === 'activity-group') {
          return (
            <div key={`activities-${index}`} className="timeline-item left">
              <div className="activity-group">
                {item.items.map((activity) => (
                  <ToolBadge key={activity.id} activity={activity} />
                ))}
              </div>
            </div>
          )
        }

        if (item.type === 'thinking') {
          return (
            <div key="thinking" className="timeline-item left">
              <div className="message-bubble assistant thinking">
                <TypingIndicator />
              </div>
            </div>
          )
        }

        if (item.type === 'streaming') {
          return (
            <div key="streaming" className="timeline-item left">
              <StreamingBubble text={item.text} avatarState={avatarState} />
            </div>
          )
        }

        return null
      })}

      {/* Listening indicator moved to unified input bar */}

      <div ref={bottomRef} />
    </div>
  )
}
