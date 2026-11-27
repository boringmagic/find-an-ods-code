// The types of area people can choose from.
// This file is used by both the server (app/routes.js) and the map (app/javascripts/main.js).
//
// value:     the planning.data.gov.uk dataset name
// loadAll:   true  = download every area once (there are only a few hundred)
//            false = only load the areas in the map view, because there are thousands
// minZoom:   how far people need to zoom in before areas are loaded
// tolerance: how much to simplify the shapes, in degrees. Bigger areas can be simplified more

export const AREA_TYPES = [
  { value: 'region', text: 'Region', plural: 'regions', loadAll: true, minZoom: 0, tolerance: 0.003 },
  { value: 'local-authority-district', text: 'Local authority district', plural: 'local authority districts', loadAll: true, minZoom: 0, tolerance: 0.001 },
  { value: 'ward', text: 'Ward', plural: 'wards', loadAll: false, minZoom: 12, tolerance: 0.0001 },
  { value: 'parish', text: 'Parish', plural: 'parishes', loadAll: false, minZoom: 11, tolerance: 0.0002 },
  { value: 'built-up-area', text: 'Built-up area', plural: 'built-up areas', loadAll: false, minZoom: 11, tolerance: 0.0002 }
]

export function getAreaType (value) {
  return AREA_TYPES.find(type => type.value === value)
}
