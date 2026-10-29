import { defineConfig } from 'vitest/config'

/**
 * End-to-end tests for the built MCP server (mcp-server/dist/index.js). They
 * spawn the real bundle over stdio, so run `npm run build:server` first.
 *
 *   npx vitest run --config mcp-server/vitest.config.ts
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['mcp-server/test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
