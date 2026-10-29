import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
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

test.describe('Escape closes the topmost layer', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page)
  })

  test('closes the tape collection', async ({ page }) => {
    await page.click('.app__header-btn--eject')
    await expect(page.locator('.tape-collection__drawer')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.tape-collection__drawer')).not.toBeVisible()
  })

  test('closes one layer per press, top first', async ({ page }) => {
    await page.click('.app__header-btn--eject')
    await expect(page.locator('.tape-collection__drawer')).toBeVisible()
    // The drawer's backdrop covers the header; dispatch directly to stack layers
    await page.locator('[title="Settings"]').dispatchEvent('click')
    await expect(page.locator('.settings__drawer')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.settings__drawer')).not.toBeVisible()
    await expect(page.locator('.tape-collection__drawer')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.tape-collection__drawer')).not.toBeVisible()
  })

  test('closes the mode dropdown only', async ({ page }) => {
    await page.waitForSelector('.mode-selector', { timeout: 5000 })
    await page.click('[title="Plans"]')
    await expect(page.locator('.plans__panel')).toBeVisible()
    await page.locator('.mode-selector__trigger').dispatchEvent('click')
    await expect(page.locator('.mode-selector__dropdown')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.mode-selector__dropdown')).not.toBeVisible()
    await expect(page.locator('.plans__panel')).toBeVisible()
  })

  test('search still closes itself, and only itself', async ({ page }) => {
    await page.click('.app__header-btn--eject')
    await expect(page.locator('.tape-collection__drawer')).toBeVisible()
    await page.keyboard.press('Meta+k')
    await expect(page.locator('.search-overlay')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.search-overlay')).not.toBeVisible()
    await expect(page.locator('.tape-collection__drawer')).toBeVisible()
  })
})

test.describe('Conversations are created lazily', () => {
  test('loading the app and starting a new tape create nothing on the server', async ({
    page,
    request,
  }) => {
    const total = async () =>
      (await (await request.get('/api/conversations?limit=1')).json()).total as number
    const before = await total()

    await skipOnboarding(page)
    await page.click('.app__header-btn--eject')
    await page.click('.tape-collection__new-btn')
    await page.waitForTimeout(1000)

    expect(await total()).toBe(before)
  })
})

test.describe('Mobile header', () => {
  const themes = ['mccallister', 'imessage', 'aol', 'classic-mac', 'geocities', 'apple-1984']
  test.use({ viewport: { width: 390, height: 844 } })

  for (const theme of themes) {
    test(`${theme}: every header control is on screen`, async ({ page }) => {
      await skipOnboarding(page)
      await setTheme(page, theme)
      await page.waitForSelector('.mode-selector', { timeout: 5000 })

      const boxes = await page.$$eval('.app__header button', (els) =>
        els
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ left: r.left, right: r.right }))
          .sort((a, b) => a.left - b.left),
      )
      expect(boxes.length).toBeGreaterThanOrEqual(4)
      boxes.forEach((box, i) => {
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(390)
        const prev = boxes[i - 1]
        if (prev) expect(box.left).toBeGreaterThanOrEqual(prev.right) // no overlap
      })

      // Secondary actions live in the overflow menu
      await page.click('.app__header-more-btn')
      const menu = page.locator('.app__header-menu')
      for (const label of ['Settings', 'Plans', 'Liner Notes', 'Media Library']) {
        await expect(menu.getByRole('button', { name: label })).toBeInViewport()
      }
      await menu.getByRole('button', { name: 'Settings' }).click()
      await expect(page.locator('.settings__drawer')).toBeVisible()
    })
  }
})

test.describe('No message is lost', () => {
  // Every stored message on the server, across all tapes
  async function serverMessages(request: APIRequestContext): Promise<string[]> {
    const list = await (await request.get('/api/conversations?limit=1000')).json()
    const all: string[] = []
    for (const c of list.conversations as Array<{ id: string }>) {
      const full = await (await request.get(`/api/conversations/${c.id}`)).json()
      all.push(...(full.messages as Array<{ content: string }>).map((m) => m.content))
    }
    return all
  }

  async function openApp(page: Page) {
    // Don't run Claude: these tests are about what the tape keeps
    await page.route('**/api/claude-code', (r) => r.fulfill({ status: 500, body: 'stubbed' }))
    await skipOnboarding(page)
  }

  async function send(page: Page, text: string) {
    await page.locator('.tape-deck__input').fill(text)
    await page.locator('.tape-deck__input').press('Enter')
  }

  test('a message sent while the tape list is still loading survives the sync', async ({
    page,
    request,
  }) => {
    const text = `slow list ${Date.now()}`
    await openApp(page)
    // Hold the list response until after the message has created its tape
    await page.route(/\/api\/conversations\?limit=/, async (r) => {
      const response = await r.fetch()
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await r.fulfill({ response })
    })
    await page.reload()
    await page.waitForSelector('.app__header')
    await send(page, text)
    await page.waitForTimeout(4500)

    await expect(page.locator('.app__main')).toContainText(text)
    expect(await serverMessages(request)).toContain(text)
  })

  test('a send whose creation response was lost is not dropped by the next one', async ({
    page,
    request,
  }) => {
    const one = `lost response one ${Date.now()}`
    const two = `lost response two ${Date.now()}`
    await openApp(page)
    let dropped = false
    await page.route('**/api/migrate', async (r) => {
      if (dropped) return r.continue()
      dropped = true
      await r.fetch() // the server commits...
      await r.abort('failed') // ...and the response never arrives
    })
    await send(page, one)
    await page.waitForTimeout(1000)
    await send(page, two)
    await page.waitForTimeout(1500)

    const stored = await serverMessages(request)
    expect(stored).toContain(one)
    expect(stored).toContain(two)
  })

  test('two tabs sending on the same blank tape both reach the server', async ({
    context,
    request,
  }) => {
    const a = await context.newPage()
    await openApp(a)
    const b = await context.newPage()
    await b.route('**/api/claude-code', (r) => r.fulfill({ status: 500, body: 'stubbed' }))
    await b.goto('/')
    await b.waitForSelector('.app__header')

    const fromA = `tab A ${Date.now()}`
    const fromB = `tab B ${Date.now()}`
    await send(a, fromA)
    await a.waitForTimeout(1000)
    await send(b, fromB)
    await b.waitForTimeout(1500)

    const stored = await serverMessages(request)
    expect(stored).toContain(fromA)
    expect(stored).toContain(fromB)

    // ...and tab B still shows its message after reloading
    await b.reload()
    await b.waitForSelector('.app__header')
    await b.waitForTimeout(1500)
    await expect(b.locator('.app__main')).toContainText(fromB)
  })
})
