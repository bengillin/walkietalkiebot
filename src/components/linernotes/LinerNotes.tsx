import { useState, useEffect, useRef } from 'react'
import './LinerNotes.css'

interface LinerNotesProps {
  isOpen: boolean
  linerNotes: string | null
  conversationTitle: string
  onSave: (notes: string | null) => void
  onClose: () => void
  onPinMessage?: (content: string) => void
}

export function LinerNotes({
  isOpen,
  linerNotes,
  conversationTitle,
  onSave,
  onClose,
}: LinerNotesProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(linerNotes || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync draft when liner notes change externally
  useEffect(() => {
    if (!isEditing) {
      setDraft(linerNotes || '')
    }
  }, [linerNotes, isEditing])

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      )
    }
  }, [isEditing])

  if (!isOpen) return null

  const handleSave = () => {
    const trimmed = draft.trim()
    onSave(trimmed || null)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setDraft(linerNotes || '')
    setIsEditing(false)
  }

  const handleClear = () => {
    onSave(null)
    setDraft('')
    setIsEditing(false)
  }

  // Simple markdown rendering (headings, bold, lists, code blocks)
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n')
    const elements: JSX.Element[] = []
    let inCodeBlock = false
    let codeContent = ''
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Code block toggling
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={i} className="liner-notes__code-block">
              <code>{codeContent.trimEnd()}</code>
            </pre>
          )
          codeContent = ''
          inCodeBlock = false
        } else {
          inCodeBlock = true
        }
        continue
      }

      if (inCodeBlock) {
        codeContent += line + '\n'
        continue
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(<h4 key={i} className="liner-notes__h3">{line.slice(4)}</h4>)
      } else if (line.startsWith('## ')) {
        elements.push(<h3 key={i} className="liner-notes__h2">{line.slice(3)}</h3>)
      } else if (line.startsWith('# ')) {
        elements.push(<h2 key={i} className="liner-notes__h1">{line.slice(2)}</h2>)
      }
      // Horizontal rule
      else if (line.match(/^---+$/)) {
        elements.push(<hr key={i} className="liner-notes__hr" />)
      }
      // Bullet lists
      else if (line.match(/^[-*] /)) {
        elements.push(
          <li key={i} className="liner-notes__li">
            {renderInline(line.slice(2))}
          </li>
        )
      }
      // Numbered lists
      else if (line.match(/^\d+\. /)) {
        const content = line.replace(/^\d+\.\s*/, '')
        elements.push(
          <li key={i} className="liner-notes__li liner-notes__li--numbered">
            {renderInline(content)}
          </li>
        )
      }
      // Empty lines
      else if (line.trim() === '') {
        elements.push(<div key={i} className="liner-notes__spacer" />)
      }
      // Regular paragraphs
      else {
        elements.push(<p key={i} className="liner-notes__p">{renderInline(line)}</p>)
      }
    }

    // Close any unclosed code block
    if (inCodeBlock && codeContent) {
      elements.push(
        <pre key="unclosed-code" className="liner-notes__code-block">
          <code>{codeContent.trimEnd()}</code>
        </pre>
      )
    }

    return elements
  }

  // Inline markdown: **bold**, `code`, *italic*
  const renderInline = (text: string): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = []
    let remaining = text
    let key = 0

    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      // Inline code
      const codeMatch = remaining.match(/`(.+?)`/)
      // Italic
      const italicMatch = remaining.match(/\*(.+?)\*/)

      // Find earliest match
      let earliest: { type: string; match: RegExpMatchArray; index: number } | null = null
      if (boldMatch?.index !== undefined) {
        earliest = { type: 'bold', match: boldMatch, index: boldMatch.index }
      }
      if (codeMatch?.index !== undefined && (!earliest || codeMatch.index < earliest.index)) {
        earliest = { type: 'code', match: codeMatch, index: codeMatch.index }
      }
      if (italicMatch?.index !== undefined && (!earliest || italicMatch.index < earliest.index)) {
        // Don't match italic if it's actually bold
        if (!boldMatch || italicMatch.index !== boldMatch.index) {
          earliest = { type: 'italic', match: italicMatch, index: italicMatch.index }
        }
      }

      if (!earliest) {
        parts.push(remaining)
        break
      }

      // Text before the match
      if (earliest.index > 0) {
        parts.push(remaining.slice(0, earliest.index))
      }

      // The matched element
      if (earliest.type === 'bold') {
        parts.push(<strong key={key++}>{earliest.match[1]}</strong>)
      } else if (earliest.type === 'code') {
        parts.push(<code key={key++} className="liner-notes__inline-code">{earliest.match[1]}</code>)
      } else if (earliest.type === 'italic') {
        parts.push(<em key={key++}>{earliest.match[1]}</em>)
      }

      remaining = remaining.slice(earliest.index + earliest.match[0].length)
    }

    return parts
  }

  return (
    <div className="liner-notes">
      <div className="liner-notes__backdrop" onClick={onClose} />

      <div className="liner-notes__panel">
        <div className="liner-notes__header">
          <div className="liner-notes__header-left">
            <svg className="liner-notes__icon" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            <h3 className="liner-notes__title">Liner Notes</h3>
          </div>
          <button className="liner-notes__close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="liner-notes__tape-label">
          {conversationTitle}
        </div>

        <div className="liner-notes__content">
          {isEditing ? (
            <div className="liner-notes__editor">
              <textarea
                ref={textareaRef}
                className="liner-notes__textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write your liner notes here... Supports markdown."
              />
              <div className="liner-notes__editor-actions">
                <button className="liner-notes__btn liner-notes__btn--cancel" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="liner-notes__btn liner-notes__btn--save" onClick={handleSave}>
                  Save
                </button>
              </div>
            </div>
          ) : linerNotes ? (
            <div className="liner-notes__rendered">
              {renderMarkdown(linerNotes)}
            </div>
          ) : (
            <div className="liner-notes__empty">
              <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40" opacity={0.3}>
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              <p>No liner notes yet</p>
              <span>Pin messages or write notes for this tape.</span>
            </div>
          )}
        </div>

        <div className="liner-notes__footer">
          {!isEditing && (
            <>
              <button
                className="liner-notes__btn liner-notes__btn--edit"
                onClick={() => setIsEditing(true)}
              >
                {linerNotes ? 'Edit' : 'Write Notes'}
              </button>
              {linerNotes && (
                <button
                  className="liner-notes__btn liner-notes__btn--clear"
                  onClick={handleClear}
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
