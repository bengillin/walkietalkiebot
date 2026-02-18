import { describe, it, expect } from 'vitest'
import {
  parseToolName,
  getToolIdentity,
  getToolIcon,
  getToolLabel,
  getToolCategoryClass,
  getToolDisplayName,
} from './toolConfig'

describe('parseToolName', () => {
  it('strips mcp__talkie__ prefix', () => {
    expect(parseToolName('mcp__talkie__launch_talkie')).toBe('launch_talkie')
  })

  it('strips any mcp server prefix', () => {
    expect(parseToolName('mcp__figextract__parse_fig_file')).toBe('parse_fig_file')
  })

  it('passes through plain names', () => {
    expect(parseToolName('Read')).toBe('Read')
    expect(parseToolName('bash')).toBe('bash')
  })

  it('handles empty string', () => {
    expect(parseToolName('')).toBe('')
  })
})

describe('getToolIdentity', () => {
  it('finds Claude Code tools case-insensitively', () => {
    expect(getToolIdentity('Read').icon).toBe('📖')
    expect(getToolIdentity('read').icon).toBe('📖')
    expect(getToolIdentity('READ').icon).toBe('📖')
  })

  it('finds MCP tools after prefix stripping', () => {
    const identity = getToolIdentity('mcp__talkie__launch_talkie')
    expect(identity.icon).toBe('🚀')
    expect(identity.category).toBe('voice')
    expect(identity.displayName).toBe('Launch')
  })

  it('finds all Claude Code built-in tools', () => {
    expect(getToolIdentity('Edit').category).toBe('fs')
    expect(getToolIdentity('Write').category).toBe('fs')
    expect(getToolIdentity('Bash').category).toBe('exec')
    expect(getToolIdentity('Glob').category).toBe('fs')
    expect(getToolIdentity('Grep').category).toBe('fs')
    expect(getToolIdentity('Task').category).toBe('exec')
  })

  it('finds all Talkie MCP conversation tools', () => {
    expect(getToolIdentity('list_conversations').category).toBe('data')
    expect(getToolIdentity('get_conversation').category).toBe('data')
    expect(getToolIdentity('create_conversation').category).toBe('data')
    expect(getToolIdentity('search_conversations').category).toBe('data')
    expect(getToolIdentity('export_conversation').category).toBe('data')
  })

  it('finds all Talkie MCP plan tools', () => {
    expect(getToolIdentity('list_plans').category).toBe('plan')
    expect(getToolIdentity('create_plan').category).toBe('plan')
    expect(getToolIdentity('update_plan').category).toBe('plan')
    expect(getToolIdentity('create_talkie_job').category).toBe('plan')
  })

  it('returns default for unknown tools', () => {
    const identity = getToolIdentity('unknown_tool')
    expect(identity.icon).toBe('🔧')
    expect(identity.displayName).toBe('unknown_tool')
  })
})

describe('getToolIcon', () => {
  it('returns correct icons', () => {
    expect(getToolIcon('Read')).toBe('📖')
    expect(getToolIcon('Bash')).toBe('⚡')
    expect(getToolIcon('mcp__talkie__get_transcript')).toBe('🎙️')
    expect(getToolIcon('unknown')).toBe('🔧')
  })
})

describe('getToolLabel', () => {
  it('returns human-readable labels', () => {
    expect(getToolLabel('Read')).toBe('Reading file')
    expect(getToolLabel('Bash')).toBe('Running command')
    expect(getToolLabel('mcp__talkie__launch_talkie')).toBe('Launching Talkie')
  })
})

describe('getToolCategoryClass', () => {
  it('returns correct CSS classes', () => {
    expect(getToolCategoryClass('Read')).toBe('tool-cat--fs')
    expect(getToolCategoryClass('Bash')).toBe('tool-cat--exec')
    expect(getToolCategoryClass('mcp__talkie__get_transcript')).toBe('tool-cat--voice')
    expect(getToolCategoryClass('mcp__talkie__list_conversations')).toBe('tool-cat--data')
    expect(getToolCategoryClass('mcp__talkie__create_plan')).toBe('tool-cat--plan')
    expect(getToolCategoryClass('mcp__talkie__analyze_image')).toBe('tool-cat--media')
  })
})

describe('getToolDisplayName', () => {
  it('returns clean display names', () => {
    expect(getToolDisplayName('Read')).toBe('Read')
    expect(getToolDisplayName('mcp__talkie__list_conversations')).toBe('Conversations')
    expect(getToolDisplayName('mcp__talkie__launch_talkie')).toBe('Launch')
    expect(getToolDisplayName('unknown')).toBe('unknown')
  })
})
