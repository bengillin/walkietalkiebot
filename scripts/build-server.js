#!/usr/bin/env node

import { build } from 'esbuild'
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

// Recursively find all .ts files in a directory
function findTsFiles(dir, base = dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...findTsFiles(fullPath, base))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

const serverFiles = findTsFiles('server')

console.log('Building server files:', serverFiles.map(f => relative('.', f)))

await build({
  entryPoints: serverFiles,
  outdir: 'server',
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outbase: 'server',
})

console.log('Server build complete')
