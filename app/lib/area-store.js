// Area shapes stored on the server, in app/data/areas/<type>.geojson.gz.
// They are made by `npm run data:build` from planning.data.gov.uk downloads,
// so the prototype never calls planning.data.gov.uk while it runs.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { getAreaType } from './area-types.js'
import { geometryBbox, pointInGeometry } from './geometry.js'

export const AREAS_DIR = new URL('../data/areas/', import.meta.url).pathname

const overlaps = ([w1, s1, e1, n1], [w2, s2, e2, n2]) => w1 <= e2 && e1 >= w2 && s1 <= n2 && n1 >= s2

// Work out each area's bounding box once, so searches can skip areas quickly
export function indexAreas (collection) {
  const features = collection.features.filter(feature => feature.geometry)
  return {
    features,
    bboxes: features.map(feature => geometryBbox(feature.geometry)),
    byEntity: new Map(features.map(feature => [feature.properties.entity, feature]))
  }
}

export function areasInBbox (index, bbox) {
  return index.features.filter((feature, i) => overlaps(index.bboxes[i], bbox))
}

// [longitude, latitude] → the area it is inside, or null
export function findAreaContaining (index, point) {
  const [x, y] = point
  const pointBox = [x, y, x, y]
  for (let i = 0; i < index.features.length; i++) {
    if (overlaps(index.bboxes[i], pointBox) && pointInGeometry(point, index.features[i].geometry)) {
      return index.features[i]
    }
  }
  return null
}

export function writeAreaFile (path, collection) {
  writeFileSync(path, gzipSync(JSON.stringify(collection)))
}

export function readAreaFile (path) {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'))
}

export function createAreaStore ({ dir = AREAS_DIR } = {}) {
  const indexes = new Map()

  // Read each file the first time it is needed, then keep it
  function indexFor (type) {
    if (!getAreaType(type)) throw new Error(`Unknown area type: ${type}`)
    if (!indexes.has(type)) indexes.set(type, indexAreas(readAreaFile(join(dir, `${type}.geojson.gz`))))
    return indexes.get(type)
  }

  return {
    // All regions or districts, or the smaller areas in a map view
    getAreas ({ type, bbox }) {
      const areaType = getAreaType(type)
      if (!areaType) throw new Error(`Unknown area type: ${type}`)
      if (!areaType.loadAll && !bbox) throw new Error(`A map view is needed to load ${areaType.plural}`)
      const index = indexFor(type)
      return { type: 'FeatureCollection', features: areaType.loadAll ? index.features : areasInBbox(index, bbox) }
    },

    // 1 area, checking it is the type people chose
    getArea ({ type, entity }) {
      const feature = indexFor(type).byEntity.get(entity)
      if (!feature) throw new Error(`Area ${entity} is not a ${getAreaType(type).text.toLowerCase()}`)
      const { name, reference } = feature.properties
      return { type, entity, name, reference, geometry: feature.geometry }
    },

    // Chosen areas as shapes for the map
    getAreaFeatures ({ type, entities }) {
      const index = indexFor(type)
      return { type: 'FeatureCollection', features: entities.map(entity => index.byEntity.get(entity)).filter(Boolean) }
    }
  }
}
