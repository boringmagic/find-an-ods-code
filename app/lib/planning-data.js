// planning.data.gov.uk area datasets.
// The prototype does not call planning.data.gov.uk while it runs: `npm run areas:download`
// downloads each dataset once and `npm run data:build` turns them into app/data/areas/.
// https://www.planning.data.gov.uk/docs

import { simplifyGeometry } from './geometry.js'

const FILES_URL = 'https://files.planning.data.gov.uk/dataset'

// bbox is [west, south, east, north] in longitude and latitude
export function parseBbox (text) {
  if (typeof text !== 'string') return null
  const bbox = text.split(',').map(Number)
  if (bbox.length !== 4 || bbox.some(Number.isNaN)) return null
  const [west, south, east, north] = bbox
  if (west >= east || south >= north) return null
  return bbox
}

export function datasetDownloadUrl (type) {
  return `${FILES_URL}/${type}.geojson`
}

// Keep only current areas, with the properties we need.
// Shapes are simplified by `tolerance` degrees; 0 keeps them as they are
export function slimFeatureCollection (collection, tolerance) {
  const features = (collection.features || [])
    .filter(feature => feature.geometry && !feature.properties['end-date'])
    .map(({ geometry, properties }) => ({
      type: 'Feature',
      geometry: tolerance ? simplifyGeometry(geometry, tolerance) : geometry,
      properties: {
        entity: Number(properties.entity),
        name: properties.name,
        reference: properties.reference
      }
    }))
  return { type: 'FeatureCollection', features }
}
