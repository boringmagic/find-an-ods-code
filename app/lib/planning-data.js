// Gets area shapes (GeoJSON) from planning.data.gov.uk
// https://www.planning.data.gov.uk/docs

import { getAreaType } from './area-types.js'
import { simplifyGeometry } from './geometry.js'

const SEARCH_URL = 'https://www.planning.data.gov.uk/entity.geojson'
const FILES_URL = 'https://files.planning.data.gov.uk/dataset'
const PAGE_SIZE = 500
const MAX_PAGES = 10

// bbox is [west, south, east, north] in longitude and latitude
export function parseBbox (text) {
  if (typeof text !== 'string') return null
  const bbox = text.split(',').map(Number)
  if (bbox.length !== 4 || bbox.some(Number.isNaN)) return null
  const [west, south, east, north] = bbox
  if (west >= east || south >= north) return null
  return bbox
}

export function bboxToWkt ([west, south, east, north]) {
  const corners = [[west, south], [east, south], [east, north], [west, north], [west, south]]
  return `POLYGON((${corners.map(corner => corner.join(' ')).join(',')}))`
}

export function entitySearchUrl (type, bbox) {
  const url = new URL(SEARCH_URL)
  url.searchParams.set('dataset', type)
  url.searchParams.set('geometry', bboxToWkt(bbox))
  url.searchParams.set('geometry_relation', 'intersects')
  url.searchParams.set('limit', PAGE_SIZE)
  return url.toString()
}

export function datasetDownloadUrl (type) {
  return `${FILES_URL}/${type}.geojson`
}

// Keep only current areas, with simpler shapes and the properties we need
export function slimFeatureCollection (collection, tolerance) {
  const features = (collection.features || [])
    .filter(feature => feature.geometry && !feature.properties['end-date'])
    .map(({ geometry, properties }) => ({
      type: 'Feature',
      geometry: simplifyGeometry(geometry, tolerance),
      properties: {
        entity: Number(properties.entity),
        name: properties.name,
        reference: properties.reference
      }
    }))
  return { type: 'FeatureCollection', features }
}

async function defaultFetchJson (url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`planning.data.gov.uk returned ${response.status} for ${url}`)
  return response.json()
}

async function searchAllPages (url, fetchJson) {
  const features = []
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const collection = await fetchJson(url)
    features.push(...(collection.features || []))
    url = collection.links?.next
  }
  return { type: 'FeatureCollection', features }
}

const sharedCache = new Map()
const MAX_CACHE_ENTRIES = 200

/**
 * Get the areas of one type. Areas with `loadAll` are downloaded once and kept.
 * Smaller areas are searched for in the map view (`bbox`).
 */
export async function getAreas ({ type, bbox, fetchJson = defaultFetchJson, cache = sharedCache }) {
  const areaType = getAreaType(type)
  if (!areaType) throw new Error(`Unknown area type: ${type}`)
  if (!areaType.loadAll && !bbox) throw new Error(`A map view is needed to load ${areaType.plural}`)

  const key = areaType.loadAll ? type : `${type}:${bbox.join(',')}`
  if (!cache.has(key)) {
    // Keep the promise, so people loading the same areas at once share one download
    const promise = (areaType.loadAll
      ? fetchJson(datasetDownloadUrl(type))
      : searchAllPages(entitySearchUrl(type, bbox), fetchJson)
    ).then(collection => slimFeatureCollection(collection, areaType.tolerance))

    promise.catch(() => cache.delete(key))
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value)
    cache.set(key, promise)
  }
  return cache.get(key)
}
