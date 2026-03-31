import { type Page } from '@playwright/test'

/**
 * Skip onboarding by setting localStorage before page load.
 * Must be called AFTER page.goto() since localStorage needs a page context,
 * so we navigate, set storage, then reload.
 */
export async function skipOnboarding(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('wtb_onboarded', 'true')
  })
  await page.reload()
  // Wait for the main app to render (header is a reliable indicator)
  await page.waitForSelector('.app__header', { timeout: 5000 })
}

/**
 * Set theme via localStorage and reload.
 */
export async function setTheme(page: Page, theme: string) {
  await page.evaluate((t) => {
    localStorage.setItem('wtb_theme', t)
  }, theme)
  await page.reload()
  await page.waitForSelector('.app__header', { timeout: 5000 })
}
