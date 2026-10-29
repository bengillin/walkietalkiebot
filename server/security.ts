import type { Context, Next } from 'hono'

import { getAuthToken } from './auth.js'

/**
 * Network-facing safety rails. The API spawns `claude -p --permission-mode
 * bypassPermissions`, so anything that can reach it can run commands as the user.
 * Three things keep "reach it" narrow:
 *
 *  1. Bind to loopback by default, and refuse a non-loopback bind without a token.
 *  2. Reject cross-site requests (no CORS, Origin / Sec-Fetch-Site checks, JSON-only
 *     writes), so a web page the user happens to visit can't drive the API.
 *  3. Without a token, accept only loopback Host headers, which defeats DNS rebinding.
 *     With a token, a rebound origin has no credentials, so the check is unnecessary
 *     (and would break access via a Tailscale or LAN name).
 */

export const DEFAULT_BIND_HOST = '127.0.0.1'

/** Host to listen on: `WTB_HOST`, or loopback. */
export function resolveBindHost(): string {
  const host = process.env.WTB_HOST?.trim()
  return host && host.length > 0 ? host : DEFAULT_BIND_HOST
}

/** True for names and addresses that only this machine can reach. */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h)
  )
}

/**
 * Throws if binding `host` would expose an unauthenticated server to the network.
 * The message is shown to the user as-is, so it says how to fix it.
 */
export function assertSafeBind(host: string): void {
  if (isLoopbackHost(host) || getAuthToken()) return
  throw new Error(
    `Refusing to listen on ${host} without authentication. Anyone who can reach this ` +
      `address could run commands on this machine through Claude Code.\n` +
      `Set WTB_AUTH_TOKEN (e.g. export WTB_AUTH_TOKEN="$(openssl rand -hex 32)"), ` +
      `or unset WTB_HOST to listen on ${DEFAULT_BIND_HOST} only.`,
  )
}

/** Hostname part of a Host header value: `localhost:5173` → `localhost`, `[::1]:80` → `::1`. */
export function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null
  try {
    return new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return null
  }
}

/** Whether an Origin header names the same host:port the request was sent to. */
function isSameOrigin(origin: string, hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  try {
    return new URL(origin).host.toLowerCase() === hostHeader.toLowerCase()
  } catch {
    // Includes the literal "null" origin sent by sandboxed frames and file:// pages.
    return false
  }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** App-level guard; mount before the auth middleware and every route. */
export async function requestGuard(c: Context, next: Next) {
  const hostHeader = c.req.header('host')

  if (!getAuthToken()) {
    const hostname = hostnameOf(hostHeader)
    if (!hostname || !isLoopbackHost(hostname)) {
      return c.text('Forbidden: this server only answers to localhost', 403)
    }
  }

  if (c.req.path.startsWith('/api')) {
    const origin = c.req.header('origin')
    if (origin !== undefined && !isSameOrigin(origin, hostHeader)) {
      return c.json({ error: 'Cross-origin request rejected' }, 403)
    }
    if (c.req.header('sec-fetch-site') === 'cross-site') {
      return c.json({ error: 'Cross-site request rejected' }, 403)
    }
    // A cross-origin page can only send a JSON content type after a CORS preflight,
    // which this server never approves. Requiring it closes the text/plain and
    // form-post routes that skip the preflight.
    if (WRITE_METHODS.has(c.req.method) && hasBody(c)) {
      const type = c.req.header('content-type') ?? ''
      if (!/^application\/json\b/i.test(type)) {
        return c.json({ error: 'Content-Type must be application/json' }, 415)
      }
    }
  }

  return next()
}

function hasBody(c: Context): boolean {
  const length = c.req.header('content-length')
  if (length !== undefined) return Number(length) > 0
  return c.req.header('transfer-encoding') !== undefined || c.req.raw.body !== null
}
