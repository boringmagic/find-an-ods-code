import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  selectedRegionCodes,
  nextPageAfterRegions,
  filterPracticesByRegions,
  paginate,
  paginationItems,
  listRegionNames,
  joinNames,
  chosenAreaEntities,
  nextPageAfterChoosingAreas,
  practicesInAreas,
  surgeriesMapData,
  odsCodesText
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

describe('joining names', () => {
  test('names are joined with commas and "and"', () => {
    assert.equal(joinNames(['Leeds']), 'Leeds')
    assert.equal(joinNames(['Leeds', 'Bradford']), 'Leeds and Bradford')
    assert.equal(joinNames(['Leeds', 'Bradford', 'York']), 'Leeds, Bradford and York')
  })
})

describe('the areas people chose on the map', () => {
  test('areas come back from the form as entity numbers, 1 as text or several as a list', () => {
    assert.deepEqual(chosenAreaEntities({ chosenAreas: '8600050' }), [8600050])
    assert.deepEqual(chosenAreaEntities({ chosenAreas: ['8600050', '8600051'] }), [8600050, 8600051])
  })

  test('anything that is not an entity number is ignored, and so are repeats', () => {
    assert.deepEqual(chosenAreaEntities({ chosenAreas: ['8600050', 'nonsense', '', '8600050', '-4'] }), [8600050])
    assert.deepEqual(chosenAreaEntities({}), [])
  })

  test('people who chose areas go to the GP surgeries in those areas', () => {
    assert.equal(nextPageAfterChoosingAreas({ chosenAreaType: 'ward', chosenAreas: ['800101'] }), '/gp-surgeries-in-areas')
  })

  test('people who chose no areas, or no known type of area, go back to the map', () => {
    assert.equal(nextPageAfterChoosingAreas({ chosenAreaType: 'ward' }), '/')
    assert.equal(nextPageAfterChoosingAreas({ chosenAreaType: 'country', chosenAreas: ['1'] }), '/')
  })
})

describe('finding the GP surgeries in the areas people chose', () => {
  // The build works out which areas each surgery's postcode is in (see addAreaEntities)
  const practices = [
    { odsCode: 'P1', name: 'IN WEST', regionCode: 'E12000004', areaEntities: { ward: 1, parish: 7 } },
    { odsCode: 'P2', name: 'ALSO IN WEST', regionCode: 'E12000004', areaEntities: { ward: 1, parish: null } },
    { odsCode: 'P3', name: 'IN EAST', regionCode: 'E12000005', areaEntities: { ward: 2, parish: null } },
    { odsCode: 'P4', name: 'ELSEWHERE', regionCode: 'E12000005', areaEntities: { ward: 3, parish: null } },
    { odsCode: 'P5', name: 'NO LOCATION', regionCode: 'E12000004', areaEntities: { ward: null, parish: null } }
  ]
  const west = { type: 'ward', entity: 1, name: 'West ward', reference: 'E05000001' }
  const east = { type: 'ward', entity: 2, name: 'East ward', reference: 'E05000002' }

  test('surgeries in an area are found', () => {
    assert.deepEqual(practicesInAreas(practices, [west]).map(p => p.odsCode), ['P1', 'P2'])
  })

  test('several areas return surgeries in any of them, saying which area they are in', () => {
    assert.deepEqual(practicesInAreas(practices, [west, east]).map(p => [p.odsCode, p.areaNames]), [
      ['P1', ['West ward']],
      ['P2', ['West ward']],
      ['P3', ['East ward']]
    ])
  })

  test('areas are matched within their own type only', () => {
    const parish = { type: 'parish', entity: 7, name: 'Parish 7', reference: 'E04000007' }
    const sameNumberDifferentType = { type: 'parish', entity: 1, name: 'Parish 1', reference: 'E04000001' }
    assert.deepEqual(practicesInAreas(practices, [parish]).map(p => p.odsCode), ['P1'])
    assert.deepEqual(practicesInAreas(practices, [sameNumberDifferentType]), [])
  })

  test('regions are matched by region code, so they agree with the list of regions', () => {
    const eastMidlands = { type: 'region', entity: 30100003, name: 'East Midlands', reference: 'E12000004' }
    assert.deepEqual(practicesInAreas(practices, [eastMidlands]).map(p => p.odsCode), ['P1', 'P2', 'P5'])
  })

  test('no areas returns no surgeries', () => {
    assert.deepEqual(practicesInAreas(practices, []), [])
  })
})

describe('map data for the results page', () => {
  const area = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    properties: { entity: 1, name: 'West ward', reference: 'E05000001' }
  }
  const found = [
    { odsCode: 'P1', name: 'IN WEST', latitude: 0.5, longitude: 0.25, phone: '01234 567890' },
    { odsCode: 'P5', name: 'NO LOCATION', latitude: null, longitude: null }
  ]

  test('chosen areas are kept as shapes, to go beneath the surgeries', () => {
    const { areas } = surgeriesMapData(found, [area])
    assert.equal(areas.type, 'FeatureCollection')
    assert.deepEqual(areas.features, [area])
  })

  test('each surgery becomes a point with its name and ODS code', () => {
    const { surgeries } = surgeriesMapData(found, [area])
    assert.deepEqual(surgeries.features[0], {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0.25, 0.5] },
      properties: { odsCode: 'P1', name: 'IN WEST' }
    })
  })

  test('surgeries without a location are left off the map and counted', () => {
    const { surgeries, notOnMap } = surgeriesMapData(found, [area])
    assert.equal(surgeries.features.length, 1)
    assert.equal(notOnMap, 1)
  })
})

describe('the ODS codes to copy', () => {
  test('codes are listed 1 on each line, in the same order as the surgeries', () => {
    assert.equal(odsCodesText([{ odsCode: 'C85003' }, { odsCode: 'A00001' }]), 'C85003\nA00001')
  })

  test('no surgeries means no codes', () => {
    assert.equal(odsCodesText([]), '')
  })
})
