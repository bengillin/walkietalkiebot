import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import {
  assertSafeBind,
  hostnameOf,
  isLoopbackHost,
  requestGuard,
  resolveBindHost,
  resolveBindHosts,
} from './security.js'

function makeApp() {
  const app = new Hono()
  app.use('*', requestGuard)
  app.get('/api/ping', (c) => c.json({ ok: true }))
  app.post('/api/run', (c) => c.json({ ran: true }))
  app.get('/', (c) => c.html('<h1>app</h1>'))
  return app
}

const LOCAL = { Host: 'localhost:5173' }

describe('isLoopbackHost', () => {
  it.each(['localhost', 'LOCALHOST', 'app.localhost', '127.0.0.1', '127.8.9.10', '::1', '[::1]'])(
    'accepts %s',
    (h) => expect(isLoopbackHost(h)).toBe(true),
  )
  it.each(['0.0.0.0', '192.168.1.5', 'evil.example', 'localhost.evil.example', '::', '128.0.0.1'])(
    'rejects %s',
    (h) => expect(isLoopbackHost(h)).toBe(false),
  )
})

describe('hostnameOf', () => {
  it('strips ports and IPv6 brackets', () => {
    expect(hostnameOf('localhost:5173')).toBe('localhost')
    expect(hostnameOf('[::1]:5173')).toBe('::1')
    expect(hostnameOf(undefined)).toBeNull()
  })
})

describe('bind host', () => {
  beforeEach(() => {
    delete process.env.WTB_HOST
    delete process.env.WTB_AUTH_TOKEN
  })
  afterEach(() => {
    delete process.env.WTB_HOST
    delete process.env.WTB_AUTH_TOKEN
  })

  it('defaults to loopback', () => {
    expect(resolveBindHost()).toBe('127.0.0.1')
  })

  it('honors WTB_HOST', () => {
    process.env.WTB_HOST = '0.0.0.0'
    expect(resolveBindHost()).toBe('0.0.0.0')
  })

  it('refuses a non-loopback bind without a token, and explains how to fix it', () => {
    expect(() => assertSafeBind('0.0.0.0')).toThrow(/WTB_AUTH_TOKEN/)
    expect(() => assertSafeBind('100.64.0.1')).toThrow(/Refusing to listen/)
  })

  it('allows a non-loopback bind once a token is set', () => {
    process.env.WTB_AUTH_TOKEN = 'secret'
    expect(() => assertSafeBind('0.0.0.0')).not.toThrow()
  })

  it('listens on both loopback addresses by default, so nothing can sit on ::1', () => {
    expect(resolveBindHosts()).toEqual(['127.0.0.1', '::1'])
    process.env.WTB_HOST = '100.64.0.1'
    expect(resolveBindHosts()).toEqual(['100.64.0.1'])
  })

  it('does not trust *.localhost names as bind addresses (they can map anywhere)', () => {
    expect(() => assertSafeBind('box.localhost')).toThrow(/WTB_AUTH_TOKEN/)
  })

  it('always allows loopback', () => {
    expect(() => assertSafeBind('127.0.0.1')).not.toThrow()
    expect(() => assertSafeBind('localhost')).not.toThrow()
  })
})

describe('requestGuard without a token', () => {
  beforeEach(() => {
    delete process.env.WTB_AUTH_TOKEN
  })

  it('serves same-origin requests', async () => {
    const res = await makeApp().request('/api/ping', { headers: LOCAL })
    expect(res.status).toBe(200)
  })

  it('rejects a non-loopback Host header (DNS rebinding)', async () => {
    const res = await makeApp().request('/api/ping', { headers: { Host: 'attacker.example:5173' } })
    expect(res.status).toBe(403)
  })

  it('rejects a cross-origin API write, even as a no-preflight text/plain request', async () => {
    const res = await makeApp().request('/api/run', {
      method: 'POST',
      headers: { ...LOCAL, Origin: 'https://evil.example', 'Content-Type': 'text/plain' },
      body: '{"message":"rm -rf ~"}',
    })
    expect(res.status).toBe(403)
  })

  it('rejects the "null" origin sent by sandboxed frames', async () => {
    const res = await makeApp().request('/api/ping', { headers: { ...LOCAL, Origin: 'null' } })
    expect(res.status).toBe(403)
  })

  it('rejects requests the browser marks as cross-site', async () => {
    const res = await makeApp().request('/api/ping', {
      headers: { ...LOCAL, 'Sec-Fetch-Site': 'cross-site' },
    })
    expect(res.status).toBe(403)
  })

  it('accepts a same-origin JSON write from the web UI', async () => {
    const res = await makeApp().request('/api/run', {
      method: 'POST',
      headers: { ...LOCAL, Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  it('accepts a JSON write with no Origin (MCP proxy, curl)', async () => {
    const res = await makeApp().request('/api/run', {
      method: 'POST',
      headers: { ...LOCAL, 'Content-Type': 'application/json; charset=utf-8' },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  it('rejects a write whose body is not JSON', async () => {
    const res = await makeApp().request('/api/run', {
      method: 'POST',
      headers: { ...LOCAL, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'message=hi',
    })
    expect(res.status).toBe(415)
  })

  it('does not apply API origin rules to static pages', async () => {
    const res = await makeApp().request('/', {
      headers: { ...LOCAL, Origin: 'https://evil.example' },
    })
    expect(res.status).toBe(200)
  })
})

describe('requestGuard with a token', () => {
  beforeEach(() => {
    process.env.WTB_AUTH_TOKEN = 'secret'
  })
  afterEach(() => {
    delete process.env.WTB_AUTH_TOKEN
  })

  it('allows non-loopback Host names (Tailscale / LAN), leaving the check to auth', async () => {
    const res = await makeApp().request('/api/ping', { headers: { Host: 'mybox.tail1234.ts.net' } })
    expect(res.status).toBe(200)
  })

  it('still rejects cross-origin API requests', async () => {
    const res = await makeApp().request('/api/ping', {
      headers: { Host: 'mybox.tail1234.ts.net', Origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })
})
