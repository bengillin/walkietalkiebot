import { existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface Mode {
  name: string
  label: string
  description: string
  icon: string
  instruction: string
  planDetection: boolean
}

export interface ModeInfo {
  name: string
  label: string
  description: string
  icon: string
}

const BUILT_IN_MODES: [Mode, ...Mode[]] = [
  {
    name: 'voice',
    label: 'Voice',
    description: 'Brief, spoken responses',
    icon: '🎙️',
    instruction:
      'Keep responses to 1-2 sentences, no markdown, speak naturally. Be direct and concise — your responses are spoken aloud.',
    planDetection: false,
  },
  {
    name: 'pair',
    label: 'Pair',
    description: 'Collaborative coding partner',
    icon: '👥',
    instruction:
      'You are a pair programming partner. Think out loud about your approach. Ask clarifying questions before making big changes. Explain your reasoning as you go. Use markdown for code blocks.',
    planDetection: false,
  },
  {
    name: 'architect',
    label: 'Architect',
    description: 'Systems thinking and trade-offs',
    icon: '🏗️',
    instruction:
      'Think in systems. Consider trade-offs, scalability, and maintainability. Ask clarifying questions before proposing solutions. Use structured output with headers and lists. Be thorough — detail matters more than brevity.',
    planDetection: true,
  },
  {
    name: 'code-review',
    label: 'Code Review',
    description: 'Thorough code analysis',
    icon: '🔍',
    instruction:
      'Review code for bugs, security issues, performance problems, and style. Be specific — reference file paths and line numbers. Categorize findings by severity. Suggest concrete fixes, not vague improvements.',
    planDetection: false,
  },
  {
    name: 'debug',
    label: 'Debug',
    description: 'Systematic problem diagnosis',
    icon: '🐛',
    instruction:
      "Diagnose problems step by step. Read error messages and logs carefully. Form hypotheses and test them. Don't guess — verify. Ask for specific information when needed. Suggest targeted fixes with clear reasoning.",
    planDetection: false,
  },
]

const MODES_DIR = join(homedir(), '.wtb', 'modes')

function loadCustomModes(): Mode[] {
  if (!existsSync(MODES_DIR)) return []

  const modes: Mode[] = []
  let files: string[]
  try {
    files = readdirSync(MODES_DIR).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }

  for (const file of files) {
    try {
      const content = readFileSync(join(MODES_DIR, file), 'utf-8')
      const mode = JSON.parse(content) as Partial<Mode>
      if (mode.name && mode.label && mode.instruction) {
        modes.push({
          name: mode.name,
          label: mode.label,
          description: mode.description || '',
          icon: mode.icon || '⚙️',
          instruction: mode.instruction,
          planDetection: mode.planDetection ?? false,
        })
      } else {
        console.warn(`Skipping mode ${file}: missing required fields (name, label, instruction)`)
      }
    } catch (err) {
      console.warn(`Failed to load mode ${file}:`, err)
    }
  }
  return modes
}

let cachedModes: Mode[] | null = null

function getAllModes(): Mode[] {
  if (!cachedModes) {
    const custom = loadCustomModes()
    const customNames = new Set(custom.map((m) => m.name))
    // Custom modes override built-ins with the same name
    cachedModes = [...BUILT_IN_MODES.filter((m) => !customNames.has(m.name)), ...custom]
  }
  return cachedModes
}

export function getModes(): Mode[] {
  return getAllModes()
}

export function getMode(name: string): Mode {
  // Voice is the first built-in and the documented default.
  return getAllModes().find((m) => m.name === name) ?? BUILT_IN_MODES[0]
}

export function getModeInfoList(): ModeInfo[] {
  return getAllModes().map(({ name, label, description, icon }) => ({
    name,
    label,
    description,
    icon,
  }))
}

export function reloadModes(): void {
  cachedModes = null
}
