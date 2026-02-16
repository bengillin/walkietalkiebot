import type { Conversation } from '../types'

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString()
}

export function exportAsMarkdown(conversation: Conversation): string {
  const lines: string[] = []

  lines.push(`# ${conversation.title}`)
  lines.push(``)
  lines.push(`*Exported ${formatTimestamp(Date.now())} | Created ${formatTimestamp(conversation.createdAt)}*`)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)

  for (const msg of conversation.messages) {
    const role = msg.role === 'user' ? 'You' : 'Talkboy'
    const time = formatTimestamp(msg.timestamp)
    lines.push(`### ${role} — ${time}`)
    lines.push(``)
    lines.push(msg.content)
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
  return JSON.stringify({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    })),
    linerNotes: conversation.linerNotes || null,
  }, null, 2)
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
