import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import selfsigned from 'selfsigned'

const TALKBOY_DIR = join(homedir(), '.talkboy')
const CERT_PATH = join(TALKBOY_DIR, 'cert.pem')
const KEY_PATH = join(TALKBOY_DIR, 'key.pem')

export interface SSLCerts {
  cert: string
  key: string
}

export function getSSLCerts(): SSLCerts {
  // Ensure ~/.talkboy directory exists
  if (!existsSync(TALKBOY_DIR)) {
    mkdirSync(TALKBOY_DIR, { recursive: true })
  }

  // Check if certs already exist
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
  console.log(`SSL certificates saved to ${TALKBOY_DIR}`)

  return {
    cert: pems.cert,
    key: pems.private,
  }
}
