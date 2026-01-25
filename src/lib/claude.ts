import type { Message } from '../types'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ClaudeResponse {
  content: Array<{ type: 'text'; text: string }>
}

export async function sendMessage(
  messages: Message[],
  apiKey: string
): Promise<string> {
  // Convert our messages to Claude format
  const claudeMessages: ClaudeMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are Talkboy. Be direct and brief - responses are spoken aloud. One to two sentences max unless asked for more. No filler phrases, no "Great question!", no "I'd be happy to help!". Just answer. Kind but not performative.`,
      messages: claudeMessages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error: ${response.status} - ${error}`)
  }

  const data: ClaudeResponse = await response.json()
  return data.content[0]?.text || 'Sorry, I didn\'t get a response.'
}

export async function sendMessageStreaming(
  messages: Message[],
  apiKey: string,
  onChunk: (text: string) => void,
  contextMessages?: Message[]
): Promise<string> {
  // If we have context from past conversations, prepend it
  let allMessages = messages
  if (contextMessages && contextMessages.length > 0) {
    allMessages = [...contextMessages, ...messages]
  }

  const claudeMessages: ClaudeMessage[] = allMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      stream: true,
      system: `You are Talkboy. Be direct and brief - responses are spoken aloud. One to two sentences max unless asked for more. No filler phrases, no "Great question!", no "I'd be happy to help!". Just answer. Kind but not performative.`,
      messages: claudeMessages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error: ${response.status} - ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text
            onChunk(parsed.delta.text)
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  }

  return fullText
}

// Send message through Claude Code CLI (has full agent capabilities)
export async function sendMessageViaClaudeCode(
  message: string,
  onChunk: (text: string) => void
): Promise<string> {
  const response = await fetch('/api/claude-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude Code error: ${response.status} - ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        try {
          const parsed = JSON.parse(data)
          if (parsed.text) {
            fullText += parsed.text
            onChunk(parsed.text)
          }
          if (parsed.error) {
            throw new Error(parsed.error)
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
            throw e
          }
        }
      }
    }
  }

  return fullText
}
