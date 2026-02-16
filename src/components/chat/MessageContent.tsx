import { openUrl } from '../../lib/claude'

// Segment types for structured content rendering
type Segment =
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'separator' }

// Parse message content into typed segments
function parseSegments(content: string): Segment[] {
  const lines = content.split('\n')
  const segments: Segment[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      segments.push({ type: 'code', language: lang, code: codeLines.join('\n') })
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      segments.push({ type: 'separator' })
      i++
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      segments.push({ type: 'heading', level: 3, text: line.slice(4) })
      i++
      continue
    }
    if (line.startsWith('## ')) {
      segments.push({ type: 'heading', level: 2, text: line.slice(3) })
      i++
      continue
    }
    if (line.startsWith('# ')) {
      segments.push({ type: 'heading', level: 1, text: line.slice(2) })
      i++
      continue
    }

    // List items (collect consecutive)
    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2))
        i++
      }
      segments.push({ type: 'list', ordered: false, items })
      continue
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s*/, ''))
        i++
      }
      segments.push({ type: 'list', ordered: true, items })
      continue
    }

    // Empty line = skip (acts as natural separator between paragraphs)
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph: collect consecutive non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('# ') &&
      !lines[i].startsWith('## ') &&
      !lines[i].startsWith('### ') &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      segments.push({ type: 'paragraph', text: paraLines.join('\n') })
    }
  }

  return segments
}

// URL regex for clickable links
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]*[^\s<>"{}|\\^`[\].,:;!?)])/g

// Render inline markdown: **bold**, `code`, *italic*, and URLs
function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  // First split by inline patterns, then handle URLs within text chunks
  const inlineRegex = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(inlineRegex)) {
    const start = match.index!
    if (start > lastIndex) {
      parts.push(...renderUrls(text.slice(lastIndex, start), key))
      key += 10
    }

    if (match[2]) {
      // Bold
      parts.push(<strong key={`b${key++}`}>{match[2]}</strong>)
    } else if (match[3]) {
      // Inline code
      parts.push(<code key={`c${key++}`} className="msg-inline-code">{match[3]}</code>)
    } else if (match[4]) {
      // Italic
      parts.push(<em key={`i${key++}`}>{match[4]}</em>)
    }
    lastIndex = start + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(...renderUrls(text.slice(lastIndex), key))
  }

  return parts.length > 0 ? parts : [text]
}

function renderUrls(text: string, keyOffset: number): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let key = keyOffset

  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0].replace(/[.,;:!?)\]]+$/, '')
    const start = match.index!
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start))
    }
    parts.push(
      <a
        key={`u${key++}`}
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

// Check if content has enough structure to segment
function shouldSegment(content: string): boolean {
  // Only segment if there's meaningful markdown structure and enough content
  const hasStructure = /^(#{1,3} |```|\d+\. |- |\* |---)/m.test(content)
  const hasMultipleParagraphs = (content.match(/\n\n/g) || []).length >= 1
  return (hasStructure || hasMultipleParagraphs) && content.length > 80
}

interface MessageContentProps {
  content: string
}

export function MessageContent({ content }: MessageContentProps) {
  // For simple content, render as plain text with URLs
  if (!shouldSegment(content)) {
    return <div className="message-content">{renderInline(content)}</div>
  }

  const segments = parseSegments(content)

  return (
    <div className="message-content message-content--segmented">
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'paragraph':
            return (
              <div key={i} className="msg-segment msg-paragraph">
                {renderInline(seg.text)}
              </div>
            )
          case 'code':
            return (
              <div key={i} className="msg-segment msg-code-block">
                {seg.language && <span className="msg-code-lang">{seg.language}</span>}
                <pre><code>{seg.code}</code></pre>
              </div>
            )
          case 'heading':
            const Tag = `h${seg.level + 1}` as 'h2' | 'h3' | 'h4'
            return (
              <Tag key={i} className={`msg-segment msg-heading msg-heading--${seg.level}`}>
                {renderInline(seg.text)}
              </Tag>
            )
          case 'list':
            const ListTag = seg.ordered ? 'ol' : 'ul'
            return (
              <ListTag key={i} className="msg-segment msg-list">
                {seg.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ListTag>
            )
          case 'separator':
            return <hr key={i} className="msg-segment msg-separator" />
          default:
            return null
        }
      })}
    </div>
  )
}
