import type { DroppedFile } from '../types'

// Analyze image via Claude Code CLI
export async function analyzeImageViaClaudeCode(file: DroppedFile): Promise<string> {
  const response = await fetch('/api/analyze-image-cc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dataUrl: file.dataUrl,
      fileName: file.name,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `Server error: ${response.status}`)
  }

  const data = await response.json()
  return data.description
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

// Plan event from Claude Code (detected when writing plan files)
export interface PlanEvent {
  title: string
  content: string
}

// Send message through Claude Code CLI (has full agent capabilities)
export async function sendMessageViaClaudeCode(
  message: string,
  onChunk: (text: string) => void,
  history?: Array<{ role: string; content: string }>,
  onActivity?: (activity: ActivityEvent) => void,
  images?: Array<{ dataUrl: string; fileName: string }>,
  onPlan?: (plan: PlanEvent) => void,
  mode?: string,
): Promise<string> {
  const response = await fetch('/api/claude-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, images, mode }),
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
          if (parsed.plan && onPlan) {
            onPlan(parsed.plan)
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
    .map((url) => url.replace(/[.,;:!?)\]]+$/, '')) // Remove trailing punctuation
    .filter((url) => url.length > 0)
    .filter((url, index, arr) => arr.indexOf(url) === index) // Deduplicate
}
