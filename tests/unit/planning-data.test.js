import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBbox,
  bboxToWkt,
  entitySearchUrl,
  datasetDownloadUrl,
  slimFeatureCollection,
  getAreas
} from '../../app/lib/planning-data.js'

test('a map view is read from "west,south,east,north"', () => {
  assert.deepEqual(parseBbox('-2.3,53.4,-2.15,53.5'), [-2.3, 53.4, -2.15, 53.5])
})

test('a map view that is missing, not numbers or back to front is rejected', () => {
  assert.equal(parseBbox(undefined), null)
  assert.equal(parseBbox('a,b,c,d'), null)
  assert.equal(parseBbox('1,2,3'), null)
  assert.equal(parseBbox('-2,54,-3,53'), null)
})

test('a map view becomes a closed polygon for the planning data search', () => {
  assert.equal(
    bboxToWkt([-2.3, 53.4, -2.15, 53.5]),
    'POLYGON((-2.3 53.4,-2.15 53.4,-2.15 53.5,-2.3 53.5,-2.3 53.4))'
  )
})

test('wards in a map view are searched for on planning.data.gov.uk', () => {
  const url = new URL(entitySearchUrl('ward', [-2.3, 53.4, -2.15, 53.5]))
  assert.equal(url.origin + url.pathname, 'https://www.planning.data.gov.uk/entity.geojson')
  assert.equal(url.searchParams.get('dataset'), 'ward')
  assert.equal(url.searchParams.get('geometry_relation'), 'intersects')
  assert.equal(url.searchParams.get('geometry'), 'POLYGON((-2.3 53.4,-2.15 53.4,-2.15 53.5,-2.3 53.5,-2.3 53.4))')
  assert.equal(url.searchParams.get('limit'), '500')
})

test('all regions are downloaded from the planning data files service', () => {
  assert.equal(datasetDownloadUrl('region'), 'https://files.planning.data.gov.uk/dataset/region.geojson')
})

const collection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      properties: { entity: '800000', name: 'Ainsdale', reference: 'E05000932', 'end-date': '', quality: 'some' }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      properties: { entity: '800001', name: 'Old ward', reference: 'E05000001', 'end-date': '2019-05-02' }
    },
    {
      type: 'Feature',
      geometry: null,
      properties: { entity: '800002', name: 'No shape', reference: 'E05000002', 'end-date': '' }
    }
  ]
}

test('areas that have ended or have no shape are left out', () => {
  const result = slimFeatureCollection(collection, 0.001)
  assert.deepEqual(result.features.map(f => f.properties.name), ['Ainsdale'])
})

test('only the entity, name and reference are kept for each area', () => {
  const result = slimFeatureCollection(collection, 0.001)
  assert.deepEqual(result.features[0].properties, { entity: 800000, name: 'Ainsdale', reference: 'E05000932' })
})

test('every page of search results is collected', async () => {
  const pages = {
    first: { type: 'FeatureCollection', features: [collection.features[0]], links: { next: 'second' } },
    second: { type: 'FeatureCollection', features: [{ ...collection.features[0], properties: { ...collection.features[0].properties, entity: '800009', name: 'Birkdale' } }], links: {} }
  }
  const requested = []
  const fetchJson = async url => {
    requested.push(url)
    return url.includes('entity.geojson') ? pages.first : pages[url]
  }

  const result = await getAreas({ type: 'ward', bbox: [-2.3, 53.4, -2.15, 53.5], fetchJson })
  assert.deepEqual(result.features.map(f => f.properties.name), ['Ainsdale', 'Birkdale'])
  assert.equal(requested.length, 2)
})

test('areas that load all at once are downloaded once and then reused', async () => {
  let calls = 0
  const fetchJson = async () => { calls++; return collection }
  const cache = new Map()

  await getAreas({ type: 'region', fetchJson, cache })
  const result = await getAreas({ type: 'region', fetchJson, cache })
  assert.equal(calls, 1)
  assert.equal(result.features.length, 1)
})

test('smaller areas need a map view', async () => {
  await assert.rejects(getAreas({ type: 'ward', fetchJson: async () => collection }), /map view/)
})
