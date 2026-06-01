import type { Conversation } from '../types'

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString()
}

export function exportAsMarkdown(conversation: Conversation): string {
  const lines: string[] = []

  lines.push(`# ${conversation.title}`)
  lines.push(``)
  lines.push(
    `*Exported ${formatTimestamp(Date.now())} | Created ${formatTimestamp(conversation.createdAt)}*`,
  )
  lines.push(``)
  lines.push(`---`)
  lines.push(``)

  for (const msg of conversation.messages) {
    const role = msg.role === 'user' ? 'You' : 'Talkie'
    const time = formatTimestamp(msg.timestamp)
    lines.push(`### ${role} — ${time}`)
    lines.push(``)
    lines.push(msg.content)

    // Include image references
    if (msg.images && msg.images.length > 0) {
      lines.push(``)
      for (const img of msg.images) {
        const desc = img.description ? ` — ${img.description}` : ''
        lines.push(`> *Image: ${img.fileName}${desc}*`)
      }
    }

    lines.push(``)
  }

  // Include tool activity summary
  if (conversation.activities && conversation.activities.length > 0) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`## Tool Activity`)
    lines.push(``)
    for (const act of conversation.activities) {
      const status = act.status === 'error' ? ' (error)' : ''
      const input = act.input ? `: ${act.input.slice(0, 100)}` : ''
      const duration = act.duration ? ` (${act.duration}ms)` : ''
      lines.push(`- **${act.tool}**${input}${status}${duration}`)
    }
    lines.push(``)
  }

  if (conversation.linerNotes) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`## Liner Notes`)
    lines.push(``)
    lines.push(conversation.linerNotes)
  }

  return lines.join('\n')
}

export function exportAsJson(conversation: Conversation): string {
  return JSON.stringify(
    {
      version: 1,
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      mode: conversation.mode || 'voice',
      messages: conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: m.images?.map((img) => ({
          fileName: img.fileName,
          description: img.description,
        })),
      })),
      activities:
        conversation.activities?.map((a) => ({
          tool: a.tool,
          input: a.input,
          status: a.status,
          timestamp: a.timestamp,
          duration: a.duration,
          error: a.error,
        })) || [],
      linerNotes: conversation.linerNotes || null,
    },
    null,
    2,
  )
}

// Import a conversation from JSON export
export interface ImportedConversation {
  title: string
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>
  mode?: string
  linerNotes?: string | null
}

export function parseImportJson(content: string): ImportedConversation {
  const data = JSON.parse(content)

  if (!data.title || !Array.isArray(data.messages)) {
    throw new Error('Invalid format: missing title or messages')
  }

  return {
    title: data.title,
    messages: data.messages.map((m: { role: string; content: string; timestamp?: number }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.timestamp || Date.now(),
    })),
    mode: data.mode,
    linerNotes: data.linerNotes,
  }
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportConversation(conversation: Conversation, format: 'markdown' | 'json') {
  const safeName = conversation.title
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
    .toLowerCase()

  if (format === 'markdown') {
    const content = exportAsMarkdown(conversation)
    downloadFile(content, `${safeName}.md`, 'text/markdown')
  } else {
    const content = exportAsJson(conversation)
    downloadFile(content, `${safeName}.json`, 'application/json')
  }
}
