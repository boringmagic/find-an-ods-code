import { test } from 'node:test'
import assert from 'node:assert/strict'
import { simplifyLine, simplifyGeometry } from '../../app/lib/geometry.js'

test('points that lie on a straight line are removed', () => {
  const line = [[0, 0], [1, 0.00001], [2, 0], [3, 0]]
  assert.deepEqual(simplifyLine(line, 0.001), [[0, 0], [3, 0]])
})

test('corners further away than the tolerance are kept', () => {
  const line = [[0, 0], [1, 1], [2, 0]]
  assert.deepEqual(simplifyLine(line, 0.1), [[0, 0], [1, 1], [2, 0]])
})

test('polygon rings stay closed and keep at least 4 points', () => {
  const ring = [[0, 0], [1, 0], [1, 1], [0.5, 1.000001], [0, 1], [0, 0]]
  const result = simplifyGeometry({ type: 'Polygon', coordinates: [ring] }, 0.001)
  const simplified = result.coordinates[0]
  assert.deepEqual(simplified[0], simplified[simplified.length - 1])
  assert.equal(simplified.length, 5)
})

test('tiny rings that would collapse are kept as they were', () => {
  const ring = [[0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0]]
  const result = simplifyGeometry({ type: 'Polygon', coordinates: [ring] }, 1)
  assert.deepEqual(result.coordinates[0], ring)
})

test('multipolygons are simplified part by part and coordinates are rounded', () => {
  const part = [[[0.1234567, 0], [1, 0], [1, 1], [0, 1], [0.1234567, 0]]]
  const result = simplifyGeometry({ type: 'MultiPolygon', coordinates: [part, part] }, 0.001)
  assert.equal(result.type, 'MultiPolygon')
  assert.equal(result.coordinates.length, 2)
  assert.deepEqual(result.coordinates[0][0][0], [0.12346, 0])
})
