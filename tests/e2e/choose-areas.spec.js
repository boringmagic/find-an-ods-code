import { test, expect } from '@playwright/test'
import { expectAccessible, expectGoodStructure, useFakeAreaData } from './helpers.js'

const chosenAreas = page => page.getByRole('region', { name: 'Areas you have chosen' })
const areasOnMap = page => page.getByRole('group', { name: 'Areas on the map' })
const chosenArea = (page, name) => chosenAreas(page).getByRole('term').filter({ hasText: name })
const mapShape = (page, name) => page.locator(`.leaflet-overlay-pane [data-area-name="${name}"]`)
// Real shapes are irregular, so the middle of the box around one can be outside it.
// Send the click to the shape itself instead
const selectOnMap = (page, name) => mapShape(page, name).dispatchEvent('click')

async function openAreaList (page) {
  await page.getByText('Choose areas from a list instead').click()
}

async function showAreas (page, typeName) {
  await page.getByRole('radio', { name: typeName, exact: true }).check()
  await page.getByRole('button', { name: 'Show areas' }).click()
}

test.describe('Choosing areas on a map', () => {
  test('people are asked what type of area they want to choose', async ({ page }) => {
    await useFakeAreaData(page)
    await page.goto('/')

    const question = page.getByRole('group', { name: 'What type of area do you want to choose?' })
    for (const name of ['Region', 'Local authority district', 'Ward', 'Parish', 'Built-up area']) {
      await expect(question.getByRole('radio', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('region', { name: 'Map' })).toBeVisible()
    await expect(chosenAreas(page)).toContainText('You have not chosen any areas yet.')

    await expectAccessible(page)
    await expectGoodStructure(page)
  })

  test('choosing region shows the regions on the map and in a list', async ({ page }) => {
    const requests = await useFakeAreaData(page)
    await page.goto('/')
    await showAreas(page, 'Region')
    await openAreaList(page)

    await expect(mapShape(page, 'North West')).toBeVisible()
    await expect(mapShape(page, 'Yorkshire and The Humber')).toBeVisible()
    await expect(areasOnMap(page).getByRole('checkbox', { name: 'North West' })).not.toBeChecked()
    await expect(page.getByRole('status')).toContainText('Showing 9 regions')
    expect(requests[0].searchParams.get('type')).toBe('region')

    await expectAccessible(page)
    await expectGoodStructure(page)
  })

  test('selecting an area on the map adds it to the areas chosen', async ({ page }) => {
    await useFakeAreaData(page)
    await page.goto('/')
    await showAreas(page, 'Region')
    await openAreaList(page)

    await selectOnMap(page, 'North West')

    await expect(chosenArea(page, 'North West')).toBeVisible()
    await expect(chosenAreas(page)).toContainText('E12000002')
    await expect(areasOnMap(page).getByRole('checkbox', { name: 'North West' })).toBeChecked()
    await expect(mapShape(page, 'North West')).toHaveAttribute('data-selected', 'true')
    await expectAccessible(page)
  })

  test('selecting a chosen area on the map again removes it', async ({ page }) => {
    await useFakeAreaData(page)
    await page.goto('/')
    await showAreas(page, 'Region')

    await selectOnMap(page, 'North West')
    await selectOnMap(page, 'North West')

    await expect(chosenAreas(page)).toContainText('You have not chosen any areas yet.')
    await expect(mapShape(page, 'North West')).toHaveAttribute('data-selected', 'false')
  })

  test('people who cannot use the map can choose areas from the list', async ({ page }) => {
    await useFakeAreaData(page)
    await page.goto('/')
    await showAreas(page, 'Region')
    await openAreaList(page)

    await areasOnMap(page).getByRole('checkbox', { name: 'Yorkshire and The Humber' }).check()

    await expect(chosenArea(page, 'Yorkshire and The Humber')).toBeVisible()
    await expect(mapShape(page, 'Yorkshire and The Humber')).toHaveAttribute('data-selected', 'true')
  })

  test('people can remove an area they have chosen', async ({ page }) => {
    await useFakeAreaData(page)
    await page.goto('/')
    await showAreas(page, 'Region')
    await openAreaList(page)
    await areasOnMap(page).getByRole('checkbox', { name: 'North West' }).check()
    await areasOnMap(page).getByRole('checkbox', { name: 'Yorkshire and The Humber' }).check()

    await chosenAreas(page).getByRole('button', { name: 'Remove North West' }).click()

    await expect(chosenAreas(page)).not.toContainText('North West')
    await expect(chosenAreas(page)).toContainText('Yorkshire and The Humber')
    await expect(areasOnMap(page).getByRole('checkbox', { name: 'North West' })).not.toBeChecked()
  })

  test('people are told to zoom in before wards are shown', async ({ page }) => {
    const requests = await useFakeAreaData(page)
    await page.goto('/')
    await showAreas(page, 'Ward')

    await expect(page.getByRole('status')).toContainText('Zoom in to see wards')
    await openAreaList(page)
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    expect(requests).toHaveLength(0)
  })

  test('wards in the map view are shown when people are zoomed in', async ({ page }) => {
    const requests = await useFakeAreaData(page)
    await page.goto('/?areaType=ward&lat=53.446&lng=-2.22&zoom=13')

    await expect(page.getByRole('radio', { name: 'Ward', exact: true })).toBeChecked()
    await expect(mapShape(page, 'Fallowfield')).toBeVisible()
    await expect(page.getByRole('status')).toContainText(/Showing \d+ wards/)

    const bbox = requests.at(-1).searchParams.get('bbox').split(',').map(Number)
    expect(bbox[0]).toBeLessThan(-2.22)
    expect(bbox[2]).toBeGreaterThan(-2.22)

    await selectOnMap(page, 'Withington')
    await expect(chosenArea(page, 'Withington')).toBeVisible()
    await expectAccessible(page)
  })

  test('choosing a different type of area clears the areas chosen', async ({ page }) => {
    await useFakeAreaData(page)
    await page.goto('/?areaType=region')
    await openAreaList(page)
    await areasOnMap(page).getByRole('checkbox', { name: 'North West' }).check()

    await showAreas(page, 'Ward')

    await expect(chosenAreas(page)).toContainText('You have not chosen any areas yet.')
  })

  test('the type of area is kept when people reload the page', async ({ page }) => {
    await useFakeAreaData(page)
    await page.goto('/')
    await showAreas(page, 'Parish')
    await page.reload()

    await expect(page.getByRole('radio', { name: 'Parish', exact: true })).toBeChecked()
  })

  test('people are told when the areas cannot be loaded', async ({ page }) => {
    await useFakeAreaData(page, { fail: true })
    await page.goto('/')
    await showAreas(page, 'Region')

    await expect(page.getByRole('status')).toContainText('Sorry, there is a problem loading the regions. Try again later.')
  })
})
