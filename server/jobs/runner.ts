import { spawn, execSync, type ChildProcess } from 'child_process'
import { writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface ActivityEvent {
  type: 'tool_start' | 'tool_end' | 'tool_input' | 'all_complete'
  tool?: string
  id?: string
  input?: string
  status?: string
  output?: string
}

export interface PlanEvent {
  title: string
  content: string
}

export interface RunnerCallbacks {
  onText: (text: string) => void
  onActivity: (event: ActivityEvent) => void
  onPlan?: (plan: PlanEvent) => void
  onError: (error: string) => void
  onComplete: (code: number) => void
}

export interface ImageAttachment {
  dataUrl: string
  fileName: string
}

export interface RunnerOptions {
  prompt: string
  history?: Array<{ role: string; content: string }>
  images?: ImageAttachment[]
  rawMode?: boolean // Skip voice mode wrapping, send prompt as-is with image paths
  callbacks: RunnerCallbacks
}

export interface RunnerHandle {
  pid: number
  kill: () => void
  promise: Promise<number>
}

// Detect if a Write/Edit tool call is writing a plan
function detectPlanFromTool(toolName: string, input: { file_path?: string; content?: string; new_string?: string }): PlanEvent | null {
  if (toolName !== 'Write' && toolName !== 'Edit') return null

  const filePath = input.file_path || ''
  const content = input.content || input.new_string || ''
  if (!content || content.length < 100) return null

  // Check if file path suggests a plan
  const isPlanFile = /plan/i.test(filePath)

  // Check if content has plan-like structure
  const headingCount = (content.match(/^#{1,3}\s+.+/gm) || []).length
  const listItemCount = (content.match(/^(?:\d+\.|[-*])\s+/gm) || []).length
  const hasPlanHeading = /^#{1,3}\s+.*(?:plan|implementation|approach|strategy|roadmap|phases?|proposal)/im.test(content)
  const hasStructure = headingCount >= 2 && listItemCount >= 4

  if (!isPlanFile && !hasPlanHeading && !hasStructure) return null

  // Extract title
  let title = 'Untitled Plan'
  const titleMatch = content.match(/^#{1,3}\s+(.*(?:plan|implementation|approach|strategy|roadmap|phases?|proposal).*)/im)
  if (titleMatch) {
    title = titleMatch[1].replace(/\*\*/g, '').replace(/`/g, '').trim()
  } else {
    const firstHeading = content.match(/^#{1,3}\s+(.+)/m)
    if (firstHeading) {
      title = firstHeading[1].replace(/\*\*/g, '').replace(/`/g, '').trim()
    }
  }

  if (title.length > 100) title = title.slice(0, 97) + '...'

  return { title, content }
}

/**
 * Check if the Claude CLI is installed and reachable.
 * Caches the result for 60 seconds.
 */
let claudeCliCache: { available: boolean; checkedAt: number } | null = null

export function isClaudeCliAvailable(): boolean {
  if (claudeCliCache && Date.now() - claudeCliCache.checkedAt < 60_000) {
    return claudeCliCache.available
  }
  const claudePath = process.env.CLAUDE_PATH || 'claude'
  try {
    execSync(`which ${claudePath}`, { stdio: 'ignore' })
    claudeCliCache = { available: true, checkedAt: Date.now() }
    return true
  } catch {
    claudeCliCache = { available: false, checkedAt: Date.now() }
    return false
  }
}

export function spawnClaude(options: RunnerOptions): RunnerHandle {
  const { prompt, history, images, rawMode, callbacks } = options

  // Pre-flight: check if claude CLI exists before trying to spawn it
  if (!isClaudeCliAvailable()) {
    const promise = Promise.resolve(1)
    // Use setTimeout to make this async so the caller gets the handle back first
    setTimeout(() => {
      callbacks.onError(
        'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code\n' +
        'Or switch to Direct API mode in Settings and enter your Anthropic API key.'
      )
      callbacks.onComplete(1)
    }, 0)
    return { pid: 0, kill: () => {}, promise }
  }

  // Save attached images to temp files so Claude Code can read them natively
  const tempImagePaths: string[] = []
  if (images && images.length > 0) {
    const tempDir = join(tmpdir(), 'wtb-images')
    mkdirSync(tempDir, { recursive: true })
    for (const img of images) {
      const base64Data = img.dataUrl.split(',')[1]
      if (!base64Data) continue
      const ext = img.fileName.split('.').pop() || 'png'
      const tempPath = join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`)
      writeFileSync(tempPath, Buffer.from(base64Data, 'base64'))
      tempImagePaths.push(tempPath)
    }
  }

  let fullPrompt: string
  if (rawMode) {
    // Raw mode: send prompt as-is with image file paths prepended
    let imageBlock = ''
    if (tempImagePaths.length > 0) {
      imageBlock = 'Read these image files and then follow the instructions below:\n' +
        tempImagePaths.map(p => p).join('\n') +
        '\n\n'
    }
    fullPrompt = `${imageBlock}${prompt}`
  } else {
    // Voice mode: wrap prompt with context and voice mode instructions
    const recentMessages = (history || []).slice(-10)
    let contextBlock = ''
    if (recentMessages.length > 0) {
      contextBlock = '[Recent conversation]\n' +
        recentMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') +
        '\n[/Recent conversation]\n\n'
    }

    let imageBlock = ''
    if (tempImagePaths.length > 0) {
      imageBlock = '[Attached Images - Use the Read tool to view these image files]\n' +
        tempImagePaths.map(p => p).join('\n') +
        '\n[/Attached Images]\n\n'
    }

    // Detect if user is asking for a plan
    const isPlanRequest = /\b(?:plan|design|architect|propose|strategy|roadmap|outline)\b/i.test(prompt)
    const planInstruction = isPlanRequest
      ? '\n[PLAN MODE - The user is asking you to make a plan. Write the full detailed plan (with markdown headings, numbered steps, etc.) to a file using the Write tool at /tmp/wtb-plan.md. Then give a brief voice summary of what you planned.]'
      : ''

    fullPrompt = `${contextBlock}${imageBlock}[VOICE MODE - Keep responses to 1-2 sentences, no markdown, speak naturally]${planInstruction}\n\nUser: ${prompt}`
  }

  const args = [
    '-p', fullPrompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--no-session-persistence',
  ]

  const claudePath = process.env.CLAUDE_PATH || 'claude'
  console.log('Spawning claude:', claudePath, 'prompt length:', fullPrompt.length, rawMode ? '(raw mode)' : '(voice mode)')

  // Strip CLAUDECODE env var to allow spawning Claude inside a Claude Code session
  const env = { ...process.env, FORCE_COLOR: '0' }
  delete env.CLAUDECODE

  const claude = spawn(claudePath, args, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  let buffer = ''
  const toolInputs: Record<string, string> = {}
  const toolNames: Record<string, string> = {}
  let currentToolId: string | null = null

  claude.stdout.on('data', (data: Buffer) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const event = JSON.parse(line)

        if (event.type === 'assistant') {
          const textContent = event.message?.content?.find((c: { type: string }) => c.type === 'text')
          if (textContent?.text) {
            let text = textContent.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
            if (text.trim()) {
              callbacks.onText(text)
            }
          }
          const toolUseBlocks = event.message?.content?.filter((c: { type: string }) => c.type === 'tool_use') || []
          for (const toolBlock of toolUseBlocks) {
            if (toolBlock.id && toolBlock.input) {
              toolInputs[toolBlock.id] = JSON.stringify(toolBlock.input)
            }
            let inputDetail = ''
            if (toolBlock.input) {
              if (toolBlock.input.file_path) inputDetail = toolBlock.input.file_path
              else if (toolBlock.input.command) inputDetail = toolBlock.input.command
              else if (toolBlock.input.pattern) inputDetail = toolBlock.input.pattern
            }
            callbacks.onActivity({
              type: 'tool_start',
              tool: toolBlock.name,
              id: toolBlock.id,
              input: inputDetail,
            })
            // Check if this tool use is writing a plan
            if (callbacks.onPlan && toolBlock.input) {
              const plan = detectPlanFromTool(toolBlock.name, toolBlock.input)
              if (plan) callbacks.onPlan(plan)
            }
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block?.type === 'tool_use') {
            currentToolId = event.content_block.id
            toolInputs[currentToolId] = ''
            toolNames[currentToolId] = event.content_block.name
            callbacks.onActivity({
              type: 'tool_start',
              tool: event.content_block.name,
              id: event.content_block.id,
            })
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta' && event.delta?.text) {
            let text = event.delta.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
            if (text) {
              callbacks.onText(text)
            }
          } else if (event.delta?.type === 'input_json_delta' && currentToolId) {
            toolInputs[currentToolId] = (toolInputs[currentToolId] || '') + event.delta.partial_json
          }
        } else if (event.type === 'content_block_stop' && currentToolId) {
          try {
            const inputJson = toolInputs[currentToolId]
            if (inputJson) {
              const input = JSON.parse(inputJson)
              let inputDetail = ''
              if (input.file_path) inputDetail = input.file_path
              else if (input.command) inputDetail = input.command
              else if (input.pattern) inputDetail = input.pattern
              if (inputDetail) {
                callbacks.onActivity({
                  type: 'tool_input',
                  id: currentToolId,
                  input: inputDetail,
                })
              }
              // Check if this tool use is writing a plan
              if (callbacks.onPlan) {
                const toolName = toolNames[currentToolId] || ''
                const plan = detectPlanFromTool(toolName, input)
                if (plan) callbacks.onPlan(plan)
              }
            }
          } catch {
            // Ignore parse errors
          }
          currentToolId = null
        } else if (event.type === 'result') {
          const subtype = event.subtype || 'complete'
          callbacks.onActivity({
            type: 'all_complete',
            status: subtype === 'error' ? 'error' : 'complete',
          })
        } else if (event.type === 'user') {
          const toolResults = event.message?.content?.filter((c: { type: string }) => c.type === 'tool_result') || []
          for (const result of toolResults) {
            const toolId = result.tool_use_id
            const toolName = toolNames[toolId] || 'tool'
            const isError = result.is_error === true
            let output = ''
            if (typeof result.content === 'string') {
              output = result.content.slice(0, 200)
            } else if (Array.isArray(result.content)) {
              const textContent = result.content.find((c: { type: string }) => c.type === 'text')
              output = textContent?.text?.slice(0, 200) || ''
            }
            callbacks.onActivity({
              type: 'tool_end',
              tool: toolName,
              id: toolId,
              status: isError ? 'error' : 'complete',
              output,
            })
          }
        }
      } catch (e) {
        console.log('Parse error for line:', line.slice(0, 100))
      }
    }
  })

  claude.stderr.on('data', (data: Buffer) => {
    const text = data.toString()
    console.error('Claude stderr:', text)
    callbacks.onError(text)
  })

  // Clean up temp image files when process ends
  const cleanupTempFiles = () => {
    for (const p of tempImagePaths) {
      try { unlinkSync(p) } catch { /* already cleaned up */ }
    }
  }

  const promise = new Promise<number>((resolve) => {
    claude.on('close', (code) => {
      cleanupTempFiles()
      callbacks.onComplete(code || 0)
      resolve(code || 0)
    })

    claude.on('error', (err) => {
      cleanupTempFiles()
      callbacks.onError(err.message)
      callbacks.onComplete(1)
      resolve(1)
    })
  })

  return {
    pid: claude.pid || 0,
    kill: () => {
      try {
        claude.kill('SIGTERM')
      } catch {
        // Process may already be dead
      }
    },
    promise,
  }
}
