import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AREA_TYPES, getAreaType } from '../../app/lib/area-types.js'

test('people can choose from the 5 area types, in order of size', () => {
  assert.deepEqual(AREA_TYPES.map(type => type.value), [
    'region',
    'local-authority-district',
    'ward',
    'parish',
    'built-up-area'
  ])
})

test('each area type has a plural name to use in messages', () => {
  assert.equal(getAreaType('ward').plural, 'wards')
  assert.equal(getAreaType('local-authority-district').plural, 'local authority districts')
})

test('regions and districts are loaded all at once, smaller areas only when zoomed in', () => {
  assert.equal(getAreaType('region').loadAll, true)
  assert.equal(getAreaType('local-authority-district').loadAll, true)
  for (const value of ['ward', 'parish', 'built-up-area']) {
    assert.equal(getAreaType(value).loadAll, false)
    assert.ok(getAreaType(value).minZoom >= 10, `${value} needs a minimum zoom`)
  }
})

test('an unknown area type is not accepted', () => {
  assert.equal(getAreaType('country'), undefined)
  assert.equal(getAreaType(undefined), undefined)
})
