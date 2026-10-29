#!/usr/bin/env node

import { spawn, execSync } from 'child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLIST_NAME = 'com.wtb.server'
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`)
// Mirrors server/paths.ts getWtbDir(); this CLI is plain JS and can't import the TS source.
const WTB_DIR = process.env.WTB_DIR ? resolve(process.env.WTB_DIR) : join(homedir(), '.wtb')
const LOG_DIR = join(WTB_DIR, 'logs')
const PID_FILE = join(WTB_DIR, 'server.pid')
const PORT = parseInt(process.env.WTB_PORT || '5173', 10)

function ensureDirs() {
  if (!existsSync(WTB_DIR)) {
    mkdirSync(WTB_DIR, { recursive: true })
  }
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
  const launchAgentsDir = dirname(PLIST_PATH)
  if (!existsSync(launchAgentsDir)) {
    mkdirSync(launchAgentsDir, { recursive: true })
  }
}

// Settings the daemon must inherit from the shell that ran `install`. Without
// WTB_AUTH_TOKEN in particular, a daemon with WTB_HOST set would refuse to start.
const PASSTHROUGH_ENV = [
  'WTB_AUTH_TOKEN',
  'WTB_HOST',
  'WTB_DIR',
  'WTB_LOG_LEVEL',
  'WTB_MAX_BODY_BYTES',
]

function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function plistEnv() {
  // launchd starts with a bare PATH; keep the installing shell's so `node` and
  // `claude` (often in ~/.local/bin or a version manager's dir) resolve.
  const path = [process.env.PATH, '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin']
    .filter(Boolean)
    .join(':')
  const env = { PORT: String(PORT), WTB_PORT: String(PORT), PATH: path }
  for (const key of PASSTHROUGH_ENV) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return Object.entries(env)
    .map(
      ([key, value]) => `        <key>${key}</key>\n        <string>${xmlEscape(value)}</string>`,
    )
    .join('\n')
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
${plistEnv()}
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
    execSync(`curl -s http://localhost:${PORT}/api/status`, { encoding: 'utf-8' })
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
    console.log(`Starting Walkie Talkie Bot server in foreground on port ${PORT}...`)
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
      await new Promise((r) => setTimeout(r, 500))
      if (isServerRunning()) {
        console.log(`Walkie Talkie Bot server running at http://localhost:${PORT}`)
        return
      }
    }

    console.error('Server failed to start. Check logs with: wtb-server logs')
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
    await new Promise((r) => setTimeout(r, 500))
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

  console.log('Walkie Talkie Bot Server Status')
  console.log('================================')
  console.log(`Server:   ${running ? '✅ Running' : '❌ Stopped'}`)
  console.log(`Port:     ${PORT}`)
  console.log(`launchd:  ${launchd ? '✅ Loaded' : '⚪ Not loaded'}`)
  console.log(`Plist:    ${existsSync(PLIST_PATH) ? '✅ Installed' : '⚪ Not installed'}`)

  if (running) {
    try {
      const response = await fetch(`http://localhost:${PORT}/api/status`)
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
  // 0600: the plist may carry WTB_AUTH_TOKEN.
  writeFileSync(PLIST_PATH, plist, { mode: 0o600 })
  chmodSync(PLIST_PATH, 0o600) // mode above only applies when the file is new
  console.log(`Installed plist to ${PLIST_PATH}`)

  // Load the daemon
  execSync(`launchctl load ${PLIST_PATH}`)
  console.log('Daemon loaded and started.')
  console.log(`Server will start automatically on login.`)
  console.log(`\nTo uninstall: wtb-server uninstall`)
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
Walkie Talkie Bot Server CLI

Usage: wtb-server <command> [options]

Commands:
  start [-f]      Start the server (use -f for foreground)
  stop            Stop the server
  restart         Restart the server
  status          Show server status
  logs [-f]       Show logs (use -f to follow)
  install         Install as launchd daemon (auto-start on login)
  uninstall       Remove launchd daemon

Environment:
  WTB_PORT        Server port (default: 5173)
  WTB_HOST        Address to listen on (default: 127.0.0.1). Anything other than
                  loopback requires WTB_AUTH_TOKEN.
  WTB_AUTH_TOKEN  Shared secret required on every request
  WTB_DIR         Data directory: database, modes, logs (default: ~/.wtb)
`)
}

// Import createWriteStream for logging
import { createWriteStream } from 'fs'

commands().catch((err) => {
  // Startup errors (port in use, refusing an unauthenticated bind) are written for
  // the user; a stack trace would bury them.
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
