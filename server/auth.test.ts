import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { authMiddleware, getAuthToken } from './auth.js'

function makeApp() {
  const app = new Hono()
  app.use('*', authMiddleware)
  app.get('/api/ping', (c) => c.json({ ok: true }))
  app.get('/', (c) => c.html('<h1>app</h1>'))
  return app
}

const TOKEN = 'sekret-token-123'

describe('authMiddleware', () => {
  beforeEach(() => {
    delete process.env.WTB_AUTH_TOKEN
  })
  afterEach(() => {
    delete process.env.WTB_AUTH_TOKEN
  })

  it('is a no-op when no token is configured', async () => {
    const app = makeApp()
    expect(getAuthToken()).toBeNull()
    const res = await app.request('/api/ping')
    expect(res.status).toBe(200)
  })

  it('rejects API requests with no credentials when a token is set', async () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    const app = makeApp()
    const res = await app.request('/api/ping')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('accepts a correct Bearer token', async () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    const app = makeApp()
    const res = await app.request('/api/ping', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('rejects an incorrect Bearer token', async () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    const app = makeApp()
    const res = await app.request('/api/ping', {
      headers: { Authorization: 'Bearer wrong' },
    })
    expect(res.status).toBe(401)
  })

  it('serves a sign-in page (not JSON) for unauthenticated browser navigation', async () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    const app = makeApp()
    const res = await app.request('/')
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('Access token')
  })

  it('sets a cookie and redirects when given a valid ?token= query param', async () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    const app = makeApp()
    const res = await app.request(`/?token=${TOKEN}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain('wtb_token=')
    expect(setCookie).toContain('HttpOnly')
  })

  it('accepts the cookie issued by the token redirect', async () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    const app = makeApp()
    const res = await app.request('/api/ping', {
      headers: { Cookie: `wtb_token=${TOKEN}` },
    })
    expect(res.status).toBe(200)
  })
})
