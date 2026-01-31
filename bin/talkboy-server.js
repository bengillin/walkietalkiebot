#!/usr/bin/env node

import { spawn, execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, createReadStream } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLIST_NAME = 'com.talkboy.server'
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`)
const LOG_DIR = join(homedir(), '.talkboy', 'logs')
const PID_FILE = join(homedir(), '.talkboy', 'server.pid')
const PORT = parseInt(process.env.TALKBOY_PORT || '5173', 10)

function ensureDirs() {
  const talkboyDir = join(homedir(), '.talkboy')
  if (!existsSync(talkboyDir)) {
    mkdirSync(talkboyDir, { recursive: true })
  }
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
  const launchAgentsDir = dirname(PLIST_PATH)
  if (!existsSync(launchAgentsDir)) {
    mkdirSync(launchAgentsDir, { recursive: true })
  }
}

function generatePlist() {
  const serverScript = join(__dirname, '..', 'server', 'index.js')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/env</string>
        <string>node</string>
        <string>${serverScript}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>${PORT}</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>${join(__dirname, '..')}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${join(LOG_DIR, 'stdout.log')}</string>
    <key>StandardErrorPath</key>
    <string>${join(LOG_DIR, 'stderr.log')}</string>
</dict>
</plist>`
}

function isLaunchctlLoaded() {
  try {
    const result = execSync(`launchctl list ${PLIST_NAME} 2>/dev/null`, { encoding: 'utf-8' })
    return result.includes(PLIST_NAME)
  } catch {
    return false
  }
}

function isServerRunning() {
  try {
    execSync(`curl -s -k https://localhost:${PORT}/api/status`, { encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

function getPid() {
  if (existsSync(PID_FILE)) {
    return parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
  }
  return null
}

async function commands() {
  const cmd = process.argv[2]
  const args = process.argv.slice(3)

  switch (cmd) {
    case 'start':
      await startServer(args.includes('--foreground') || args.includes('-f'))
      break

    case 'stop':
      await stopServer()
      break

    case 'restart':
      await stopServer()
      await startServer(false)
      break

    case 'status':
      await showStatus()
      break

    case 'logs':
      await showLogs(args.includes('--follow') || args.includes('-f'))
      break

    case 'install':
      await installDaemon()
      break

    case 'uninstall':
      await uninstallDaemon()
      break

    default:
      showHelp()
  }
}

async function startServer(foreground = false) {
  ensureDirs()

  if (isServerRunning()) {
    console.log('Server is already running.')
    return
  }

  if (foreground) {
    console.log(`Starting Talkboy server in foreground on port ${PORT}...`)
    const { startServer } = await import('../server/index.js')
    await startServer(PORT)
  } else {
    // Check if launchd plist is installed
    if (existsSync(PLIST_PATH)) {
      console.log('Starting via launchd...')
      execSync(`launchctl load ${PLIST_PATH}`)
    } else {
      // Start as background process
      console.log('Starting as background process...')
      const serverScript = join(__dirname, '..', 'server', 'index.js')
      const child = spawn('node', [serverScript], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(PORT) },
        cwd: join(__dirname, '..'),
      })

      // Save PID
      writeFileSync(PID_FILE, String(child.pid))

      // Pipe logs
      const stdout = createWriteStream(join(LOG_DIR, 'stdout.log'), { flags: 'a' })
      const stderr = createWriteStream(join(LOG_DIR, 'stderr.log'), { flags: 'a' })
      child.stdout?.pipe(stdout)
      child.stderr?.pipe(stderr)

      child.unref()
    }

    // Wait for server to be ready
    console.log('Waiting for server to start...')
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (isServerRunning()) {
        console.log(`Talkboy server running at https://localhost:${PORT}`)
        return
      }
    }

    console.error('Server failed to start. Check logs with: talkboy-server logs')
  }
}

async function stopServer() {
  if (isLaunchctlLoaded()) {
    console.log('Stopping via launchd...')
    try {
      execSync(`launchctl unload ${PLIST_PATH}`)
    } catch {
      // Ignore errors
    }
  }

  const pid = getPid()
  if (pid) {
    console.log(`Stopping process ${pid}...`)
    try {
      process.kill(pid, 'SIGTERM')
      unlinkSync(PID_FILE)
    } catch {
      // Process may already be dead
    }
  }

  // Wait for server to stop
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500))
    if (!isServerRunning()) {
      console.log('Server stopped.')
      return
    }
  }

  if (isServerRunning()) {
    console.log('Warning: Server may still be running.')
  } else {
    console.log('Server stopped.')
  }
}

async function showStatus() {
  const running = isServerRunning()
  const launchd = isLaunchctlLoaded()

  console.log('Talkboy Server Status')
  console.log('=====================')
  console.log(`Server:   ${running ? '✅ Running' : '❌ Stopped'}`)
  console.log(`Port:     ${PORT}`)
  console.log(`launchd:  ${launchd ? '✅ Loaded' : '⚪ Not loaded'}`)
  console.log(`Plist:    ${existsSync(PLIST_PATH) ? '✅ Installed' : '⚪ Not installed'}`)

  if (running) {
    try {
      const response = await fetch(`https://localhost:${PORT}/api/status`, {
        // @ts-expect-error
        agent: new (await import('https')).Agent({ rejectUnauthorized: false })
      })
      const data = await response.json()
      console.log(`Database: ${data.dbStatus === 'connected' ? '✅ Connected' : '⚠️ Unavailable'}`)
      console.log(`Avatar:   ${data.avatarState}`)
    } catch {
      // Ignore
    }
  }
}

async function showLogs(follow = false) {
  const logFile = join(LOG_DIR, 'stdout.log')
  const errFile = join(LOG_DIR, 'stderr.log')

  if (!existsSync(logFile) && !existsSync(errFile)) {
    console.log('No logs found.')
    return
  }

  if (follow) {
    console.log('Following logs (Ctrl+C to stop)...\n')
    const tail = spawn('tail', ['-f', logFile, errFile])
    tail.stdout.pipe(process.stdout)
    tail.stderr.pipe(process.stderr)

    process.on('SIGINT', () => {
      tail.kill()
      process.exit(0)
    })

    await new Promise(() => {}) // Wait forever
  } else {
    // Show last 50 lines
    if (existsSync(logFile)) {
      console.log('=== stdout.log ===')
      const stdout = readFileSync(logFile, 'utf-8').split('\n').slice(-50).join('\n')
      console.log(stdout)
    }

    if (existsSync(errFile)) {
      console.log('\n=== stderr.log ===')
      const stderr = readFileSync(errFile, 'utf-8').split('\n').slice(-50).join('\n')
      console.log(stderr)
    }
  }
}

async function installDaemon() {
  ensureDirs()

  const plist = generatePlist()
  writeFileSync(PLIST_PATH, plist)
  console.log(`Installed plist to ${PLIST_PATH}`)

  // Load the daemon
  execSync(`launchctl load ${PLIST_PATH}`)
  console.log('Daemon loaded and started.')
  console.log(`Server will start automatically on login.`)
  console.log(`\nTo uninstall: talkboy-server uninstall`)
}

async function uninstallDaemon() {
  if (isLaunchctlLoaded()) {
    execSync(`launchctl unload ${PLIST_PATH}`)
    console.log('Daemon unloaded.')
  }

  if (existsSync(PLIST_PATH)) {
    unlinkSync(PLIST_PATH)
    console.log(`Removed ${PLIST_PATH}`)
  }

  console.log('Daemon uninstalled.')
}

function showHelp() {
  console.log(`
Talkboy Server CLI

Usage: talkboy-server <command> [options]

Commands:
  start [-f]      Start the server (use -f for foreground)
  stop            Stop the server
  restart         Restart the server
  status          Show server status
  logs [-f]       Show logs (use -f to follow)
  install         Install as launchd daemon (auto-start on login)
  uninstall       Remove launchd daemon

Environment:
  TALKBOY_PORT    Server port (default: 5173)
`)
}

// Import createWriteStream for logging
import { createWriteStream } from 'fs'

commands().catch(console.error)
