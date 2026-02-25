#!/usr/bin/env node
// Syncs the version from package.json to all other files that embed it.
// Runs automatically via the npm "version" lifecycle hook.

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
const version = pkg.version

const replacements = [
  { file: '.claude-plugin/plugin.json', pattern: /"version":\s*"[^"]+"/,       replace: `"version": "${version}"` },
  { file: 'mcp-server/package.json',    pattern: /"version":\s*"[^"]+"/,       replace: `"version": "${version}"` },
  { file: 'site/public/llms.txt',       pattern: /Version:\s*[\d.]+/,          replace: `Version: ${version}` },
  { file: 'site/index.html',            pattern: /"softwareVersion":\s*"[^"]+"/, replace: `"softwareVersion": "${version}"` },
]

let updated = 0
for (const { file, pattern, replace } of replacements) {
  const path = resolve(root, file)
  const content = readFileSync(path, 'utf-8')
  const newContent = content.replace(pattern, replace)
  if (newContent !== content) {
    writeFileSync(path, newContent)
    updated++
    console.log(`  ✓ ${file} → ${version}`)
  }
}

if (updated === 0) {
  console.log(`  All files already at ${version}`)
} else {
  console.log(`  Synced ${updated} file(s) to ${version}`)
}
