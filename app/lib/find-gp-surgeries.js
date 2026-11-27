// Logic for the "find GP surgeries" pages. Routes in app/routes.js stay thin.

import { getAreaType } from './area-types.js'

const ENGLISH_REGION = /^E12\d{6}$/
export const PER_PAGE = 25

// The kit gives 1 ticked checkbox as text and several as a list
export function selectedRegionCodes (data) {
  const answer = data.regions
  const codes = Array.isArray(answer) ? answer : [answer]
  return codes.filter(code => typeof code === 'string' && ENGLISH_REGION.test(code))
}

export function nextPageAfterRegions (data) {
  return selectedRegionCodes(data).length ? '/gp-surgeries' : '/regions'
}

export function filterPracticesByRegions (practices, regionCodes) {
  const wanted = new Set(regionCodes)
  return practices.filter(practice => wanted.has(practice.regionCode))
}

export function paginate (items, pageParam, perPage = PER_PAGE) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage))
  const requested = Number.parseInt(pageParam, 10)
  const page = Number.isNaN(requested) ? 1 : Math.min(Math.max(requested, 1), totalPages)
  const start = (page - 1) * perPage
  const pageItems = items.slice(start, start + perPage)
  return {
    items: pageItems,
    page,
    totalPages,
    from: pageItems.length ? start + 1 : 0,
    to: start + pageItems.length
  }
}

// Numbered links for the NHS.UK pagination component: the first and last page,
// and the pages either side of this one, with "…" for gaps
export function paginationItems (page, totalPages, hrefFor) {
  if (totalPages <= 1) return []
  const items = []
  for (let number = 1; number <= totalPages; number++) {
    const nearCurrent = Math.abs(number - page) <= 1
    if (number === 1 || number === totalPages || nearCurrent) {
      items.push({ number, href: hrefFor(number), current: number === page })
    } else if (!items.at(-1).ellipsis) {
      items.push({ ellipsis: true })
    }
  }
  return items
}

// "East Midlands, West Midlands and London", in the same order as the list of regions
export function listRegionNames (regions, regionCodes) {
  return joinNames(regions.filter(region => regionCodes.includes(region.code)).map(region => region.name))
}

export function joinNames (names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('')
}

// Areas chosen on the map are sent as planning.data.gov.uk entity numbers
export function chosenAreaEntities (data) {
  const answer = data.chosenAreas
  const values = Array.isArray(answer) ? answer : [answer]
  const entities = values
    .filter(value => typeof value === 'string' && /^\d+$/.test(value))
    .map(Number)
  return [...new Set(entities)]
}

export function nextPageAfterChoosingAreas (data) {
  const hasType = Boolean(getAreaType(data.chosenAreaType))
  return hasType && chosenAreaEntities(data).length ? '/gp-surgeries-in-areas' : '/'
}

// Regions are matched by code, because the region code comes from the same postcode lookup.
// Other areas are matched using the areas the build found each surgery's postcode inside
// (see addAreaEntities in gp-practices.js). We do not use ward and district codes from
// the postcode lookup, because they can be a different year from the planning.data.gov.uk
// areas, and parishes have no code in the lookup.
function areaContains (area, practice) {
  if (area.type === 'region') return practice.regionCode === area.reference
  return practice.areaEntities?.[area.type] === area.entity
}

export function practicesInAreas (practices, areas) {
  const found = []
  for (const practice of practices) {
    const areaNames = areas.filter(area => areaContains(area, practice)).map(area => area.name)
    if (areaNames.length) found.push({ ...practice, areaNames })
  }
  return found
}

// What the results map needs: the chosen areas as shapes, and every surgery found as a point
export function surgeriesMapData (practices, areaFeatures) {
  const located = practices.filter(({ latitude, longitude }) =>
    typeof latitude === 'number' && typeof longitude === 'number')

  return {
    areas: { type: 'FeatureCollection', features: areaFeatures },
    surgeries: {
      type: 'FeatureCollection',
      features: located.map(({ odsCode, name, latitude, longitude }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties: { odsCode, name }
      }))
    },
    notOnMap: practices.length - located.length
  }
}

// ODS codes for people to copy, 1 on each line so they paste into a spreadsheet column
export function odsCodesText (practices) {
  return practices.map(practice => practice.odsCode).join('\n')
}
