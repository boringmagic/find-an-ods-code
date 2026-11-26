import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  selectedRegionCodes,
  nextPageAfterRegions,
  filterPracticesByRegions,
  paginate,
  paginationItems,
  listRegionNames
} from '../../app/lib/find-gp-surgeries.js'

const practices = [
  { odsCode: 'A1', name: 'A', regionCode: 'E12000004' },
  { odsCode: 'A2', name: 'B', regionCode: 'E12000005' },
  { odsCode: 'A3', name: 'C', regionCode: 'E12000004' },
  { odsCode: 'A4', name: 'D', regionCode: 'E12000007' }
]

describe('the regions people chose', () => {
  test('1 region comes back from the form as text, several as a list', () => {
    assert.deepEqual(selectedRegionCodes({ regions: 'E12000004' }), ['E12000004'])
    assert.deepEqual(selectedRegionCodes({ regions: ['E12000004', 'E12000005'] }), ['E12000004', 'E12000005'])
  })

  test('no answer, or the kit\'s "_unchecked" marker, means no regions', () => {
    assert.deepEqual(selectedRegionCodes({}), [])
    assert.deepEqual(selectedRegionCodes({ regions: '_unchecked' }), [])
    assert.deepEqual(selectedRegionCodes({ regions: ['_unchecked', 'E12000004'] }), ['E12000004'])
  })

  test('codes that are not English regions are ignored', () => {
    assert.deepEqual(selectedRegionCodes({ regions: ['E12000004', 'W99999999', 'nonsense'] }), ['E12000004'])
  })
})

describe('where people go after choosing regions', () => {
  test('people who choose a region go to the list of GP surgeries', () => {
    assert.equal(nextPageAfterRegions({ regions: ['E12000004'] }), '/gp-surgeries')
  })

  test('people who do not choose a region stay on the question', () => {
    assert.equal(nextPageAfterRegions({}), '/regions')
  })
})

describe('filtering practices by region', () => {
  test('1 region returns only practices in that region', () => {
    assert.deepEqual(filterPracticesByRegions(practices, ['E12000004']).map(p => p.odsCode), ['A1', 'A3'])
  })

  test('several regions return practices in any of them', () => {
    assert.deepEqual(filterPracticesByRegions(practices, ['E12000004', 'E12000005']).map(p => p.odsCode), ['A1', 'A2', 'A3'])
  })

  test('no regions returns no practices', () => {
    assert.deepEqual(filterPracticesByRegions(practices, []), [])
  })
})

describe('splitting results into pages of 25', () => {
  const items = Array.from({ length: 60 }, (_, i) => i + 1)

  test('the first page has items 1 to 25', () => {
    const result = paginate(items, undefined)
    assert.equal(result.page, 1)
    assert.equal(result.totalPages, 3)
    assert.deepEqual([result.from, result.to], [1, 25])
    assert.equal(result.items.length, 25)
  })

  test('the last page has what is left', () => {
    const result = paginate(items, '3')
    assert.deepEqual(result.items, [51, 52, 53, 54, 55, 56, 57, 58, 59, 60])
    assert.deepEqual([result.from, result.to], [51, 60])
  })

  test('page numbers that do not exist show the nearest real page', () => {
    assert.equal(paginate(items, '99').page, 3)
    assert.equal(paginate(items, '0').page, 1)
    assert.equal(paginate(items, 'abc').page, 1)
    assert.equal(paginate([], '2').page, 1)
  })
})

describe('page number links', () => {
  const href = page => `/gp-surgeries?page=${page}`
  const summary = items => items.map(item => item.ellipsis ? '…' : (item.current ? `[${item.number}]` : item.number)).join(' ')

  test('a few pages are all shown', () => {
    assert.equal(summary(paginationItems(2, 3, href)), '1 [2] 3')
  })

  test('with many pages, the first, last and pages either side of this one are shown', () => {
    assert.equal(summary(paginationItems(1, 21, href)), '[1] 2 … 21')
    assert.equal(summary(paginationItems(10, 21, href)), '1 … 9 [10] 11 … 21')
    assert.equal(summary(paginationItems(21, 21, href)), '1 … 20 [21]')
    assert.equal(summary(paginationItems(3, 21, href)), '1 2 [3] 4 … 21')
  })

  test('each page links to its own address', () => {
    assert.equal(paginationItems(1, 3, href)[2].href, '/gp-surgeries?page=3')
  })

  test('a single page has no links', () => {
    assert.deepEqual(paginationItems(1, 1, href), [])
  })
})

describe('naming the regions people chose', () => {
  const regions = [
    { code: 'E12000004', name: 'East Midlands' },
    { code: 'E12000005', name: 'West Midlands' },
    { code: 'E12000007', name: 'London' }
  ]

  test('names are joined with commas and "and", in the order of the list', () => {
    assert.equal(listRegionNames(regions, ['E12000004']), 'East Midlands')
    assert.equal(listRegionNames(regions, ['E12000005', 'E12000004']), 'East Midlands and West Midlands')
    assert.equal(listRegionNames(regions, ['E12000007', 'E12000004', 'E12000005']), 'East Midlands, West Midlands and London')
  })
})
