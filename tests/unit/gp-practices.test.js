import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseCsvLine,
  parseCsv,
  normalisePostcode,
  parsePractice,
  isOpenGpPractice,
  findNsplColumns,
  readPractices,
  readPostcodeLookup,
  regionNamesFromAreas,
  assignAreas,
  addAreaEntities,
  summariseRegions
} from '../../app/lib/gp-practices.js'
import { indexAreas } from '../../app/lib/area-store.js'

const fixture = name => new URL(`../fixtures/${name}`, import.meta.url)

describe('reading CSV', () => {
  test('quoted values are unquoted, including ones with commas in', () => {
    assert.deepEqual(parseCsvLine('"A00011","WITH, COMMA SURGERY","",52.9'), ['A00011', 'WITH, COMMA SURGERY', '', '52.9'])
  })

  test('doubled quotes inside a quoted value become one quote', () => {
    assert.deepEqual(parseCsvLine('"ST JOHN""S","X"'), ['ST JOHN"S', 'X'])
  })

  test('a whole file is split into rows, ignoring blank lines', () => {
    assert.deepEqual(parseCsv('a,b\r\n"c,d",e\n\n'), [['a', 'b'], ['c,d', 'e']])
  })
})

describe('postcodes', () => {
  test('postcodes match whatever the spaces and case', () => {
    assert.equal(normalisePostcode('ng2 2bb'), 'NG22BB')
    assert.equal(normalisePostcode('NG2  2BB'), 'NG22BB')
    assert.equal(normalisePostcode(' NG22BB '), 'NG22BB')
  })
})

describe('choosing which practices to keep', () => {
  const row = overrides => {
    const fields = Array(27).fill('')
    Object.entries(overrides).forEach(([column, value]) => { fields[Number(column) - 1] = value })
    return parsePractice(fields)
  }

  test('an active practice with the GP practice role (RO76) is kept', () => {
    assert.equal(isOpenGpPractice(row({ 13: 'ACTIVE', 26: 'RO76' })), true)
  })

  test('RO76 is found when it is 1 of several roles', () => {
    assert.equal(isOpenGpPractice(row({ 13: 'ACTIVE', 26: 'RO76|RO268' })), true)
    assert.equal(isOpenGpPractice(row({ 13: 'ACTIVE', 26: 'RO72|RO76' })), true)
  })

  test('out-of-hours (RO80), walk-in (RO247) and other settings are left out', () => {
    for (const setting of ['RO80', 'RO247', 'RO72', 'RO760', '']) {
      assert.equal(isOpenGpPractice(row({ 13: 'ACTIVE', 26: setting })), false, setting)
    }
  })

  test('inactive and dormant practices are left out', () => {
    assert.equal(isOpenGpPractice(row({ 13: 'INACTIVE', 26: 'RO76' })), false)
    assert.equal(isOpenGpPractice(row({ 13: 'DORMANT', 26: 'RO76' })), false)
  })

  test('the columns are read from their positions in the ODS report', () => {
    const practice = row({
      1: 'A00010', 2: 'ABBEY ROAD PRACTICE', 4: 'QHM', 5: '', 6: 'ABBEY ROAD', 7: '', 8: 'NEWCASTLE UPON TYNE',
      10: 'NE1 1AA', 13: 'ACTIVE', 18: '0191 000 0000', 26: 'RO76'
    })
    assert.deepEqual(practice, {
      odsCode: 'A00010',
      name: 'ABBEY ROAD PRACTICE',
      addressLines: ['ABBEY ROAD'],
      town: 'NEWCASTLE UPON TYNE',
      postcode: 'NE1 1AA',
      phone: '0191 000 0000',
      icbCode: 'QHM',
      status: 'ACTIVE',
      prescribingSettings: ['RO76']
    })
  })
})

describe('reading the ODS report', () => {
  test('only open GP practices are kept, and every row is counted', async () => {
    const { totalRead, practices } = await readPractices(fixture('epraccur-no-header.csv'))
    assert.equal(totalRead, 11)
    assert.deepEqual(practices.map(p => p.odsCode).sort(), ['A00001', 'A00002', 'A00007', 'A00008', 'A00009', 'A00010', 'A00011'])
  })

  test('a header row is skipped if there is one', async () => {
    const { totalRead, practices } = await readPractices(fixture('epraccur-with-header.csv'))
    assert.equal(totalRead, 2)
    assert.deepEqual(practices.map(p => p.odsCode), ['A00001', 'A00002'])
  })
})

describe('reading the postcode lookup (NSPL)', () => {
  const header = readFileSync(fixture('nspl.csv'), 'utf8').split(/\r?\n/)[0]

  test('columns are found by name, whatever the edition year', () => {
    assert.deepEqual(findNsplColumns(parseCsvLine(header)), {
      postcode: 'pcds',
      region: 'rgn26cd',
      latitude: 'lat',
      longitude: 'long'
    })
    assert.equal(findNsplColumns(['pcds', 'rgn27cd', 'lat', 'long']).region, 'rgn27cd')
  })

  test('a lookup without a postcode or region column is rejected', () => {
    assert.throws(() => findNsplColumns(['pcds', 'lad26cd']), /region/)
  })

  test('only postcodes that practices use are kept', async () => {
    const wanted = new Set(['NG11AA', 'B11AA'])
    const { lookup } = await readPostcodeLookup(fixture('nspl.csv'), wanted)
    assert.deepEqual([...lookup.keys()].sort(), ['B11AA', 'NG11AA'])
    assert.deepEqual(lookup.get('NG11AA'), {
      regionCode: 'E12000004',
      latitude: 52.95,
      longitude: -1.15
    })
  })
})

test('a postcode with no location gets null, not 0', async () => {
  const { lookup } = await readPostcodeLookup(fixture('nspl.csv'), new Set(['LS11AA']))
  assert.equal(lookup.get('LS11AA').latitude, null)
})

// Region names come from the planning.data.gov.uk region shapes, already slimmed by the build
const REGION_NAMES = ['North East', 'North West', 'Yorkshire and The Humber', 'East Midlands', 'West Midlands',
  'East of England', 'London', 'South East', 'South West']
const regionAreas = {
  type: 'FeatureCollection',
  features: [...REGION_NAMES.entries()].reverse().map(([i, name]) => ({
    type: 'Feature',
    geometry: null,
    properties: { entity: 6100000 + i, name, reference: `E1200000${i + 1}` }
  }))
}

describe('giving practices a region', async () => {
  const { practices } = await readPractices(fixture('epraccur-no-header.csv'))
  const wanted = new Set(practices.map(p => normalisePostcode(p.postcode)))
  const { lookup } = await readPostcodeLookup(fixture('nspl.csv'), wanted)
  const regionNames = regionNamesFromAreas(regionAreas)
  const { matched, unmatched } = assignAreas(practices, lookup, regionNames)
  const byCode = code => matched.find(p => p.odsCode === code)

  test('region names come from the region code', () => {
    assert.equal(regionNames.size, 9)
    assert.equal(regionNames.get('E12000004'), 'East Midlands')
  })

  test('2 practices in the same NHS England region (Y60) go to East Midlands and West Midlands', () => {
    assert.equal(byCode('A00001').regionCode, 'E12000004')
    assert.equal(byCode('A00001').regionName, 'East Midlands')
    assert.equal(byCode('A00002').regionCode, 'E12000005')
    assert.equal(byCode('A00002').regionName, 'West Midlands')
  })

  test('postcodes match even when the ODS report has no space or lowercase', () => {
    assert.equal(byCode('A00007').regionCode, 'E12000004')
    assert.equal(byCode('A00011').regionCode, 'E12000005')
  })

  test('the output has the fields the prototype needs', () => {
    assert.deepEqual(byCode('A00010'), {
      odsCode: 'A00010',
      name: 'ABBEY ROAD PRACTICE',
      addressLines: ['ABBEY ROAD'],
      town: 'NEWCASTLE UPON TYNE',
      postcode: 'NE1 1AA',
      phone: '0191 000 0000',
      icbCode: 'QHM',
      regionCode: 'E12000001',
      regionName: 'North East',
      latitude: 54.97,
      longitude: -1.61
    })
  })

  test('practices are sorted by name', () => {
    const names = matched.map(p => p.name)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
  })

  test('practices whose postcode is not found or not in England go to the unmatched list', () => {
    assert.deepEqual(unmatched.map(p => [p.odsCode, p.reason]), [
      ['A00009', 'Postcode is not in an English region'],
      ['A00008', 'Postcode not found in the NSPL']
    ])
    assert.equal(byCode('A00008'), undefined)
    assert.equal(byCode('A00009'), undefined)
  })

  test('every region is listed in ONS order with a count of practices', () => {
    const regions = summariseRegions(regionNames, matched)
    assert.deepEqual(regions.map(r => r.code), [
      'E12000001', 'E12000002', 'E12000003', 'E12000004', 'E12000005',
      'E12000006', 'E12000007', 'E12000008', 'E12000009'
    ])
    assert.deepEqual(regions[3], { code: 'E12000004', name: 'East Midlands', practiceCount: 2 })
    assert.equal(regions[4].practiceCount, 2)
    assert.equal(regions[1].practiceCount, 0)
  })
})

describe('finding which areas each practice is in', () => {
  const square = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] })
  const areas = (...features) => indexAreas({ type: 'FeatureCollection', features })
  const area = (entity, geometry) => ({ type: 'Feature', geometry, properties: { entity, name: `Area ${entity}`, reference: `E0${entity}` } })

  const indexes = {
    'local-authority-district': areas(area(8600001, square(0, 0, 10, 10))),
    ward: areas(area(800101, square(0, 0, 1, 1)), area(800102, square(1, 0, 2, 1))),
    parish: areas(area(130000001, square(0, 0, 1, 1)))
  }
  const practices = [
    { odsCode: 'P1', latitude: 0.5, longitude: 1.5 },
    { odsCode: 'P2', latitude: 0.5, longitude: 0.5 },
    { odsCode: 'P3', latitude: null, longitude: null }
  ]
  const [inWithington, inFallowfield, noLocation] = addAreaEntities(practices, indexes)

  test('each practice gets the entity number of the area its postcode is in, for each type', () => {
    assert.deepEqual(inFallowfield.areaEntities, {
      'local-authority-district': 8600001,
      ward: 800101,
      parish: 130000001
    })
  })

  test('a practice outside every area of a type gets null for that type', () => {
    assert.deepEqual(inWithington.areaEntities, {
      'local-authority-district': 8600001,
      ward: 800102,
      parish: null
    })
  })

  test('a practice with no location is in no areas', () => {
    assert.deepEqual(noLocation.areaEntities, {
      'local-authority-district': null,
      ward: null,
      parish: null
    })
  })

  test('the other details are kept', () => {
    assert.equal(inFallowfield.odsCode, 'P2')
  })
})
