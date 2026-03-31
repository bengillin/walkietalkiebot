import { test, expect } from '@playwright/test'
import { skipOnboarding, setTheme } from './helpers'

const themes = ['mccallister', 'imessage', 'aol', 'classic-mac', 'geocities', 'apple-1984'] as const

test.describe('Visual regression — main app per theme', () => {
  for (const theme of themes) {
    test(`${theme} — main view`, async ({ page }) => {
      await skipOnboarding(page)
      await setTheme(page, theme)
      await page.waitForTimeout(300) // Let theme CSS settle
      await expect(page).toHaveScreenshot(`${theme}-main.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })
  }
})

test.describe('Visual regression — tape collection per theme', () => {
  for (const theme of themes) {
    test(`${theme} — tape collection`, async ({ page }) => {
      await skipOnboarding(page)
      await setTheme(page, theme)
      await page.click('.app__header-btn--eject')
      await page.waitForSelector('.tape-collection__drawer', { timeout: 3000 })
      await page.waitForTimeout(300)
      await expect(page).toHaveScreenshot(`${theme}-tapes.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })
  }
})

test.describe('Visual regression — settings per theme', () => {
  for (const theme of themes) {
    test(`${theme} — settings`, async ({ page }) => {
      await skipOnboarding(page)
      await setTheme(page, theme)
      await page.click('[title="Settings"]')
      await page.waitForSelector('.settings__drawer', { timeout: 3000 })
      await page.waitForTimeout(300)
      await expect(page).toHaveScreenshot(`${theme}-settings.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })
  }
})

test.describe('Visual regression — onboarding', () => {
  test('onboarding welcome screen', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.onboarding', { timeout: 5000 })
    await page.waitForTimeout(500) // Let animations settle
    await expect(page).toHaveScreenshot('onboarding-welcome.png', {
      maxDiffPixelRatio: 0.02, // Slightly more tolerance for animations
    })
  })
})

test.describe('Visual regression — mode selector', () => {
  test('mode dropdown open', async ({ page }) => {
    await skipOnboarding(page)
    await page.waitForSelector('.mode-selector', { timeout: 5000 })
    await page.click('.mode-selector__trigger')
    await page.waitForSelector('.mode-selector__dropdown', { timeout: 2000 })
    await page.waitForTimeout(200)
    await expect(page.locator('.mode-selector')).toHaveScreenshot('mode-dropdown.png', {
      maxDiffPixelRatio: 0.01,
    })
  })
})
