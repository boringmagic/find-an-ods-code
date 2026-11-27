import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export async function expectAccessible (page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(results.violations).toEqual([])
}

export async function expectGoodStructure (page) {
  const levels = await page.locator('main h1, main h2, main h3, main h4, main h5, main h6')
    .evaluateAll(els => els.map(el => Number(el.tagName[1])))
  expect(levels.filter(level => level === 1)).toHaveLength(1)
  expect(levels[0]).toBe(1)
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1) // no skipped levels
  }
  expect(levels).not.toContain(5) // the content guide says to avoid h5
  expect(levels).not.toContain(6)

  const h1 = (await page.locator('main h1').innerText()).trim()
  await expect(page).toHaveTitle(new RegExp(escapeRegExp(h1)))
}

function escapeRegExp (text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Stops tests loading map tiles from OpenStreetMap. Area shapes come from
 * the prototype's own files in app/data/areas/.
 * Returns the list of area requests the page made, so tests can check them.
 */
export async function useFakeAreaData (page, { fail = false } = {}) {
  const requests = []
  await page.route(/tile\.openstreetmap\.org/, route => route.abort())
  page.on('request', request => {
    if (request.url().includes('/api/areas?')) requests.push(new URL(request.url()))
  })
  if (fail) {
    await page.route('**/api/areas?**', route => route.fulfill({ status: 502, json: { error: 'Bad gateway' } }))
  }
  return requests
}
