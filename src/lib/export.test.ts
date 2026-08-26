import { describe, it, expect } from 'vitest'
import { exportAsMarkdown, exportAsJson, parseImportJson } from './export'
import type { Conversation } from '../types'

const mockConversation: Conversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  messages: [
    { id: 'msg-1', role: 'user', content: 'Hello', timestamp: 1700000000000 },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: 1700000001000,
      images: [
        {
          id: 'img-1',
          dataUrl: 'data:image/png;base64,abc',
          fileName: 'screenshot.png',
          description: 'A screenshot',
        },
      ],
    },
  ],
  activities: [
    {
      id: 'act-1',
      tool: 'Read',
      input: '/src/main.ts',
      status: 'complete',
      timestamp: 1700000000500,
      duration: 120,
    },
    {
      id: 'act-2',
      tool: 'Bash',
      input: 'npm test',
      status: 'error',
      timestamp: 1700000000600,
      error: 'Failed',
    },
  ],
  linerNotes: 'Some notes here',
  mode: 'architect',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
}

describe('exportAsMarkdown', () => {
  it('includes title and messages', () => {
    const md = exportAsMarkdown(mockConversation)
    expect(md).toContain('# Test Conversation')
    expect(md).toContain('### You')
    expect(md).toContain('Hello')
    expect(md).toContain('### Talkie')
    expect(md).toContain('Hi there!')
  })

  it('includes image references', () => {
    const md = exportAsMarkdown(mockConversation)
    expect(md).toContain('screenshot.png')
    expect(md).toContain('A screenshot')
  })

  it('includes tool activity summary', () => {
    const md = exportAsMarkdown(mockConversation)
    expect(md).toContain('## Tool Activity')
    expect(md).toContain('**Read**')
    expect(md).toContain('/src/main.ts')
    expect(md).toContain('**Bash**')
    expect(md).toContain('(error)')
  })

  it('includes liner notes', () => {
    const md = exportAsMarkdown(mockConversation)
    expect(md).toContain('## Liner Notes')
    expect(md).toContain('Some notes here')
  })
})

describe('exportAsJson', () => {
  it('includes version field', () => {
    const json = JSON.parse(exportAsJson(mockConversation))
    expect(json.version).toBe(1)
  })

  it('includes mode', () => {
    const json = JSON.parse(exportAsJson(mockConversation))
    expect(json.mode).toBe('architect')
  })

  it('includes activities', () => {
    const json = JSON.parse(exportAsJson(mockConversation))
    expect(json.activities).toHaveLength(2)
    expect(json.activities[0]?.tool).toBe('Read')
  })

  it('includes image metadata without dataUrl', () => {
    const json = JSON.parse(exportAsJson(mockConversation))
    const assistantMsg = json.messages[1]
    expect(assistantMsg.images).toHaveLength(1)
    expect(assistantMsg.images[0].fileName).toBe('screenshot.png')
    expect(assistantMsg.images[0].dataUrl).toBeUndefined()
  })
})

describe('parseImportJson', () => {
  it('parses valid export JSON', () => {
    const exported = exportAsJson(mockConversation)
    const imported = parseImportJson(exported)

    expect(imported.title).toBe('Test Conversation')
    expect(imported.messages).toHaveLength(2)
    expect(imported.messages[0]?.role).toBe('user')
    expect(imported.messages[0]?.content).toBe('Hello')
    expect(imported.mode).toBe('architect')
    expect(imported.linerNotes).toBe('Some notes here')
  })

  it('throws on missing title', () => {
    expect(() => parseImportJson('{"messages":[]}')).toThrow('missing title')
  })

  it('throws on missing messages', () => {
    expect(() => parseImportJson('{"title":"Test"}')).toThrow('missing title or messages')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseImportJson('not json')).toThrow()
  })

  it('handles minimal valid input', () => {
    const imported = parseImportJson('{"title":"Min","messages":[{"role":"user","content":"hi"}]}')
    expect(imported.title).toBe('Min')
    expect(imported.messages).toHaveLength(1)
    expect(imported.mode).toBeUndefined()
  })
})
