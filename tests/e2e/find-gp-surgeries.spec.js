import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { expectAccessible, expectGoodStructure } from './helpers.js'

// Counts come from the generated data, so the tests stay right when the data is rebuilt
const regions = JSON.parse(readFileSync(new URL('../../app/data/regions.json', import.meta.url), 'utf8'))
const countFor = (...names) => regions
  .filter(region => names.includes(region.name))
  .reduce((total, region) => total + region.practiceCount, 0)

const surgeries = page => page.locator('[data-test="surgery"]')

async function chooseRegions (page, ...names) {
  await page.goto('/regions')
  for (const name of names) {
    await page.getByRole('checkbox', { name, exact: true }).check()
  }
  await page.getByRole('button', { name: 'Continue' }).click()
}

test.describe('Finding GP surgeries by region', () => {
  test('people are asked which regions to show GP surgeries in', async ({ page }) => {
    await page.goto('/regions')

    const question = page.getByRole('group', { name: 'Which regions do you want to see GP surgeries in?' })
    await expect(question).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which regions do you want to see GP surgeries in?')
    await expect(question.getByText('Select all that apply')).toBeVisible()
    await expect(question.getByRole('checkbox')).toHaveCount(9)
    await expect(question.getByRole('checkbox').first()).toHaveAccessibleName('North East')

    await expectAccessible(page)
    await expectGoodStructure(page)
  })

  test('people who choose East Midlands see only East Midlands surgeries, with the right count', async ({ page }) => {
    await chooseRegions(page, 'East Midlands')

    await expect(page).toHaveURL('/gp-surgeries')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('GP surgeries in East Midlands')
    await expect(page.getByText(`We found ${countFor('East Midlands')} GP surgeries.`)).toBeVisible()
    await expect(surgeries(page)).toHaveCount(25)
    for (const region of await surgeries(page).locator('[data-test="region"]').allInnerTexts()) {
      expect(region.trim()).toBe('East Midlands')
    }

    const first = surgeries(page).first()
    await expect(first.getByRole('heading', { level: 2 })).not.toBeEmpty()
    await expect(first.getByText('ODS code')).toBeVisible()
    await expect(first.getByText('Address')).toBeVisible()
    await expect(first.getByText('Phone')).toBeVisible()

    await expectAccessible(page)
    await expectGoodStructure(page)
  })

  test('people who choose East Midlands and West Midlands see surgeries in both', async ({ page }) => {
    await chooseRegions(page, 'East Midlands', 'West Midlands')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('GP surgeries in East Midlands and West Midlands')
    await expect(page.getByText(`We found ${countFor('East Midlands', 'West Midlands')} GP surgeries.`)).toBeVisible()

    const shown = new Set((await surgeries(page).locator('[data-test="region"]').allInnerTexts()).map(text => text.trim()))
    for (const region of shown) {
      expect(['East Midlands', 'West Midlands']).toContain(region)
    }
    await expectAccessible(page)
  })

  test('people who do not choose a region stay on the question', async ({ page }) => {
    await page.goto('/regions')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL('/regions')
  })

  test('people who go straight to the results without choosing are sent to the question', async ({ page }) => {
    await page.goto('/gp-surgeries')
    await expect(page).toHaveURL('/regions')
  })

  test('the regions people chose are still ticked when they go back', async ({ page }) => {
    await chooseRegions(page, 'East Midlands', 'London')
    await page.getByRole('link', { name: 'Back' }).click()

    await expect(page).toHaveURL('/regions')
    await expect(page.getByRole('checkbox', { name: 'East Midlands', exact: true })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'London', exact: true })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'West Midlands', exact: true })).not.toBeChecked()
  })

  test('people can untick a region when they go back', async ({ page }) => {
    await chooseRegions(page, 'East Midlands', 'West Midlands')
    await page.getByRole('link', { name: 'Back' }).click()
    await page.getByRole('checkbox', { name: 'West Midlands', exact: true }).uncheck()
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText(`We found ${countFor('East Midlands')} GP surgeries.`)).toBeVisible()
  })

  test('people can move through every page of results, and every page is accessible', async ({ page }) => {
    test.slow()
    const total = countFor('North East')
    const totalPages = Math.ceil(total / 25)
    await chooseRegions(page, 'North East')

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      const from = (pageNumber - 1) * 25 + 1
      const to = Math.min(pageNumber * 25, total)
      await expect(page.getByText(`Showing ${from} to ${to} of ${total} GP surgeries`)).toBeVisible()
      await expect(surgeries(page)).toHaveCount(to - from + 1)
      await expect(page.getByRole('link', { name: `Page ${pageNumber}`, exact: true })).toHaveAttribute('aria-current', 'page')
      await expectAccessible(page)
      await expectGoodStructure(page)

      if (pageNumber < totalPages) {
        await page.getByRole('link', { name: /Next/ }).click()
        await expect(page).toHaveURL(`/gp-surgeries?page=${pageNumber + 1}`)
      } else {
        await expect(page.getByRole('link', { name: /Next/ })).toHaveCount(0)
      }
    }

    await page.getByRole('link', { name: 'Page 1', exact: true }).click()
    await expect(page.getByText(`Showing 1 to 25 of ${total} GP surgeries`)).toBeVisible()
  })

  test('surgeries on different pages are not repeated', async ({ page }) => {
    await chooseRegions(page, 'East Midlands')
    const firstPage = await surgeries(page).locator('[data-test="ods-code"]').allInnerTexts()
    await page.getByRole('link', { name: /Next/ }).click()
    const secondPage = await surgeries(page).locator('[data-test="ods-code"]').allInnerTexts()
    expect(secondPage.filter(code => firstPage.includes(code))).toEqual([])
  })
})
