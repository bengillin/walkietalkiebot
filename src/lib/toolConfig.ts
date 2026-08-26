// Centralized tool identity system
// Single source of truth for icons, labels, categories, and display names

export type ToolCategory = 'fs' | 'exec' | 'voice' | 'data' | 'plan' | 'media'

export interface ToolIdentity {
  icon: string
  label: string
  displayName: string
  category: ToolCategory
}

export const TOOL_CATEGORIES: Record<ToolCategory, { label: string; cssClass: string }> = {
  fs: { label: 'File System', cssClass: 'tool-cat--fs' },
  exec: { label: 'Execution', cssClass: 'tool-cat--exec' },
  voice: { label: 'Voice', cssClass: 'tool-cat--voice' },
  data: { label: 'Data', cssClass: 'tool-cat--data' },
  plan: { label: 'Plans', cssClass: 'tool-cat--plan' },
  media: { label: 'Media', cssClass: 'tool-cat--media' },
}

// Keyed by lowercase canonical name
const TOOL_REGISTRY: Record<string, ToolIdentity> = {
  // Claude Code built-in tools
  read: { icon: '📖', label: 'Reading file', displayName: 'Read', category: 'fs' },
  edit: { icon: '✏️', label: 'Editing file', displayName: 'Edit', category: 'fs' },
  write: { icon: '📝', label: 'Writing file', displayName: 'Write', category: 'fs' },
  bash: { icon: '⚡', label: 'Running command', displayName: 'Bash', category: 'exec' },
  glob: { icon: '🔍', label: 'Finding files', displayName: 'Glob', category: 'fs' },
  grep: { icon: '🔎', label: 'Searching code', displayName: 'Grep', category: 'fs' },
  task: { icon: '📋', label: 'Running task', displayName: 'Task', category: 'exec' },
  taskcreate: { icon: '📋', label: 'Creating task', displayName: 'TaskCreate', category: 'exec' },
  taskupdate: { icon: '📋', label: 'Updating task', displayName: 'TaskUpdate', category: 'exec' },
  tasklist: { icon: '📋', label: 'Listing tasks', displayName: 'TaskList', category: 'exec' },
  taskget: { icon: '📋', label: 'Getting task', displayName: 'TaskGet', category: 'exec' },
  webfetch: { icon: '🌐', label: 'Fetching web page', displayName: 'WebFetch', category: 'media' },
  websearch: { icon: '🔎', label: 'Searching web', displayName: 'WebSearch', category: 'media' },

  // WTB MCP tools — Core & Voice
  launch_wtb: { icon: '🚀', label: 'Launching WTB', displayName: 'Launch', category: 'voice' },
  get_wtb_status: {
    icon: '📡',
    label: 'Checking status',
    displayName: 'Status',
    category: 'voice',
  },
  get_transcript: {
    icon: '🎙️',
    label: 'Getting transcript',
    displayName: 'Transcript',
    category: 'voice',
  },
  get_conversation_history: {
    icon: '📜',
    label: 'Loading history',
    displayName: 'History',
    category: 'voice',
  },
  get_pending_message: {
    icon: '💬',
    label: 'Checking messages',
    displayName: 'Pending',
    category: 'voice',
  },
  respond_to_wtb: {
    icon: '💬',
    label: 'Sending response',
    displayName: 'Respond',
    category: 'voice',
  },
  update_wtb_state: {
    icon: '🔄',
    label: 'Updating state',
    displayName: 'State',
    category: 'voice',
  },

  // WTB MCP tools — Session & Media
  get_claude_session: {
    icon: '🔗',
    label: 'Getting session',
    displayName: 'Session',
    category: 'media',
  },
  set_claude_session: {
    icon: '🔗',
    label: 'Setting session',
    displayName: 'Session',
    category: 'media',
  },
  disconnect_claude_session: {
    icon: '🔗',
    label: 'Disconnecting session',
    displayName: 'Disconnect',
    category: 'media',
  },
  analyze_image: {
    icon: '🖼️',
    label: 'Analyzing image',
    displayName: 'Analyze Image',
    category: 'media',
  },
  open_url: { icon: '🌐', label: 'Opening URL', displayName: 'Open URL', category: 'media' },

  // WTB MCP tools — Jobs
  create_wtb_job: {
    icon: '⏳',
    label: 'Creating job',
    displayName: 'Create Job',
    category: 'plan',
  },
  get_wtb_job: { icon: '⏳', label: 'Checking job', displayName: 'Job Status', category: 'plan' },
  list_wtb_jobs: { icon: '⏳', label: 'Listing jobs', displayName: 'Jobs', category: 'plan' },

  // WTB MCP tools — Conversations
  list_conversations: {
    icon: '📚',
    label: 'Listing conversations',
    displayName: 'Conversations',
    category: 'data',
  },
  get_conversation: {
    icon: '📚',
    label: 'Loading conversation',
    displayName: 'Conversation',
    category: 'data',
  },
  create_conversation: {
    icon: '📚',
    label: 'Creating conversation',
    displayName: 'New Tape',
    category: 'data',
  },
  rename_conversation: {
    icon: '📚',
    label: 'Renaming conversation',
    displayName: 'Rename',
    category: 'data',
  },
  delete_conversation: {
    icon: '🗑️',
    label: 'Deleting conversation',
    displayName: 'Delete',
    category: 'data',
  },

  // WTB MCP tools — Search & Messages
  search_conversations: {
    icon: '🔍',
    label: 'Searching conversations',
    displayName: 'Search',
    category: 'data',
  },
  add_message: {
    icon: '💬',
    label: 'Adding message',
    displayName: 'Add Message',
    category: 'data',
  },

  // WTB MCP tools — Plans
  list_plans: { icon: '📐', label: 'Listing plans', displayName: 'Plans', category: 'plan' },
  get_plan: { icon: '📐', label: 'Loading plan', displayName: 'Plan', category: 'plan' },
  create_plan: { icon: '📐', label: 'Creating plan', displayName: 'New Plan', category: 'plan' },
  update_plan: { icon: '📐', label: 'Updating plan', displayName: 'Update Plan', category: 'plan' },
  delete_plan: { icon: '🗑️', label: 'Deleting plan', displayName: 'Delete Plan', category: 'plan' },

  // WTB MCP tools — Liner Notes & Export
  get_liner_notes: {
    icon: '🏷️',
    label: 'Loading liner notes',
    displayName: 'Liner Notes',
    category: 'data',
  },
  set_liner_notes: {
    icon: '🏷️',
    label: 'Saving liner notes',
    displayName: 'Liner Notes',
    category: 'data',
  },
  export_conversation: {
    icon: '📤',
    label: 'Exporting conversation',
    displayName: 'Export',
    category: 'data',
  },
}

const DEFAULT_IDENTITY: ToolIdentity = {
  icon: '🔧',
  label: 'Working',
  displayName: 'Tool',
  category: 'exec',
}

/**
 * Strip MCP prefix from tool name.
 * "mcp__wtb__launch_wtb" → "launch_wtb"
 * "Read" → "Read"
 */
export function parseToolName(rawName: string): string {
  if (!rawName) return ''
  return rawName.match(/^mcp__[^_]+__(.+)$/)?.[1] ?? rawName
}

/**
 * Get full identity for a tool. Case-insensitive, handles MCP prefixes.
 */
export function getToolIdentity(rawName: string): ToolIdentity {
  const parsed = parseToolName(rawName)
  return (
    TOOL_REGISTRY[parsed.toLowerCase()] || {
      ...DEFAULT_IDENTITY,
      displayName: parsed || 'Tool',
      label: parsed || 'Working',
    }
  )
}

/** Get emoji icon for a tool. */
export function getToolIcon(rawName: string): string {
  return getToolIdentity(rawName).icon
}

/** Get human-readable action label (e.g. "Reading file"). */
export function getToolLabel(rawName: string): string {
  return getToolIdentity(rawName).label
}

/** Get CSS class for a tool's category. */
export function getToolCategoryClass(rawName: string): string {
  const identity = getToolIdentity(rawName)
  return TOOL_CATEGORIES[identity.category].cssClass
}

/** Get clean display name (e.g. "Read", "Conversations"). */
export function getToolDisplayName(rawName: string): string {
  return getToolIdentity(rawName).displayName
}
