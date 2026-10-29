import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { authMiddleware, getAuthToken, hasValidCredentials } from './auth.js'

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

describe('hasValidCredentials', () => {
  afterEach(() => {
    delete process.env.WTB_AUTH_TOKEN
  })

  it('passes everything when auth is off', () => {
    expect(hasValidCredentials(undefined, undefined)).toBe(true)
  })

  it('checks bearer tokens and the wtb_token cookie', () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    expect(hasValidCredentials(undefined, undefined)).toBe(false)
    expect(hasValidCredentials(`Bearer ${TOKEN}`, undefined)).toBe(true)
    expect(hasValidCredentials('Bearer nope', undefined)).toBe(false)
    expect(hasValidCredentials(undefined, `a=1; wtb_token=${TOKEN}; b=2`)).toBe(true)
    expect(hasValidCredentials(undefined, 'wtb_token=nope')).toBe(false)
  })
})

describe('auth cookie', () => {
  afterEach(() => {
    delete process.env.WTB_AUTH_TOKEN
  })

  it('is Secure when served over HTTPS', async () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    const res = await makeApp().request(`https://box.example/?token=${TOKEN}`)
    expect(res.headers.get('set-cookie')).toMatch(/Secure/)
  })

  it('is not Secure over plain-HTTP localhost, where browsers would drop it', async () => {
    process.env.WTB_AUTH_TOKEN = TOKEN
    const res = await makeApp().request(`http://localhost/?token=${TOKEN}`)
    expect(res.headers.get('set-cookie')).not.toMatch(/Secure/)
  })
})
