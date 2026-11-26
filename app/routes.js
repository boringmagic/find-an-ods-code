// External dependencies
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'

import { AREA_TYPES, getAreaType } from './lib/area-types.js'
import { getAreas, parseBbox } from './lib/planning-data.js'
import {
  selectedRegionCodes,
  nextPageAfterRegions,
  filterPracticesByRegions,
  paginate,
  paginationItems,
  listRegionNames
} from './lib/find-gp-surgeries.js'

// Built by `npm run data:build` (scripts/build-gp-practices.js)
const readData = name => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'))
const regions = readData('regions.json')
const gpPractices = readData('gp-practices.json')

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

// Area shapes for the map, from planning.data.gov.uk
// /api/areas?type=region
// /api/areas?type=ward&bbox=west,south,east,north
router.get('/api/areas', async (req, res) => {
  const areaType = getAreaType(req.query.type)
  if (!areaType) {
    return res.status(400).json({ error: 'Choose a type of area' })
  }

  const bbox = parseBbox(req.query.bbox)
  if (!areaType.loadAll && !bbox) {
    return res.status(400).json({ error: 'A map view is needed' })
  }

  try {
    res.json(await getAreas({ type: areaType.value, bbox }))
  } catch (error) {
    console.error(error)
    res.status(502).json({ error: 'Could not get areas from planning.data.gov.uk' })
  }
})

// Find GP surgeries by region
router.post('/regions-answer', (req, res) => {
  res.redirect(nextPageAfterRegions(req.session.data))
})

router.get('/gp-surgeries', (req, res) => {
  const regionCodes = selectedRegionCodes(req.session.data)
  if (!regionCodes.length) return res.redirect('/regions')

  const found = filterPracticesByRegions(gpPractices, regionCodes)
  const results = paginate(found, req.query.page)

  res.render('gp-surgeries', {
    regionNames: listRegionNames(regions, regionCodes),
    total: found.length,
    results,
    paginationParams: {
      items: paginationItems(results.page, results.totalPages, page => `/gp-surgeries?page=${page}`),
      previous: results.page > 1 ? { href: `/gp-surgeries?page=${results.page - 1}` } : undefined,
      next: results.page < results.totalPages ? { href: `/gp-surgeries?page=${results.page + 1}` } : undefined
    }
  })
})

export default router
