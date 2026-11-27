// The map on the results page: the chosen areas, with the GP surgeries found shown on top as dots.
// It helps people check they chose the right places. The data comes from the page's
// map-data route (see app/routes.js).

import L from 'leaflet'

// NHS colours. Areas are a light shade; surgeries are dark dots with a white edge
// so they stand out against both the map and the shaded areas
const AREA_STYLE = { color: '#005eb8', weight: 2, fillColor: '#005eb8', fillOpacity: 0.12 }
const SURGERY_STYLE = { radius: 6, color: '#ffffff', weight: 2, fillColor: '#003087', fillOpacity: 1 }
const ENGLAND = [[49.9, -6.4], [55.9, 1.8]]

const mapElement = document.getElementById('surgeries-map')
const status = document.getElementById('surgeries-map-status')

const escapeHtml = text => String(text).replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)

if (mapElement) {
  const map = L.map(mapElement, { zoomSnap: 0.5 }).fitBounds(ENGLAND)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map)

  // Zoom to the areas and surgeries. If the page loaded while the map had no size
  // (for example in a hidden tab), do it again once the map has a size
  let fitTarget = null
  let fitted = false
  const fit = () => {
    if (!fitTarget || !mapElement.clientWidth) return
    map.fitBounds(fitTarget, { padding: [16, 16], maxZoom: 15, animate: false })
    fitted = true
  }
  new ResizeObserver(() => {
    map.invalidateSize()
    if (!fitted) fit()
  }).observe(mapElement)

  showSurgeries(map, bounds => {
    fitTarget = bounds
    fit()
  })
}

async function showSurgeries (map, zoomTo) {
  let data
  try {
    const response = await fetch(mapElement.dataset.src)
    if (!response.ok) throw new Error(`Map data request failed with ${response.status}`)
    data = await response.json()
  } catch (error) {
    console.error(error)
    // CONTENT: placeholder written by agent, needs content design review
    status.textContent = 'Sorry, there is a problem loading the map. The list of GP surgeries is below.'
    return
  }

  // Areas first, so the surgery dots are drawn on top of them
  const areas = L.geoJSON(data.areas, {
    style: AREA_STYLE,
    interactive: false,
    onEachFeature (feature, layer) {
      layer.on('add', () => { layer.getElement().dataset.areaName = feature.properties.name })
    }
  }).addTo(map)

  const surgeries = L.geoJSON(data.surgeries, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, SURGERY_STYLE),
    onEachFeature (feature, layer) {
      const { name, odsCode } = feature.properties
      layer.bindTooltip(escapeHtml(name))
      layer.bindPopup(`<strong>${escapeHtml(name)}</strong><br>ODS code: ${escapeHtml(odsCode)}`)
      layer.on('add', () => { layer.getElement().dataset.surgery = odsCode })
    }
  }).addTo(map)

  const bounds = areas.getBounds().extend(surgeries.getBounds())
  if (bounds.isValid()) zoomTo(bounds)

  const count = data.surgeries.features.length
  // CONTENT: placeholder written by agent, needs content design review
  let message = count
    ? `Showing ${count} GP ${count === 1 ? 'surgery' : 'surgeries'} on the map.`
    : 'There are no GP surgeries to show on the map.'
  if (data.notOnMap) {
    message += ` ${data.notOnMap} cannot be shown because we do not know where they are.`
  }
  status.textContent = message
}
