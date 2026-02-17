import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import selfsigned from 'selfsigned'

const TALKIE_DIR = join(homedir(), '.talkie')
const OLD_DIR = join(homedir(), '.talkboy')
const CERT_PATH = join(TALKIE_DIR, 'cert.pem')
const KEY_PATH = join(TALKIE_DIR, 'key.pem')
const TAILSCALE_CERT_PATH = join(TALKIE_DIR, 'tailscale.crt')
const TAILSCALE_KEY_PATH = join(TALKIE_DIR, 'tailscale.key')

export interface SSLCerts {
  cert: string
  key: string
  isTailscale?: boolean
}

export function getSSLCerts(): SSLCerts {
  // Migrate ~/.talkboy → ~/.talkie if needed
  if (existsSync(OLD_DIR) && !existsSync(TALKIE_DIR)) {
    renameSync(OLD_DIR, TALKIE_DIR)
  }

  // Ensure ~/.talkie directory exists
  if (!existsSync(TALKIE_DIR)) {
    mkdirSync(TALKIE_DIR, { recursive: true })
  }

  // Prefer Tailscale certs if available (real certs, no browser warnings)
  if (existsSync(TAILSCALE_CERT_PATH) && existsSync(TAILSCALE_KEY_PATH)) {
    console.log('Using Tailscale HTTPS certificates')
    return {
      cert: readFileSync(TAILSCALE_CERT_PATH, 'utf-8'),
      key: readFileSync(TAILSCALE_KEY_PATH, 'utf-8'),
      isTailscale: true,
    }
  }

  // Fall back to self-signed certs
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
    return {
      cert: readFileSync(CERT_PATH, 'utf-8'),
      key: readFileSync(KEY_PATH, 'utf-8'),
    }
  }

  // Generate new self-signed certificates
  console.log('Generating self-signed SSL certificates...')
  const attrs = [{ name: 'commonName', value: 'localhost' }]
  const pems = selfsigned.generate(attrs, {
    algorithm: 'sha256',
    days: 365,
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  })

  // Save certificates
  writeFileSync(CERT_PATH, pems.cert)
  writeFileSync(KEY_PATH, pems.private)
  console.log(`SSL certificates saved to ${TALKIE_DIR}`)

  return {
    cert: pems.cert,
    key: pems.private,
  }
}
