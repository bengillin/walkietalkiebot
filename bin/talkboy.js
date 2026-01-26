#!/usr/bin/env node

import { startServer } from '../server/index.js'
import open from 'open'

const PORT = parseInt(process.env.TALKBOY_PORT || '5173', 10)
const URL = `https://localhost:${PORT}`

async function main() {
  console.log('Starting Talkboy...')

  try {
    await startServer(PORT)

    // Open browser after server starts (prefer Chrome for Web Speech API support)
    console.log(`Opening ${URL}...`)
    console.log('(Requires Chrome/Edge - Firefox does not support Web Speech API)')

    // Try to open in Chrome, fall back to default browser
    try {
      await open(URL, { app: { name: 'google chrome' } })
    } catch {
      await open(URL)
    }

    console.log('\nTalkboy is running. Press Ctrl+C to stop.')
  } catch (err) {
    if (err instanceof Error && err.message.includes('already in use')) {
      console.log(`Talkboy appears to already be running on port ${PORT}`)
      console.log(`Opening ${URL}...`)
      try {
        await open(URL, { app: { name: 'google chrome' } })
      } catch {
        await open(URL)
      }
    } else {
      console.error('Failed to start Talkboy:', err)
      process.exit(1)
    }
  }
}

main()
