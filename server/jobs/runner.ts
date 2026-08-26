import { spawn, execFileSync, type ChildProcess } from 'child_process'
import { writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildPrompt } from '../promptBuilder.js'
import { getMode } from '../modes.js'

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
  mode?: string // Mode name for prompt construction (default: 'voice')
  // When set to a conversation UUID, the turn runs inside a persistent Claude Code
  // session (--session-id / --resume) instead of a one-shot process, so history is
  // not rebuilt and the conversation prefix is cached across turns.
  conversationId?: string
  callbacks: RunnerCallbacks
}

export interface RunnerHandle {
  pid: number
  kill: () => void
  promise: Promise<number>
}

// Detect if a Write/Edit tool call is writing a plan
function detectPlanFromTool(
  toolName: string,
  input: { file_path?: string; content?: string; new_string?: string },
): PlanEvent | null {
  if (toolName !== 'Write' && toolName !== 'Edit') return null

  const filePath = input.file_path || ''
  const content = input.content || input.new_string || ''
  if (!content || content.length < 100) return null

  // Check if file path suggests a plan
  const isPlanFile = /plan/i.test(filePath)

  // Check if content has plan-like structure
  const headingCount = (content.match(/^#{1,3}\s+.+/gm) || []).length
  const listItemCount = (content.match(/^(?:\d+\.|[-*])\s+/gm) || []).length
  const hasPlanHeading =
    /^#{1,3}\s+.*(?:plan|implementation|approach|strategy|roadmap|phases?|proposal)/im.test(content)
  const hasStructure = headingCount >= 2 && listItemCount >= 4

  if (!isPlanFile && !hasPlanHeading && !hasStructure) return null

  // Extract title
  let title = 'Untitled Plan'
  const titleMatch = content.match(
    /^#{1,3}\s+(.*(?:plan|implementation|approach|strategy|roadmap|phases?|proposal).*)/im,
  )
  const heading = titleMatch?.[1] ?? content.match(/^#{1,3}\s+(.+)/m)?.[1]
  if (heading) {
    title = heading.replace(/\*\*/g, '').replace(/`/g, '').trim()
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
    // execFile (not execSync) so claudePath is passed as an argument and never
    // interpreted by a shell — avoids command injection via CLAUDE_PATH.
    execFileSync('which', [claudePath], { stdio: 'ignore' })
    claudeCliCache = { available: true, checkedAt: Date.now() }
    return true
  } catch {
    claudeCliCache = { available: false, checkedAt: Date.now() }
    return false
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_NOT_FOUND = 'No conversation found with session ID'
const SESSION_IN_USE = 'is already in use'

// Conversations whose Claude Code session has been created during THIS server
// process. Decides --resume vs --session-id for the first attempt; resets on
// restart, after which the transparent fallback in spawnClaude re-syncs with
// whatever sessions exist on disk.
const establishedSessions = new Set<string>()

/** Test seam: forget all in-process session tracking. */
export function _resetSessionTracking(): void {
  establishedSessions.clear()
}

export function spawnClaude(options: RunnerOptions): RunnerHandle {
  const { prompt, history, images, rawMode, mode: modeName, conversationId, callbacks } = options

  // Pre-flight: check if claude CLI exists before trying to spawn it
  if (!isClaudeCliAvailable()) {
    const promise = Promise.resolve(1)
    setTimeout(() => {
      callbacks.onError(
        'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
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
  const imagePaths = tempImagePaths.length > 0 ? tempImagePaths : undefined

  // Build the per-turn prompt. On session resume we omit history (the session
  // already holds it); on create / one-shot we include it as a seed.
  const mode = rawMode ? null : getMode(modeName || 'voice')
  const buildFullPrompt = (includeHistory: boolean): string => {
    if (rawMode) {
      const imageBlock =
        tempImagePaths.length > 0
          ? 'Read these image files and then follow the instructions below:\n' +
            tempImagePaths.join('\n') +
            '\n\n'
          : ''
      return `${imageBlock}${prompt}`
    }
    return buildPrompt({
      message: prompt,
      mode: mode!,
      history: includeHistory ? history : undefined,
      imagePaths,
    })
  }

  const claudePath = process.env.CLAUDE_PATH || 'claude'
  // Strip CLAUDECODE env var to allow spawning Claude inside a Claude Code session
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0' }
  delete env.CLAUDECODE

  const baseArgs = [
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'bypassPermissions',
  ]

  // Clean up temp image files exactly once, after the final attempt.
  let cleaned = false
  const cleanupTempFiles = () => {
    if (cleaned) return
    cleaned = true
    for (const p of tempImagePaths) {
      try {
        unlinkSync(p)
      } catch {
        /* already cleaned up */
      }
    }
  }

  const useSession = !rawMode && !!conversationId && UUID_RE.test(conversationId)

  // One-shot path (jobs, image analysis, raw mode, or clients without a
  // conversation id): unchanged legacy behavior.
  if (!useSession) {
    const fullPrompt = buildFullPrompt(true)
    const args = ['-p', fullPrompt, ...baseArgs, '--no-session-persistence']
    console.log(
      'Spawning claude:',
      claudePath,
      'len',
      fullPrompt.length,
      rawMode ? '(raw)' : '(voice)',
    )
    const proc = runClaudeProcess(claudePath, args, env, {
      ...callbacks,
      onComplete: (code) => {
        cleanupTempFiles()
        callbacks.onComplete(code)
      },
    })
    return {
      pid: proc.child.pid || 0,
      kill: () => {
        try {
          proc.child.kill('SIGTERM')
        } catch {
          /* already dead */
        }
      },
      promise: proc.promise,
    }
  }

  // Session path: --session-id to create (seed with history), --resume to
  // continue. If the first strategy hits a session fault before any content
  // streams, transparently retry with the other strategy.
  const convId = conversationId as string
  let resolveFinal!: (code: number) => void
  const promise = new Promise<number>((res) => {
    resolveFinal = res
  })
  let current!: { child: ChildProcess; promise: Promise<number> }

  const launch = (strategy: 'create' | 'resume', isRetry: boolean) => {
    const sessionArgs = strategy === 'create' ? ['--session-id', convId] : ['--resume', convId]
    const fullPrompt = buildFullPrompt(strategy === 'create')
    const args = ['-p', fullPrompt, ...baseArgs, ...sessionArgs]
    console.log(
      'Spawning claude:',
      claudePath,
      `(session ${strategy}${isRetry ? ' retry' : ''})`,
      'len',
      fullPrompt.length,
    )

    let sawContent = false
    let sessionFault = false

    current = runClaudeProcess(claudePath, args, env, {
      onText: (t) => {
        sawContent = true
        callbacks.onText(t)
      },
      onActivity: (a) => {
        if (a.type === 'tool_start' || a.type === 'tool_input' || a.type === 'tool_end') {
          sawContent = true
        }
        // Suppress the failed attempt's terminal "all_complete" before a retry.
        if (sessionFault && !sawContent && a.type === 'all_complete') return
        callbacks.onActivity(a)
      },
      onPlan: callbacks.onPlan,
      onError: (msg) => {
        if (!sawContent && (msg.includes(SESSION_NOT_FOUND) || msg.includes(SESSION_IN_USE))) {
          sessionFault = true
          return // swallow; handled in onComplete
        }
        callbacks.onError(msg)
      },
      onComplete: (code) => {
        if (sessionFault && !sawContent && !isRetry) {
          // In-process tracking disagrees with on-disk sessions: flip strategy
          // and try once more.
          launch(strategy === 'create' ? 'resume' : 'create', true)
          return
        }
        if (code === 0) establishedSessions.add(convId)
        else if (sessionFault) establishedSessions.delete(convId)
        cleanupTempFiles()
        callbacks.onComplete(code)
        resolveFinal(code)
      },
    })
  }

  launch(establishedSessions.has(convId) ? 'resume' : 'create', false)

  return {
    pid: current.child.pid || 0,
    kill: () => {
      try {
        current?.child.kill('SIGTERM')
      } catch {
        /* already dead */
      }
    },
    promise,
  }
}

/**
 * Low-level: spawn a single `claude -p` process for the given args and stream
 * stdout/stderr through the callbacks. Session strategy and temp-file lifecycle
 * are handled by spawnClaude.
 */
function runClaudeProcess(
  claudePath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  callbacks: RunnerCallbacks,
): { child: ChildProcess; promise: Promise<number> } {
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
          const textContent = event.message?.content?.find(
            (c: { type: string }) => c.type === 'text',
          )
          if (textContent?.text) {
            const text = textContent.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
            if (text.trim()) {
              callbacks.onText(text)
            }
          }
          const toolUseBlocks =
            event.message?.content?.filter((c: { type: string }) => c.type === 'tool_use') || []
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
            const toolId = String(event.content_block.id)
            currentToolId = toolId
            toolInputs[toolId] = ''
            toolNames[toolId] = event.content_block.name
            callbacks.onActivity({
              type: 'tool_start',
              tool: event.content_block.name,
              id: event.content_block.id,
            })
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta' && event.delta?.text) {
            const text = event.delta.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
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
          const toolResults =
            event.message?.content?.filter((c: { type: string }) => c.type === 'tool_result') || []
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

  const promise = new Promise<number>((resolve) => {
    claude.on('close', (code) => {
      callbacks.onComplete(code || 0)
      resolve(code || 0)
    })

    claude.on('error', (err) => {
      callbacks.onError(err.message)
      callbacks.onComplete(1)
      resolve(1)
    })
  })

  return { child: claude, promise }
}
