// External dependencies
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'

import { AREA_TYPES, getAreaType } from './lib/area-types.js'
import { parseBbox } from './lib/planning-data.js'
import { createAreaStore } from './lib/area-store.js'
import {
  selectedRegionCodes,
  nextPageAfterRegions,
  filterPracticesByRegions,
  paginate,
  paginationItems,
  listRegionNames,
  joinNames,
  chosenAreaEntities,
  nextPageAfterChoosingAreas,
  practicesInAreas,
  surgeriesMapData,
  odsCodesText
} from './lib/find-gp-surgeries.js'

// Built by `npm run data:build` (scripts/build-gp-practices.js)
const readData = name => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'))
const regions = readData('regions.json')
const gpPractices = readData('gp-practices.json')

// Area shapes, also built by `npm run data:build`, in app/data/areas/.
// The prototype never calls planning.data.gov.uk while it runs
const { getAreas, getArea, getAreaFeatures } = createAreaStore()

const router = express.Router()

// Add your routes here - above the export default line

// Leaflet's CSS and images, for the map
router.use('/leaflet', express.static(fileURLToPath(new URL('../node_modules/leaflet/dist', import.meta.url))))

// Make the area types available to every page
router.use((req, res, next) => {
  res.locals.areaTypes = AREA_TYPES
  res.locals.regions = regions
  next()
})

// Area shapes for the map, from app/data/areas/
// /api/areas?type=region
// /api/areas?type=ward&bbox=west,south,east,north
// /api/areas?type=ward&entity=800101&entity=800102 (areas people chose before)
router.get('/api/areas', async (req, res) => {
  const areaType = getAreaType(req.query.type)
  if (!areaType) {
    return res.status(400).json({ error: 'Choose a type of area' })
  }

  const entities = chosenAreaEntities({ chosenAreas: req.query.entity })
  if (entities.length) {
    try {
      return res.json(await getAreaFeatures({ type: areaType.value, entities }))
    } catch (error) {
      console.error(error)
      return res.status(404).json({ error: 'Could not find those areas' })
    }
  }

  const bbox = parseBbox(req.query.bbox)
  if (!areaType.loadAll && !bbox) {
    return res.status(400).json({ error: 'A map view is needed' })
  }

  try {
    res.json(await getAreas({ type: areaType.value, bbox }))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not load the areas' })
  }
})

// Show 1 page of GP surgeries, for both ways of choosing areas
function renderSurgeries (res, { found, pageParam, areaNames, areaCount, areaLabel, areaTextFor, basePath, backHref }) {
  const results = paginate(found, pageParam)
  const hrefFor = page => `${basePath}?page=${page}`

  res.render('gp-surgeries', {
    mapDataUrl: `${basePath}/map-data`,
    areaNames,
    areaCount,
    areaLabel,
    backHref,
    total: found.length,
    odsCodes: odsCodesText(found),
    results: { ...results, items: results.items.map(practice => ({ ...practice, areaText: areaTextFor(practice) })) },
    paginationParams: {
      items: paginationItems(results.page, results.totalPages, hrefFor),
      previous: results.page > 1 ? { href: hrefFor(results.page - 1) } : undefined,
      next: results.page < results.totalPages ? { href: hrefFor(results.page + 1) } : undefined
    }
  })
}

// Find GP surgeries by region
router.post('/regions-answer', (req, res) => {
  res.redirect(nextPageAfterRegions(req.session.data))
})

router.get('/gp-surgeries', (req, res) => {
  const regionCodes = selectedRegionCodes(req.session.data)
  if (!regionCodes.length) return res.redirect('/regions')

  renderSurgeries(res, {
    found: filterPracticesByRegions(gpPractices, regionCodes),
    pageParam: req.query.page,
    areaNames: listRegionNames(regions, regionCodes),
    areaCount: regionCodes.length,
    areaLabel: 'Region',
    areaTextFor: practice => practice.regionName,
    basePath: '/gp-surgeries',
    backHref: '/regions'
  })
})

// Shapes and points for the map on the results page (app/javascripts/surgeries-map.js)
router.get('/gp-surgeries/map-data', async (req, res) => {
  const regionCodes = selectedRegionCodes(req.session.data)
  const found = filterPracticesByRegions(gpPractices, regionCodes)
  let areaFeatures = []
  try {
    const allRegions = await getAreas({ type: 'region' })
    areaFeatures = allRegions.features.filter(feature => regionCodes.includes(feature.properties.reference))
  } catch (error) {
    console.error(error) // still show the surgeries if the region shapes cannot be loaded
  }
  res.json(surgeriesMapData(found, areaFeatures))
})

// Find GP surgeries in the areas chosen on the map (app/views/index.html)
router.post('/areas-answer', (req, res) => {
  res.redirect(nextPageAfterChoosingAreas(req.session.data))
})

// The areas people chose on the map, with their full shapes, and the surgeries inside them
async function chosenAreasAndSurgeries (data) {
  const areaType = getAreaType(data.chosenAreaType)
  const entities = chosenAreaEntities(data)
  const areas = await Promise.all(entities.map(entity => getArea({ type: areaType.value, entity })))
  return { areaType, entities, areas, found: practicesInAreas(gpPractices, areas) }
}

router.get('/gp-surgeries-in-areas', async (req, res) => {
  if (nextPageAfterChoosingAreas(req.session.data) === '/') return res.redirect('/')

  let chosen
  try {
    chosen = await chosenAreasAndSurgeries(req.session.data)
  } catch (error) {
    console.error(error)
    return res.status(404).render('gp-surgeries-problem')
  }
  const { areaType, areas, found } = chosen

  renderSurgeries(res, {
    found,
    pageParam: req.query.page,
    areaNames: joinNames(areas.map(area => area.name)),
    areaCount: areas.length,
    areaLabel: areaType.text,
    areaTextFor: practice => joinNames(practice.areaNames),
    basePath: '/gp-surgeries-in-areas',
    backHref: '/'
  })
})

router.get('/gp-surgeries-in-areas/map-data', async (req, res) => {
  if (nextPageAfterChoosingAreas(req.session.data) === '/') return res.json(surgeriesMapData([], []))
  try {
    const { areaType, entities, found } = await chosenAreasAndSurgeries(req.session.data)
    // Simpler shapes for drawing; the full shapes were used to find the surgeries
    const { features } = await getAreaFeatures({ type: areaType.value, entities })
    res.json(surgeriesMapData(found, features))
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Could not load the areas' })
  }
})

export default router
