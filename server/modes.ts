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

const BUILT_IN_MODES: Mode[] = [
  {
    name: 'voice',
    label: 'Voice',
    description: 'Brief, spoken responses',
    icon: '🎙️',
    instruction: 'Keep responses to 1-2 sentences, no markdown, speak naturally. Be direct and concise — your responses are spoken aloud.',
    planDetection: false,
  },
  {
    name: 'pair',
    label: 'Pair',
    description: 'Collaborative coding partner',
    icon: '👥',
    instruction: 'You are a pair programming partner. Think out loud about your approach. Ask clarifying questions before making big changes. Explain your reasoning as you go. Use markdown for code blocks.',
    planDetection: false,
  },
  {
    name: 'architect',
    label: 'Architect',
    description: 'Systems thinking and trade-offs',
    icon: '🏗️',
    instruction: 'Think in systems. Consider trade-offs, scalability, and maintainability. Ask clarifying questions before proposing solutions. Use structured output with headers and lists. Be thorough — detail matters more than brevity.',
    planDetection: true,
  },
  {
    name: 'code-review',
    label: 'Code Review',
    description: 'Thorough code analysis',
    icon: '🔍',
    instruction: 'Review code for bugs, security issues, performance problems, and style. Be specific — reference file paths and line numbers. Categorize findings by severity. Suggest concrete fixes, not vague improvements.',
    planDetection: false,
  },
  {
    name: 'debug',
    label: 'Debug',
    description: 'Systematic problem diagnosis',
    icon: '🐛',
    instruction: 'Diagnose problems step by step. Read error messages and logs carefully. Form hypotheses and test them. Don\'t guess — verify. Ask for specific information when needed. Suggest targeted fixes with clear reasoning.',
    planDetection: false,
  },
]

export function getModes(): Mode[] {
  return BUILT_IN_MODES
}

export function getMode(name: string): Mode {
  return BUILT_IN_MODES.find(m => m.name === name) || BUILT_IN_MODES[0]
}

export function getModeInfoList(): ModeInfo[] {
  return BUILT_IN_MODES.map(({ name, label, description, icon }) => ({ name, label, description, icon }))
}
