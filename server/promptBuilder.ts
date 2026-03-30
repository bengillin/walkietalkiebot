import type { Mode } from './modes.js'

export interface PromptInput {
  message: string
  mode: Mode
  history?: Array<{ role: string; content: string }>
  imagePaths?: string[]
}

export function buildPrompt(input: PromptInput): string {
  const { message, mode, history, imagePaths } = input
  const blocks: string[] = []

  // Context block: recent conversation history
  if (history && history.length > 0) {
    const recent = history.slice(-10)
    blocks.push(
      '[Recent conversation]\n' +
      recent.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') +
      '\n[/Recent conversation]'
    )
  }

  // Image block: attached image file paths
  if (imagePaths && imagePaths.length > 0) {
    blocks.push(
      '[Attached Images - Use the Read tool to view these image files]\n' +
      imagePaths.join('\n') +
      '\n[/Attached Images]'
    )
  }

  // Mode instruction block
  blocks.push(`[MODE: ${mode.label}]\n${mode.instruction}\n[/MODE]`)

  // Plan detection block (only for modes that want it)
  if (mode.planDetection) {
    blocks.push(
      '[PLAN OUTPUT - If you produce a detailed plan, write it to /tmp/wtb-plan.md using the Write tool, then give a brief summary of what you planned.]'
    )
  }

  // User message
  blocks.push(`User: ${message}`)

  return blocks.join('\n\n')
}
