import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseBbox,
  datasetDownloadUrl,
  slimFeatureCollection
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

test('each type of area is downloaded once from the planning data files service', () => {
  assert.equal(datasetDownloadUrl('region'), 'https://files.planning.data.gov.uk/dataset/region.geojson')
  assert.equal(datasetDownloadUrl('built-up-area'), 'https://files.planning.data.gov.uk/dataset/built-up-area.geojson')
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
