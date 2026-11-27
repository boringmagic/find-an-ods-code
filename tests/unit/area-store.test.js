import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  indexAreas,
  areasInBbox,
  findAreaContaining,
  writeAreaFile,
  readAreaFile,
  createAreaStore
} from '../../app/lib/area-store.js'

const square = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] })
const feature = (entity, name, reference, geometry) => ({ type: 'Feature', geometry, properties: { entity, name, reference } })

const wards = {
  type: 'FeatureCollection',
  features: [
    feature(800101, 'Fallowfield', 'E05011360', square(0, 0, 1, 1)),
    feature(800102, 'Withington', 'E05011376', square(1, 0, 2, 1)),
    feature(800103, 'Far Away', 'E05099999', square(10, 10, 11, 11))
  ]
}
const regions = {
  type: 'FeatureCollection',
  features: [feature(6100004, 'East Midlands', 'E12000004', square(0, 0, 5, 5))]
}

describe('finding areas', () => {
  const index = indexAreas(wards)

  test('areas can be looked up by entity number', () => {
    assert.equal(index.byEntity.get(800102).properties.name, 'Withington')
  })

  test('only areas that overlap the map view are returned', () => {
    assert.deepEqual(areasInBbox(index, [0.5, 0.5, 1.5, 0.8]).map(f => f.properties.name), ['Fallowfield', 'Withington'])
    assert.deepEqual(areasInBbox(index, [5, 5, 6, 6]), [])
  })

  test('the area a point is inside is found', () => {
    assert.equal(findAreaContaining(index, [1.5, 0.5]).properties.name, 'Withington')
  })

  test('a point outside every area finds nothing', () => {
    assert.equal(findAreaContaining(index, [5, 5]), null)
  })
})

describe('area files', () => {
  let dir
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'areas-'))
    writeAreaFile(join(dir, 'ward.geojson.gz'), wards)
    writeAreaFile(join(dir, 'region.geojson.gz'), regions)
  })
  after(() => rmSync(dir, { recursive: true, force: true }))

  test('area files are gzipped GeoJSON that can be read back', () => {
    assert.deepEqual(readAreaFile(join(dir, 'ward.geojson.gz')), wards)
  })

  test('regions and districts are returned all at once', () => {
    const store = createAreaStore({ dir })
    assert.deepEqual(store.getAreas({ type: 'region' }).features.map(f => f.properties.name), ['East Midlands'])
  })

  test('smaller areas are returned for the map view only', () => {
    const store = createAreaStore({ dir })
    const result = store.getAreas({ type: 'ward', bbox: [0.2, 0.2, 0.8, 0.8] })
    assert.deepEqual(result.features.map(f => f.properties.name), ['Fallowfield'])
  })

  test('smaller areas need a map view', () => {
    assert.throws(() => createAreaStore({ dir }).getAreas({ type: 'ward' }), /map view/)
  })

  test('1 area comes back with its type, name and reference', () => {
    const area = createAreaStore({ dir }).getArea({ type: 'ward', entity: 800102 })
    assert.deepEqual(area, { type: 'ward', entity: 800102, name: 'Withington', reference: 'E05011376', geometry: square(1, 0, 2, 1) })
  })

  test('an area that is not of the type chosen is not found', () => {
    assert.throws(() => createAreaStore({ dir }).getArea({ type: 'region', entity: 800102 }), /not a region/)
  })

  test('chosen areas come back as shapes for the map', () => {
    const result = createAreaStore({ dir }).getAreaFeatures({ type: 'ward', entities: [800101, 800103] })
    assert.deepEqual(result.features.map(f => f.properties.name), ['Fallowfield', 'Far Away'])
  })

  test('a file is read once and then reused', () => {
    const store = createAreaStore({ dir })
    store.getAreas({ type: 'region' })
    writeFileSync(join(dir, 'region.geojson.gz'), gzipSync('not json'))
    assert.equal(store.getAreas({ type: 'region' }).features.length, 1)
  })
})
