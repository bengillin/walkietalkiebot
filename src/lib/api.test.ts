import { describe, it, expect, vi, afterEach } from 'vitest'
import { deleteConversation, getConversation } from './api'

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

describe('fetchJson', () => {
  it('gives every request a timeout, so a hung one fails and can be retried', async () => {
    respond(200, { id: 'a' })
    await getConversation('a')
    const init = vi.mocked(fetch).mock.calls[0]?.[1]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports the HTTP status, so callers can tell "gone" from "failed"', async () => {
    respond(404, { error: 'Conversation not found' })
    await expect(getConversation('gone')).rejects.toMatchObject({
      status: 404,
      message: 'Conversation not found',
    })
  })
})
