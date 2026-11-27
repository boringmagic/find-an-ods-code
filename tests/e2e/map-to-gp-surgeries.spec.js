import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { expectAccessible, expectGoodStructure, useFakeAreaData } from './helpers.js'
import { readAreaFile, indexAreas, areasInBbox } from '../../app/lib/area-store.js'

// Expected results come from the generated data in app/data,
// so the tests stay right when the data is rebuilt
const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const regions = readJson('../../app/data/regions.json')
const practices = readJson('../../app/data/gp-practices.json')
const areaFile = type => readAreaFile(new URL(`../../app/data/areas/${type}.geojson.gz`, import.meta.url).pathname)
const SOUTH_MANCHESTER = [-2.3, 53.4, -2.15, 53.5]
const wards = areasInBbox(indexAreas(areaFile('ward')), SOUTH_MANCHESTER)

const eastMidlandsCount = regions.find(region => region.name === 'East Midlands').practiceCount

// The Manchester wards used in these tests. The build stores which ward each surgery is in
function practicesInWards (...names) {
  const entities = wards
    .filter(ward => names.includes(ward.properties.name))
    .map(ward => ward.properties.entity)
  expect(entities).toHaveLength(names.length) // check the names are not ambiguous
  return practices.filter(practice => entities.includes(practice.areaEntities.ward))
}

// A real parish with no GP surgeries in it
function emptyParish () {
  const used = new Set(practices.map(practice => practice.areaEntities.parish))
  return areaFile('parish').features.find(parish => !used.has(parish.properties.entity)).properties
}

const mapShape = (page, name) => page.locator(`.leaflet-overlay-pane [data-area-name="${name}"]`)
// Real shapes are irregular, so the middle of the box around one can be outside it.
// Send the click to the shape itself instead
const selectOnMap = (page, name) => mapShape(page, name).dispatchEvent('click')
const chosenAreas = page => page.getByRole('region', { name: 'Areas you have chosen' })
const surgeries = page => page.locator('[data-test="surgery"]')
const findButton = page => page.getByRole('button', { name: 'Find GP surgeries' })

async function chooseWards (page, ...names) {
  await page.goto('/?areaType=ward&lat=53.445&lng=-2.21&zoom=13')
  for (const name of names) await selectOnMap(page, name)
}

test.describe('Moving from the map to the GP surgeries in the areas chosen', () => {
  test.beforeEach(async ({ page }) => {
    await useFakeAreaData(page)
  })

  test('people who choose a region on the map see the GP surgeries in it', async ({ page }) => {
    await page.goto('/?areaType=region')
    await selectOnMap(page, 'East Midlands')
    await findButton(page).click()

    await expect(page).toHaveURL('/gp-surgeries-in-areas')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('GP surgeries in East Midlands')
    await expect(page.getByText(`We found ${eastMidlandsCount} GP surgeries.`)).toBeVisible()
    for (const area of await surgeries(page).locator('[data-test="area"]').allInnerTexts()) {
      expect(area.trim()).toBe('East Midlands')
    }
    await expectAccessible(page)
    await expectGoodStructure(page)
  })

  test('people who choose wards see the GP surgeries inside those wards', async ({ page }) => {
    const expected = practicesInWards('Rusholme', 'Withington')
    expect(expected.length).toBeGreaterThan(1) // check these wards have surgeries in them

    await chooseWards(page, 'Rusholme', 'Withington')
    await findButton(page).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('GP surgeries in Rusholme and Withington')
    await expect(page.getByText(`We found ${expected.length} GP surgeries.`)).toBeVisible()
    const shownCodes = await surgeries(page).locator('[data-test="ods-code"]').allInnerTexts()
    expect(shownCodes.sort()).toEqual(expected.map(p => p.odsCode).sort())

    const codes = page.getByRole('textbox', { name: `ODS codes for these ${expected.length} GP surgeries` })
    expect((await codes.inputValue()).split('\n').sort()).toEqual(expected.map(p => p.odsCode).sort())

    const first = surgeries(page).first()
    await expect(first.getByText('Ward', { exact: true })).toBeVisible()
    await expectAccessible(page)
    await expectGoodStructure(page)
  })

  test('the surgeries are shown as points on a map, on top of the wards chosen', async ({ page }) => {
    const expected = practicesInWards('Rusholme', 'Withington')
    await chooseWards(page, 'Rusholme', 'Withington')
    await findButton(page).click()

    const map = page.getByRole('region', { name: 'Map of GP surgeries' })
    await expect(map.locator('[data-surgery]')).toHaveCount(expected.length)
    await expect(map.locator('[data-area-name="Rusholme"]')).toHaveCount(1)
    await expect(map.locator('[data-area-name="Withington"]')).toHaveCount(1)

    // Points are drawn after the areas, so they sit on top and can be selected
    const order = await map.locator('.leaflet-overlay-pane path').evaluateAll(paths =>
      paths.map(path => path.hasAttribute('data-surgery') ? 'surgery' : 'area'))
    expect(order.lastIndexOf('area')).toBeLessThan(order.indexOf('surgery'))

    const surgery = expected[0]
    await map.locator(`[data-surgery="${surgery.odsCode}"]`).click({ force: true })
    await expect(map.locator('.leaflet-popup')).toContainText(surgery.name)
    await expect(map.locator('.leaflet-popup')).toContainText(surgery.odsCode)
    await expect(map.locator('.leaflet-popup')).toHaveCSS('opacity', '1') // wait for it to finish fading in
    await expectAccessible(page)
  })

  test('the areas people chose are still chosen when they go back to the map', async ({ page }) => {
    await chooseWards(page, 'Rusholme', 'Withington')
    await findButton(page).click()
    await page.getByRole('link', { name: 'Back' }).click()

    await expect(page.getByRole('radio', { name: 'Ward', exact: true })).toBeChecked()
    await expect(chosenAreas(page).getByRole('term').filter({ hasText: 'Rusholme' })).toBeVisible()
    await expect(chosenAreas(page).getByRole('term').filter({ hasText: 'Withington' })).toBeVisible()
    await expect(mapShape(page, 'Rusholme')).toHaveAttribute('data-selected', 'true')
    await expectAccessible(page)
  })

  test('people can change the areas when they go back', async ({ page }) => {
    await chooseWards(page, 'Rusholme', 'Withington')
    await findButton(page).click()
    await page.getByRole('link', { name: 'Back' }).click()
    await chosenAreas(page).getByRole('button', { name: 'Remove Withington' }).click()
    await findButton(page).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('GP surgeries in Rusholme')
    await expect(page.getByText(`We found ${practicesInWards('Rusholme').length} GP surgeries.`)).toBeVisible()
  })

  test('people who have not chosen any areas stay on the map', async ({ page }) => {
    await page.goto('/?areaType=region')
    await findButton(page).click()
    await expect(page).toHaveURL(/^[^?]*\/(\?.*)?$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose the areas you want ODS codes for')
  })

  test('people who go straight to the results without choosing are sent to the map', async ({ page }) => {
    await page.goto('/gp-surgeries-in-areas')
    await expect(page).toHaveURL('/')
  })

  test('people are told when there are no GP surgeries in the areas they chose', async ({ page }) => {
    const parish = emptyParish()
    await page.request.post('/areas-answer', { form: { chosenAreaType: 'parish', chosenAreas: String(parish.entity) } })
    await page.goto('/gp-surgeries-in-areas')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`GP surgeries in ${parish.name}`)
    await expect(page.getByText('We did not find any GP surgeries in this area.')).toBeVisible()
    await expect(page.getByText(/^Showing \d+ to \d+ of/)).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('There are no GP surgeries to show on the map.')
    await expect(page.locator(`[data-area-name="${parish.name}"]`)).toHaveCount(1) // the area is still shown
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0)
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expectAccessible(page)
    await expectGoodStructure(page)
  })

  test('results for big areas are split into pages', async ({ page }) => {
    await page.goto('/?areaType=region')
    await selectOnMap(page, 'East Midlands')
    await findButton(page).click()
    await page.getByRole('link', { name: /Next/ }).click()

    await expect(page).toHaveURL('/gp-surgeries-in-areas?page=2')
    await expect(page.getByText(`Showing 26 to 50 of ${eastMidlandsCount} GP surgeries`)).toBeVisible()
    await expectAccessible(page)
    await expectGoodStructure(page)
  })
})
