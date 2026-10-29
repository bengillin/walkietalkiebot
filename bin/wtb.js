#!/usr/bin/env node

import { setupShutdownHandlers, startServer } from '../server/index.js'
import open from 'open'

const PORT = parseInt(process.env.WTB_PORT || '5173', 10)
const URL = `http://localhost:${PORT}`

async function isTalkie() {
  try {
    const res = await fetch(`${URL}/api/status`, { signal: AbortSignal.timeout(2000) })
    const data = await res.json().catch(() => null)
    return (
      (res.ok && data?.running === true) || (res.status === 401 && data?.error === 'Unauthorized')
    )
  } catch {
    return false
  }
}

async function main() {
  console.log('Starting Walkie Talkie Bot...')

  try {
    await startServer(PORT)
    setupShutdownHandlers()

    // Open browser after server starts (prefer Chrome for Web Speech API support)
    console.log(`Opening ${URL}...`)
    console.log('(Requires Chrome/Edge - Firefox does not support Web Speech API)')

    // Try to open in Chrome, fall back to default browser
    try {
      await open(URL, { app: { name: 'google chrome' } })
    } catch {
      await open(URL)
    }

    console.log(`Claude Code will work in: ${process.cwd()}`)
    console.log('\nWalkie Talkie Bot is running. Press Ctrl+C to stop.')
  } catch (err) {
    if (err instanceof Error && err.message.includes('already in use')) {
      // 5173 is also Vite's default port; only open the browser if it's really us.
      if (!(await isTalkie())) {
        console.error(
          `Port ${PORT} is in use by another program. ` +
            `Pick a different port, e.g. WTB_PORT=5199 npx walkietalkiebot`,
        )
        process.exit(1)
      }
      console.log(`Walkie Talkie Bot is already running on port ${PORT}`)
      console.log(`Opening ${URL}...`)
      try {
        await open(URL, { app: { name: 'google chrome' } })
      } catch {
        await open(URL)
      }
    } else {
      console.error('Failed to start Walkie Talkie Bot:', err instanceof Error ? err.message : err)
      process.exit(1)
    }
  }
}

main()
