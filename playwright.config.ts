import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { defineConfig, devices } from '@playwright/test'

// The server under test gets its own data dir, so e2e runs never touch ~/.wtb.
const wtbDir = mkdtempSync(join(tmpdir(), 'wtb-e2e-'))

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential — tests share server state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node server/index.js',
    port: 5174,
    env: { PORT: '5174', WTB_PORT: '5174', WTB_DIR: wtbDir },
    // A server already on this port would be using someone's real data dir.
    reuseExistingServer: false,
    timeout: 15000,
  },
})
