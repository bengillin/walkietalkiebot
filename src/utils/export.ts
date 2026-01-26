import type { Conversation, Message } from '../types'

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatMessageForMarkdown(message: Message): string {
  const role = message.role === 'user' ? '**You**' : '**Talkboy**'
  let content = `${role} (${formatTimestamp(message.timestamp)})\n\n${message.content}`

  if (message.images && message.images.length > 0) {
    content += '\n\n*Attached images:*\n'
    message.images.forEach(img => {
      content += `- ${img.fileName}`
      if (img.description) {
        content += `: ${img.description}`
      }
      content += '\n'
    })
  }

  return content
}

function formatMessageForText(message: Message): string {
  const role = message.role === 'user' ? 'You' : 'Talkboy'
  let content = `[${formatTimestamp(message.timestamp)}] ${role}:\n${message.content}`

  if (message.images && message.images.length > 0) {
    content += '\n(Attached images: '
    content += message.images.map(img => img.fileName).join(', ')
    content += ')'
  }

  return content
}

export function exportToMarkdown(conversation: Conversation): string {
  const lines: string[] = [
    `# ${conversation.title}`,
    '',
    `*Created: ${formatTimestamp(conversation.createdAt)}*`,
    `*Last updated: ${formatTimestamp(conversation.updatedAt)}*`,
    '',
    '---',
    '',
  ]

  conversation.messages.forEach(message => {
    lines.push(formatMessageForMarkdown(message))
    lines.push('')
    lines.push('---')
    lines.push('')
  })

  return lines.join('\n')
}

export function exportToJSON(conversation: Conversation): string {
  return JSON.stringify(conversation, null, 2)
}

export function exportToText(conversation: Conversation): string {
  const lines: string[] = [
    conversation.title,
    '='.repeat(conversation.title.length),
    '',
    `Created: ${formatTimestamp(conversation.createdAt)}`,
    `Last updated: ${formatTimestamp(conversation.updatedAt)}`,
    '',
    '-'.repeat(40),
    '',
  ]

  conversation.messages.forEach(message => {
    lines.push(formatMessageForText(message))
    lines.push('')
  })

  return lines.join('\n')
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
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

export function exportConversation(
  conversation: Conversation,
  format: 'markdown' | 'json' | 'text'
): void {
  const safeTitle = conversation.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()

  switch (format) {
    case 'markdown': {
      const content = exportToMarkdown(conversation)
      downloadFile(content, `${safeTitle}.md`, 'text/markdown')
      break
    }
    case 'json': {
      const content = exportToJSON(conversation)
      downloadFile(content, `${safeTitle}.json`, 'application/json')
      break
    }
    case 'text': {
      const content = exportToText(conversation)
      downloadFile(content, `${safeTitle}.txt`, 'text/plain')
      break
    }
  }
}
