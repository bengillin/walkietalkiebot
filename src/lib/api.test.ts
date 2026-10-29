import { describe, it, expect, vi, afterEach } from 'vitest'
import { deleteConversation } from './api'

afterEach(() => vi.unstubAllGlobals())

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )
}

describe('deleteConversation', () => {
  it('treats a tape that is already gone (404) as deleted', async () => {
    respond(404, { error: 'Conversation not found' })
    await expect(deleteConversation('gone')).resolves.toEqual({ success: true })
  })

  it('still reports other failures', async () => {
    respond(500, { error: 'disk full' })
    await expect(deleteConversation('x')).rejects.toThrow('disk full')
  })
})
