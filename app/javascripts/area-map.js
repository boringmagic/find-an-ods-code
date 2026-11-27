// The map on the home page: shows areas of the chosen type and lets people select them.
// Areas come from our own /api/areas route (see app/routes.js), which reads them from app/data/areas/.

import L from 'leaflet'
import { getAreaType } from '../lib/area-types.js'

const ENGLAND = [[49.9, -6.4], [55.9, 1.8]]

// NHS colours. Chosen areas also have a thicker border, so colour is not the only difference
const AREA_STYLE = { color: '#005eb8', weight: 1, fillColor: '#005eb8', fillOpacity: 0.08 }
const CHOSEN_STYLE = { color: '#003087', weight: 3, fillColor: '#005eb8', fillOpacity: 0.45 }

const mapElement = document.getElementById('map')
const form = document.querySelector('[data-module="app-area-type-form"]')
const status = document.getElementById('map-status')
const areaList = document.getElementById('area-list')
const chosenAreas = document.getElementById('chosen-areas')
const findForm = document.getElementById('find-surgeries-form')
const chosenAreaFields = document.getElementById('chosen-area-fields')

let areaType = null
let loaded = new Map() // entity number → GeoJSON feature, for the areas loaded now
const chosen = new Map() // entity number → GeoJSON feature, for the areas people have chosen
const shapes = new Map() // entity number → Leaflet layer on the map
const loadAllCache = new Map() // area type → features, for types that load all at once
let currentRequest = null

const map = L.map(mapElement, { zoomSnap: 0.5 })
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map)

const areaLayer = L.geoJSON(null, {
  style: feature => chosen.has(feature.properties.entity) ? CHOSEN_STYLE : AREA_STYLE,
  onEachFeature (feature, layer) {
    const { entity, name } = feature.properties
    shapes.set(entity, layer)
    layer.bindTooltip(name, { sticky: true })
    layer.on('click', () => toggleArea(entity))
    layer.on('add', () => {
      const element = layer.getElement()
      element.dataset.areaName = name
      element.dataset.selected = String(chosen.has(entity))
    })
  }
}).addTo(map)

// Start where the URL says, or show all of England
const params = new URLSearchParams(window.location.search)
const [lat, lng, zoom] = ['lat', 'lng', 'zoom'].map(key => Number(params.get(key)))
const hasViewInUrl = params.has('zoom') && !Number.isNaN(lat + lng + zoom)
const startView = () => hasViewInUrl ? map.setView([lat, lng], zoom) : map.fitBounds(ENGLAND)
startView()

// If the page loaded while the map had no size (for example in a hidden tab),
// fit the view again once it has one
let hadSize = mapElement.clientWidth > 0
new ResizeObserver(() => {
  map.invalidateSize()
  if (!hadSize && mapElement.clientWidth > 0) {
    hadSize = true
    startView()
  }
}).observe(mapElement)

function checkedAreaType () {
  return getAreaType(form.querySelector('input[name="areaType"]:checked')?.value)
}

function setStatus (text) {
  status.textContent = text
}

function updateUrl () {
  const center = map.getCenter()
  const url = new URL(window.location.href)
  if (areaType) url.searchParams.set('areaType', areaType.value)
  url.searchParams.set('lat', center.lat.toFixed(4))
  url.searchParams.set('lng', center.lng.toFixed(4))
  url.searchParams.set('zoom', map.getZoom())
  window.history.replaceState(null, '', url)
}

// Make the map view a little bigger and round it, so small moves reuse the same request
function roundedBbox () {
  const bounds = map.getBounds()
  return [
    Math.floor(bounds.getWest() * 100) / 100,
    Math.floor(bounds.getSouth() * 100) / 100,
    Math.ceil(bounds.getEast() * 100) / 100,
    Math.ceil(bounds.getNorth() * 100) / 100
  ].join(',')
}

async function fetchAreas (type, bbox) {
  currentRequest?.abort()
  currentRequest = new AbortController()
  const query = new URLSearchParams({ type: type.value })
  if (bbox) query.set('bbox', bbox)
  const response = await fetch(`/api/areas?${query}`, { signal: currentRequest.signal })
  if (!response.ok) throw new Error(`Areas request failed with ${response.status}`)
  return (await response.json()).features
}

async function loadAreas () {
  const type = areaType
  if (!type) return

  if (!type.loadAll && map.getZoom() < type.minZoom) {
    currentRequest?.abort()
    loaded = new Map()
    draw()
    setStatus(`Zoom in to see ${type.plural}.`)
    return
  }

  try {
    let features = loadAllCache.get(type.value)
    if (!features) {
      setStatus(`Loading ${type.plural}…`)
      features = await fetchAreas(type, type.loadAll ? null : roundedBbox())
      if (type.loadAll) loadAllCache.set(type.value, features)
    }
    if (type !== areaType) return // people changed the type while this was loading
    loaded = new Map(features.map(feature => [feature.properties.entity, feature]))
    draw()
    // CONTENT: placeholder written by agent, needs content design review
    setStatus(`Showing ${features.length} ${type.plural}.`)
  } catch (error) {
    if (error.name === 'AbortError') return
    console.error(error)
    // CONTENT: placeholder written by agent, needs content design review
    setStatus(`Sorry, there is a problem loading the ${type.plural}. Try again later.`)
  }
}

function draw () {
  areaLayer.clearLayers()
  shapes.clear()
  const features = new Map([...loaded, ...chosen])
  areaLayer.addData({ type: 'FeatureCollection', features: [...features.values()] })
  renderAreaList()
  renderChosenAreas()
}

function toggleArea (entity) {
  if (chosen.has(entity)) {
    chosen.delete(entity)
  } else {
    chosen.set(entity, loaded.get(entity))
  }

  const shape = shapes.get(entity)
  if (shape) {
    shape.setStyle(chosen.has(entity) ? CHOSEN_STYLE : AREA_STYLE)
    shape.getElement().dataset.selected = String(chosen.has(entity))
  }
  // Keep chosen areas that have scrolled out of the loaded set on the map
  if (!shape || !loaded.has(entity)) draw()
  renderAreaList()
  renderChosenAreas()
}

const byName = (a, b) => a.properties.name.localeCompare(b.properties.name)

const escapeHtml = text => String(text).replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`)

// The list lets people choose areas without using the map. It shows the areas in the map view
function renderAreaList () {
  const bounds = map.getBounds()
  const inView = [...loaded.values()]
    .filter(feature => shapes.get(feature.properties.entity)?.getBounds().intersects(bounds))
    .sort(byName)

  if (!inView.length) {
    areaList.innerHTML = `<p>${areaType ? status.textContent : 'There are no areas to show yet.'}</p>`
    return
  }

  const items = inView.map(({ properties: { entity, name } }) => `
    <div class="nhsuk-checkboxes__item">
      <input class="nhsuk-checkboxes__input" id="area-${entity}" type="checkbox" value="${entity}" ${chosen.has(entity) ? 'checked' : ''}>
      <label class="nhsuk-label nhsuk-checkboxes__label" for="area-${entity}">${escapeHtml(name)}</label>
    </div>`).join('')

  // CONTENT: placeholder written by agent, needs content design review
  areaList.innerHTML = `
    <div class="nhsuk-form-group">
      <fieldset class="nhsuk-fieldset" aria-describedby="area-list-hint">
        <legend class="nhsuk-fieldset__legend nhsuk-fieldset__legend--s">Areas on the map</legend>
        <div class="nhsuk-hint" id="area-list-hint">This list shows the ${areaType.plural} in the part of the map you can see.</div>
        <div class="nhsuk-checkboxes">${items}</div>
      </fieldset>
    </div>`
}

// Fill in the hidden fields that send the chosen areas to /areas-answer.
// "_unchecked" tells the kit to forget areas chosen before, if none are chosen now
function updateFindForm () {
  findForm.elements.areaType.value = areaType?.value ?? ''
  findForm.elements.chosenAreaType.value = areaType?.value ?? ''
  chosenAreaFields.innerHTML = ['_unchecked', ...chosen.keys()]
    .map(entity => `<input type="hidden" name="chosenAreas" value="${entity}">`)
    .join('')
}

function renderChosenAreas () {
  updateFindForm()
  if (!chosen.size) {
    chosenAreas.innerHTML = '<p>You have not chosen any areas yet.</p>'
    return
  }

  const rows = [...chosen.values()].sort(byName).map(({ properties: { entity, name, reference } }) => `
    <div class="nhsuk-summary-list__row">
      <dt class="nhsuk-summary-list__key">${escapeHtml(name)}</dt>
      <dd class="nhsuk-summary-list__value">${escapeHtml(reference)}</dd>
      <dd class="nhsuk-summary-list__actions">
        <button type="button" class="app-link-button" data-remove="${entity}">
          Remove<span class="nhsuk-u-visually-hidden"> ${escapeHtml(name)}</span>
        </button>
      </dd>
    </div>`).join('')

  const count = chosen.size === 1 ? `1 ${areaType.text.toLowerCase()}` : `${chosen.size} ${areaType.plural}`
  chosenAreas.innerHTML = `
    <p>You have chosen ${count}.</p>
    <dl class="nhsuk-summary-list">${rows}</dl>`
}

function showAreaType (type) {
  if (type === areaType) return
  areaType = type
  chosen.clear()
  loaded = new Map()
  draw()
  updateUrl()
  loadAreas()
}

form.addEventListener('submit', event => {
  event.preventDefault()
  const type = checkedAreaType()
  if (type) {
    showAreaType(type)
  } else {
    // CONTENT: placeholder written by agent, needs content design review
    setStatus('Choose a type of area to see areas on the map.')
  }
})

areaList.addEventListener('change', event => {
  if (event.target.matches('.nhsuk-checkboxes__input')) toggleArea(Number(event.target.value))
})

chosenAreas.addEventListener('click', event => {
  const button = event.target.closest('[data-remove]')
  if (button) toggleArea(Number(button.dataset.remove))
})

map.on('moveend', () => {
  updateUrl()
  if (areaType && !areaType.loadAll) {
    loadAreas()
  } else {
    renderAreaList()
  }
})

// Show the areas people chose before, when they come back from the list of GP surgeries
async function restoreChosenAreas (type) {
  let entities = []
  try {
    entities = [JSON.parse(mapElement.dataset.chosenAreas || 'null')].flat()
      .filter(entity => /^\d+$/.test(entity))
  } catch {}
  if (mapElement.dataset.chosenAreaType !== type.value || !entities.length) return

  const query = new URLSearchParams({ type: type.value })
  entities.forEach(entity => query.append('entity', entity))
  try {
    const response = await fetch(`/api/areas?${query}`)
    if (!response.ok) throw new Error(`Areas request failed with ${response.status}`)
    const { features } = await response.json()
    if (type !== areaType) return
    features.forEach(feature => chosen.set(feature.properties.entity, feature))
    draw()
    if (!hasViewInUrl && features.length) {
      map.fitBounds(L.geoJSON({ type: 'FeatureCollection', features }).getBounds(), { maxZoom: 14 })
    }
  } catch (error) {
    console.error(error)
  }
}

// Show the type of area people chose before, if there is one
const startingType = checkedAreaType()
if (startingType) {
  showAreaType(startingType)
  restoreChosenAreas(startingType)
} else {
  updateFindForm()
}
