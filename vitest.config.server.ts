import { defineConfig } from 'vitest/config'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'

/**
 * `npm run build` emits compiled `.js` next to every server `.ts` (esbuild
 * writes in place so npm can publish them). That makes the source tree ambiguous
 * for the test runner, in two ways:
 *
 *  1. Extensionless imports (`./promptBuilder`) — Vite's default extension order
 *     tries `.js` before `.ts`, so it picks the build artifact.
 *  2. Explicit `.js` specifiers (`../modes.js`, used between server modules) —
 *     resolve straight to the artifact.
 *
 * Either way the suite would exercise stale build output instead of the source
 * under test: editing a `.ts` and running `npm test` without rebuilding would
 * report green against code that no longer exists. Force both forms to source.
 */
const preferTsSources = {
  name: 'prefer-ts-sources',
  enforce: 'pre' as const,
  resolveId(source: string, importer: string | undefined) {
    if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null
    const tsPath = resolve(dirname(importer), source.replace(/\.js$/, '.ts'))
    return existsSync(tsPath) ? tsPath : null
  },
}

export default defineConfig({
  plugins: [preferTsSources],
  resolve: {
    // `.ts` ahead of `.js` so extensionless imports land on source.
    extensions: ['.mts', '.ts', '.mjs', '.js', '.tsx', '.jsx', '.json'],
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
    globals: true,
  },
})
