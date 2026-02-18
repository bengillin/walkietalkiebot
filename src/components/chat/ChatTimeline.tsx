import { useEffect, useRef, useState, memo } from 'react'
import { Message, Activity, AvatarState, StoredActivity } from '../../types'
import { openUrl } from '../../lib/claude'
import { getToolIcon, getToolCategoryClass, getToolDisplayName } from '../../lib/toolConfig'
import { MessageContent } from './MessageContent'
import './ChatTimeline.css'

interface ChatTimelineProps {
  messages: Message[]
  activities: Activity[]              // Live activities (current turn)
  storedActivities: StoredActivity[]  // Historical activities (persisted)
  avatarState: AvatarState
  streamingText: string
  onImageClick?: (image: { dataUrl: string; description?: string; fileName: string }, allImages?: { dataUrl: string; description?: string; fileName: string }[]) => void
  onPinToLinerNotes?: (content: string) => void
}

// Unified activity type for display (works with both live and stored)
type DisplayActivity = {
  id: string
  tool: string
  input?: string
  status: 'running' | 'complete' | 'error'
  timestamp: number
}

// Convert StoredActivity to DisplayActivity
function storedToDisplay(stored: StoredActivity): DisplayActivity {
  return {
    id: stored.id,
    tool: stored.tool,
    input: stored.input,
    status: stored.status,
    timestamp: stored.timestamp,
  }
}

// Convert live Activity to DisplayActivity
function liveToDisplay(activity: Activity): DisplayActivity | null {
  if (!activity.tool) return null
  return {
    id: activity.id,
    tool: activity.tool,
    input: activity.input,
    status: activity.status || 'running',
    timestamp: activity.timestamp,
  }
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
function ToolBadge({ activity }: { activity: DisplayActivity }) {
  const icon = getToolIcon(activity.tool)
  const isRunning = activity.status === 'running'
  const isError = activity.status === 'error'

  // Shorten input for display
  const shortInput = activity.input
    ? activity.input.length > 40
      ? '...' + activity.input.slice(-37)
      : activity.input
    : ''

  return (
    <div className={`tool-badge ${getToolCategoryClass(activity.tool)} ${isRunning ? 'running' : ''} ${isError ? 'error' : ''}`}>
      <span className="tool-icon">{icon}</span>
      <span className="tool-name">{getToolDisplayName(activity.tool)}</span>
      {shortInput && <span className="tool-input">{shortInput}</span>}
      {isRunning && <span className="tool-spinner"></span>}
      {isError && <span className="tool-error">✗</span>}
      {!isRunning && !isError && activity.status === 'complete' && (
        <span className="tool-complete">✓</span>
      )}
    </div>
  )
}

// Collapsible tools component
function CollapsibleTools({
  activities,
  isLive = false,
  messageId: _messageId
}: {
  activities: DisplayActivity[]
  isLive?: boolean
  messageId: string
}) {
  const [isExpanded, setIsExpanded] = useState(isLive)

  // Auto-expand when live
  useEffect(() => {
    if (isLive) setIsExpanded(true)
  }, [isLive])

  if (activities.length === 0) return null

  // Get unique tool names for collapsed indicator
  const toolNames = [...new Set(activities.map(a => a.tool))]

  const hasRunning = activities.some(a => a.status === 'running')
  const hasError = activities.some(a => a.status === 'error')

  return (
    <div className={`collapsible-tools ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {isExpanded ? (
        <div className="collapsible-tools__expanded">
          <button
            className={`collapsible-tools__indicator ${hasRunning ? 'running' : ''} ${hasError ? 'error' : ''}`}
            onClick={() => !isLive && setIsExpanded(false)}
            disabled={isLive}
          >
            <span className="collapsible-tools__icons">
              {toolNames.slice(0, 4).map(name => (
                <span key={name} className="collapsible-tools__icon">
                  {getToolIcon(name)}
                </span>
              ))}
              {toolNames.length > 4 && <span className="collapsible-tools__more">+{toolNames.length - 4}</span>}
            </span>
            <span className="collapsible-tools__count">
              {activities.length} tool{activities.length !== 1 ? 's' : ''}
            </span>
            <span className="collapsible-tools__expand-icon">▼</span>
          </button>
          <div className="activity-group">
            {activities.map((activity) => (
              <ToolBadge key={activity.id} activity={activity} />
            ))}
          </div>
        </div>
      ) : (
        <button
          className={`collapsible-tools__indicator ${hasRunning ? 'running' : ''} ${hasError ? 'error' : ''}`}
          onClick={() => setIsExpanded(true)}
        >
          <span className="collapsible-tools__icons">
            {toolNames.slice(0, 4).map(name => (
              <span key={name} className="collapsible-tools__icon">
                {getToolIcon(name)}
              </span>
            ))}
            {toolNames.length > 4 && <span className="collapsible-tools__more">+{toolNames.length - 4}</span>}
          </span>
          <span className="collapsible-tools__count">
            {activities.length} tool{activities.length !== 1 ? 's' : ''}
          </span>
          <span className="collapsible-tools__expand-icon">▶</span>
        </button>
      )}
    </div>
  )
}

// Render text with clickable URLs
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]*[^\s<>"{}|\\^`[\].,:;!?)])/g

function renderTextWithLinks(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0

  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0].replace(/[.,;:!?)\]]+$/, '')
    const start = match.index!
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start))
    }
    parts.push(
      <a
        key={start}
        className="message-link"
        href={url}
        onClick={(e) => {
          e.preventDefault()
          openUrl(url)
        }}
      >
        {url}
      </a>
    )
    lastIndex = start + url.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

// Format time for tape display
function formatTapeTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Check if content has meaningful structure (markdown headings, code blocks, lists)
function hasStructuredContent(content: string): boolean {
  return /^(#{1,3} |```|\d+\. |- |\* )/m.test(content) && content.length > 100
}

// Message bubble component with optional activities
function MessageBubble({
  message,
  onImageClick,
  onPinToLinerNotes,
  trackNumber,
  activities = [],
  referencedImages,
}: {
  message: Message
  onImageClick?: (image: { dataUrl: string; description?: string; fileName: string }, allImages?: { dataUrl: string; description?: string; fileName: string }[]) => void
  onPinToLinerNotes?: (content: string) => void
  trackNumber: number
  activities?: DisplayActivity[]
  referencedImages?: { dataUrl: string; description?: string; fileName: string }[]
}) {
  const isUser = message.role === 'user'
  const hasImages = message.images && message.images.length > 0
  const imageCount = message.images?.length || 0
  const hasRefImages = !isUser && referencedImages && referencedImages.length > 0
  const showPinButton = !isUser && onPinToLinerNotes && hasStructuredContent(message.content)

  // Build gallery array for lightbox navigation
  const galleryImages = hasImages
    ? message.images!.map(img => ({
        dataUrl: img.dataUrl,
        description: img.description,
        fileName: img.fileName,
      }))
    : hasRefImages
    ? referencedImages
    : undefined

  return (
    <div className={`message-wrapper ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && activities.length > 0 && (
        <CollapsibleTools
          activities={activities}
          messageId={message.id}
        />
      )}
      <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
        <div className="message-bubble-content">
          {hasImages && (
            <div className={`message-images ${imageCount > 2 ? 'message-images--grid' : ''}`}>
              {message.images!.map((img) => (
                <div key={img.id} className="message-image-wrapper">
                  <img
                    src={img.dataUrl}
                    alt={img.fileName}
                    className="message-image-thumb"
                    onClick={() => onImageClick?.({
                      dataUrl: img.dataUrl,
                      description: img.description,
                      fileName: img.fileName
                    }, galleryImages)}
                  />
                  {img.description && (
                    <span className="message-image-analyzed" title="Analyzed">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    </span>
                  )}
                </div>
              ))}
              {imageCount > 1 && (
                <span className="message-images-count">{imageCount} images</span>
              )}
            </div>
          )}
          {hasRefImages && (
            <div className="message-ref-images">
              {referencedImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img.dataUrl}
                  alt={img.fileName}
                  className="message-ref-image"
                  onClick={() => onImageClick?.(img, galleryImages)}
                />
              ))}
            </div>
          )}
          {isUser ? (
            <div className="message-content">{renderTextWithLinks(message.content)}</div>
          ) : (
            <MessageContent content={message.content} />
          )}
        </div>
        {showPinButton && (
          <button
            className="message-bubble__pin-btn"
            onClick={() => onPinToLinerNotes(message.content)}
            title="Pin to liner notes"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            Liner Notes
          </button>
        )}
      </div>
      <div className={`message-meta ${isUser ? 'user' : 'assistant'}`}>
        <span className="message-meta__name">{isUser ? 'You' : 'Talkie'}</span>
        {message.source && message.source !== 'web' && (
          <span className="message-meta__source">via {message.source}</span>
        )}
        <span className="message-meta__time">{formatTapeTime(message.timestamp)}</span>
        <span className="message-meta__track">#{String(trackNumber).padStart(2, '0')}</span>
      </div>
    </div>
  )
}

// Streaming response bubble with live activities
function StreamingBubble({
  text,
  trackNumber,
  activities = [],
  referencedImages,
  onImageClick,
}: {
  text: string
  trackNumber: number
  activities?: DisplayActivity[]
  referencedImages?: { dataUrl: string; description?: string; fileName: string }[]
  onImageClick?: (image: { dataUrl: string; description?: string; fileName: string }, allImages?: { dataUrl: string; description?: string; fileName: string }[]) => void
}) {
  const hasRefImages = referencedImages && referencedImages.length > 0
  return (
    <div className="message-wrapper assistant">
      {activities.length > 0 && (
        <CollapsibleTools
          activities={activities}
          isLive={true}
          messageId="streaming"
        />
      )}
      <div className="message-bubble assistant streaming">
        <div className="message-bubble-content">
          {hasRefImages && (
            <div className="message-ref-images">
              {referencedImages.map((img, idx) => (
                <img
                  key={idx}
                  src={img.dataUrl}
                  alt={img.fileName}
                  className="message-ref-image"
                  onClick={() => onImageClick?.(img, referencedImages)}
                />
              ))}
            </div>
          )}
          <MessageContent content={text} />
        </div>
      </div>
      <div className="message-meta assistant">
        <span className="message-meta__name message-meta__name--recording">Talkie</span>
        <span className="message-meta__time">
          <TypingIndicator />
        </span>
        <span className="message-meta__track">#{String(trackNumber).padStart(2, '0')}</span>
      </div>
    </div>
  )
}

// Build timeline with activities attached to their corresponding messages
// Uses stored activities for historical messages, live activities for current turn
function buildMessageTimeline(
  messages: Message[],
  storedActivities: StoredActivity[],
  liveActivities: Activity[]
): Map<string, DisplayActivity[]> {
  const messageActivities = new Map<string, DisplayActivity[]>()

  // Sort messages by timestamp
  const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp)

  // First, map stored activities to their messages
  for (const stored of storedActivities) {
    // Find the next assistant message after this activity
    const nextAssistantMsg = sortedMessages.find(
      m => m.role === 'assistant' && m.timestamp > stored.timestamp
    )

    if (nextAssistantMsg) {
      const existing = messageActivities.get(nextAssistantMsg.id) || []
      existing.push(storedToDisplay(stored))
      messageActivities.set(nextAssistantMsg.id, existing)
    }
  }

  // Then, map any completed live activities (for the current turn before finalization)
  const completedLive = liveActivities
    .filter(a => (a.type === 'tool_start' || a.type === 'thinking') && a.status === 'complete')
    .map(liveToDisplay)
    .filter((a): a is DisplayActivity => a !== null)

  for (const activity of completedLive) {
    const nextAssistantMsg = sortedMessages.find(
      m => m.role === 'assistant' && m.timestamp > activity.timestamp
    )

    if (nextAssistantMsg) {
      const existing = messageActivities.get(nextAssistantMsg.id) || []
      // Avoid duplicates (in case activity is both stored and live)
      if (!existing.some(e => e.id === activity.id)) {
        existing.push(activity)
        messageActivities.set(nextAssistantMsg.id, existing)
      }
    }
  }

  return messageActivities
}

// Get live activities that don't belong to any message yet (pending)
function getPendingActivities(
  messages: Message[],
  activities: Activity[]
): DisplayActivity[] {
  const toolActivities = activities.filter(
    a => a.type === 'tool_start' || a.type === 'thinking'
  )

  if (toolActivities.length === 0) return []

  // Get the latest assistant message timestamp
  const assistantMessages = messages.filter(m => m.role === 'assistant')
  const latestAssistantTime = assistantMessages.length > 0
    ? Math.max(...assistantMessages.map(m => m.timestamp))
    : 0

  // Return activities that are after the latest assistant message
  return toolActivities
    .filter(a => a.timestamp > latestAssistantTime)
    .map(liveToDisplay)
    .filter((a): a is DisplayActivity => a !== null)
}

export const ChatTimeline = memo(function ChatTimeline({
  messages,
  activities,
  storedActivities,
  avatarState,
  streamingText,
  onImageClick,
  onPinToLinerNotes,
}: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  // Build activity map for messages (combines stored + live)
  const messageActivities = buildMessageTimeline(messages, storedActivities, activities)

  // Get pending live activities (for streaming/thinking states)
  const pendingActivities = getPendingActivities(messages, activities)

  // Sort messages by timestamp
  const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (shouldAutoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, streamingText, activities.length, shouldAutoScroll])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
    setShouldAutoScroll(isAtBottom)
  }

  const isEmpty = sortedMessages.length === 0 && !streamingText && avatarState !== 'thinking'

  return (
    <div className="chat-timeline" ref={containerRef} onScroll={handleScroll}>
      {isEmpty && (
        <div className="timeline-empty">
          <p>Start a conversation by speaking or typing below</p>
        </div>
      )}

      {sortedMessages.map((message, index) => {
        const trackNumber = index + 1
        const msgActivities = messageActivities.get(message.id) || []

        // For assistant messages, find images from the preceding user message
        let referencedImages: { dataUrl: string; description?: string; fileName: string }[] | undefined
        if (message.role === 'assistant' && index > 0) {
          const prevMsg = sortedMessages[index - 1]
          if (prevMsg.role === 'user' && prevMsg.images && prevMsg.images.length > 0) {
            referencedImages = prevMsg.images.map(img => ({
              dataUrl: img.dataUrl,
              description: img.description,
              fileName: img.fileName,
            }))
          }
        }

        return (
          <div
            key={`msg-${message.id}`}
            className={`timeline-item ${message.role === 'user' ? 'right' : 'left'}`}
          >
            <MessageBubble
              message={message}
              onImageClick={onImageClick}
              onPinToLinerNotes={onPinToLinerNotes}
              trackNumber={trackNumber}
              activities={msgActivities}
              referencedImages={referencedImages}
            />
          </div>
        )
      })}

      {/* Thinking indicator (no streaming yet, no pending activities) */}
      {avatarState === 'thinking' && !streamingText && pendingActivities.length === 0 && (
        <div className="timeline-item left">
          <div className="message-bubble assistant thinking">
            <TypingIndicator />
          </div>
        </div>
      )}

      {/* Live activities (before streaming starts) */}
      {pendingActivities.length > 0 && !streamingText && (
        <div className="timeline-item left">
          <div className="message-wrapper assistant">
            <CollapsibleTools
              activities={pendingActivities}
              isLive={true}
              messageId="pending"
            />
            {avatarState === 'thinking' && (
              <div className="message-bubble assistant thinking">
                <TypingIndicator />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Streaming response */}
      {streamingText && (
        <div className="timeline-item left">
          <StreamingBubble
            text={streamingText}
            trackNumber={sortedMessages.length + 1}
            activities={pendingActivities}
            referencedImages={
              sortedMessages.length > 0 && sortedMessages[sortedMessages.length - 1].role === 'user' && sortedMessages[sortedMessages.length - 1].images?.length
                ? sortedMessages[sortedMessages.length - 1].images!.map(img => ({ dataUrl: img.dataUrl, description: img.description, fileName: img.fileName }))
                : undefined
            }
            onImageClick={onImageClick}
          />
        </div>
      )}

      <div ref={bottomRef} />

      {!shouldAutoScroll && (
        <button
          className="scroll-to-bottom"
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
            setShouldAutoScroll(true)
          }}
          aria-label="Scroll to bottom"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
          </svg>
        </button>
      )}
    </div>
  )
})
