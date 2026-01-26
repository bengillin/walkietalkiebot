import type { DroppedFile, Message } from '../types'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

// Analyze an image and return a description
export async function analyzeImage(
  file: DroppedFile,
  apiKey: string
): Promise<string> {
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
      system: `You are analyzing images for a voice assistant app. Describe the image in detail, focusing on:
- If it's a UI mockup/wireframe: describe the layout, components, navigation, and user flow
- If it's a screenshot: describe what app/website it is, the state shown, and key elements
- If it's a hand-drawn sketch: interpret the drawing and describe what it represents
- For any image: note colors, text visible, key visual elements

Be thorough but concise. This description will be used as context for building or discussing the content.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: file.type,
                data: file.dataUrl.split(',')[1],
              },
            },
            {
              type: 'text',
              text: 'Describe this image in detail. If it appears to be a UI design, wireframe, or sketch, focus on the structure and components.',
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.content[0]?.text || 'Unable to analyze image.'
}

// Analyze image via server (for Claude Code mode)
export async function analyzeImageViaServer(
  file: DroppedFile,
  apiKey?: string
): Promise<string> {
  const response = await fetch('/api/analyze-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dataUrl: file.dataUrl,
      fileName: file.name,
      type: file.type,
      apiKey,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `Server error: ${response.status}`)
  }

  const data = await response.json()
  return data.description
}

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeContentBlock[]
}

export async function sendMessageStreaming(
  messages: Message[],
  apiKey: string,
  onChunk: (text: string) => void,
  contextMessages?: Message[],
  attachedFiles?: DroppedFile[]
): Promise<string> {
  // If we have context from past conversations, prepend it
  let allMessages = messages
  if (contextMessages && contextMessages.length > 0) {
    allMessages = [...contextMessages, ...messages]
  }

  // Filter out any messages with empty content
  const claudeMessages: ClaudeMessage[] = allMessages
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({
      role: m.role,
      content: m.content,
    }))

  // If we have attached files, add them to the last user message
  if (attachedFiles && attachedFiles.length > 0 && claudeMessages.length > 0) {
    let lastUserIdx = -1
    for (let i = claudeMessages.length - 1; i >= 0; i--) {
      if (claudeMessages[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx !== -1) {
      const lastUserMsg = claudeMessages[lastUserIdx]
      const textContent = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : ''

      const contentBlocks: ClaudeContentBlock[] = attachedFiles.map((file) => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: file.type,
          data: file.dataUrl.split(',')[1], // Remove data:image/png;base64, prefix
        },
      }))

      // Add the text after images
      contentBlocks.push({ type: 'text', text: textContent })

      claudeMessages[lastUserIdx] = {
        role: 'user',
        content: contentBlocks,
      }
    }
  }

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

// Activity event from Claude Code
export interface ActivityEvent {
  type: 'tool_start' | 'tool_end' | 'tool_input' | 'all_complete'
  tool?: string
  id?: string
  status?: 'running' | 'complete' | 'error'
  output?: string
  input?: string
  partial_json?: string
}

// Send message through Claude Code CLI (has full agent capabilities)
export async function sendMessageViaClaudeCode(
  message: string,
  onChunk: (text: string) => void,
  history?: Array<{ role: string; content: string }>,
  onActivity?: (activity: ActivityEvent) => void
): Promise<string> {
  const response = await fetch('/api/claude-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
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
          if (parsed.activity && onActivity) {
            onActivity(parsed.activity)
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

// Open URL in default browser via server
export async function openUrl(url: string): Promise<void> {
  const response = await fetch('/api/open-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `Failed to open URL: ${response.status}`)
  }
}

// Extract URLs from text
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]*[^\s<>"{}|\\^`[\].,:;!?)])/g
  const matches = text.match(urlRegex) || []
  return matches
    .map(url => url.replace(/[.,;:!?)\]]+$/, '')) // Remove trailing punctuation
    .filter(url => url.length > 0)
    .filter((url, index, arr) => arr.indexOf(url) === index) // Deduplicate
}
