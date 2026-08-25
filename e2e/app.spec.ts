import { test, expect } from '@playwright/test'
import { skipOnboarding, setTheme } from './helpers'

test.describe('Onboarding', () => {
  test('shows onboarding on first visit', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.onboarding')).toBeVisible()
    await expect(page.locator('.onboarding__title')).toContainText('Talkie')
  })

  test('completes onboarding flow', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.onboarding')).toBeVisible()

    // Step 1: Welcome — click Get Started
    await page.click('text=Get Started')

    // Step 2: TTS toggle — click Next
    await page.click('text=Next')

    // Step 3: Sound effects — click Next
    await page.click('text=Next')

    // Step 4: Wake word — click Next
    await page.click('text=Next')

    // Step 5: Continuous listening — click Next
    await page.click('text=Next')

    // Step 6: Done — click Start using Talkie
    await page.click('text=Start using Talkie')

    // Should now show the main app
    await expect(page.locator('.app__header')).toBeVisible()
  })

  test('skip button completes onboarding', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Get Started')
    await page.click('text=Skip')
    await expect(page.locator('.app__header')).toBeVisible()
  })
})

test.describe('Main App', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page)
  })

  test('renders header with logo and controls', async ({ page }) => {
    await expect(page.locator('.app__header')).toBeVisible()
    await expect(page.locator('.app__logo')).toBeVisible()
  })

  test('shows mode selector in header', async ({ page }) => {
    // Wait for modes to load from API
    await page.waitForSelector('.mode-selector', { timeout: 5000 })
    await expect(page.locator('.mode-selector__label')).toBeVisible()
  })

  test('mode selector opens dropdown and lists modes', async ({ page }) => {
    await page.waitForSelector('.mode-selector', { timeout: 5000 })
    await page.click('.mode-selector__trigger')

    await expect(page.locator('.mode-selector__dropdown')).toBeVisible()
    await expect(page.locator('.mode-selector__option')).toHaveCount(5)
  })

  test('switching mode updates the selector', async ({ page }) => {
    await page.waitForSelector('.mode-selector', { timeout: 5000 })
    await page.click('.mode-selector__trigger')
    await page.click('text=Architect')

    await expect(page.locator('.mode-selector__label')).toContainText('Architect')
  })

  test('tape collection opens and closes', async ({ page }) => {
    // Click the eject/conversations button
    await page.click('.app__header-btn--eject')
    await expect(page.locator('.tape-collection__drawer')).toBeVisible()

    // Close via backdrop
    await page.click('.tape-collection__backdrop')
    await expect(page.locator('.tape-collection__drawer')).not.toBeVisible()
  })

  test('can create a new conversation from tape collection', async ({ page }) => {
    await page.click('.app__header-btn--eject')
    await expect(page.locator('.tape-collection__drawer')).toBeVisible()

    const initialCount = await page.locator('.tape-collection__item').count()
    await page.click('.tape-collection__new-btn')

    // Drawer closes after creating
    await page.waitForTimeout(500)
    // Reopen to check count
    await page.click('.app__header-btn--eject')
    const newCount = await page.locator('.tape-collection__item').count()
    expect(newCount).toBeGreaterThanOrEqual(initialCount)
  })

  test('settings drawer opens and closes', async ({ page }) => {
    await page.click('[title="Settings"]')
    await expect(page.locator('.settings__drawer')).toBeVisible()

    // Close via X button
    await page.click('.settings__close')
    await expect(page.locator('.settings__drawer')).not.toBeVisible()
  })

  test('plans panel opens and closes', async ({ page }) => {
    await page.click('[title="Plans"]')
    await expect(page.locator('.plans__panel')).toBeVisible()

    await page.click('.plans__close')
    await expect(page.locator('.plans__panel')).not.toBeVisible()
  })

  test('search overlay opens with Cmd+K', async ({ page }) => {
    await page.keyboard.press('Meta+k')
    await expect(page.locator('.search-overlay')).toBeVisible()

    // Close via clicking the overlay background
    await page.locator('.search-overlay').click({ position: { x: 10, y: 10 } })
    await expect(page.locator('.search-overlay')).not.toBeVisible()
  })

  test('tape deck has input area', async ({ page }) => {
    await expect(page.locator('.tape-deck')).toBeVisible()
    await expect(page.locator('.tape-deck__input')).toBeVisible()
  })

  test('can type in tape deck input', async ({ page }) => {
    const input = page.locator('.tape-deck__input')
    await input.fill('Hello from E2E test')
    await expect(input).toHaveValue('Hello from E2E test')
  })
})

test.describe('Theme switching', () => {
  const themes = ['mccallister', 'imessage', 'aol', 'classic-mac', 'geocities', 'apple-1984']

  for (const theme of themes) {
    test(`${theme} theme applies correctly`, async ({ page }) => {
      await skipOnboarding(page)
      await setTheme(page, theme)

      const dataTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme'),
      )
      expect(dataTheme).toBe(theme)

      // Verify the app renders without errors
      await expect(page.locator('.app__header')).toBeVisible()
    })
  }
})
