// Builds the prototype's data from files on disk. It does not call any websites.
//
// Reads:
// - app/data/epraccur.csv: ODS GP practices report
// - data-sources/nspl/NSPL_*.csv: ONS National Statistics Postcode Lookup (not committed)
// - data-sources/planning-data/<type>.geojson: planning.data.gov.uk areas
//   (not committed, get them with `npm run areas:download`)
//
// Writes:
// - app/data/gp-practices.json: open GP practices, with their region and the areas they are in
// - app/data/regions.json: the 9 English regions with a count of practices
// - app/data/gp-practices-unmatched.json: practices we could not give a region
// - app/data/areas/<type>.geojson.gz: simplified area shapes for the maps
//
// Run with: npm run data:build
// Options (environment variables): EPRACCUR_PATH, NSPL_PATH

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalisePostcode,
  readPractices,
  readPostcodeLookup,
  regionNamesFromAreas,
  assignAreas,
  addAreaEntities,
  summariseRegions
} from '../app/lib/gp-practices.js'
import { AREA_TYPES } from '../app/lib/area-types.js'
import { slimFeatureCollection } from '../app/lib/planning-data.js'
import { indexAreas, writeAreaFile } from '../app/lib/area-store.js'

const ROOT = new URL('..', import.meta.url).pathname
const DATA = join(ROOT, 'app/data')
const NSPL_DIR = join(ROOT, 'data-sources/nspl')
const PLANNING_DATA_DIR = join(ROOT, 'data-sources/planning-data')
const AREAS_DIR = join(DATA, 'areas')

function findNsplCsv () {
  if (process.env.NSPL_PATH) return process.env.NSPL_PATH
  const files = readdirSync(NSPL_DIR).filter(file => /^NSPL_.*\.csv$/i.test(file))
  if (files.length !== 1) {
    throw new Error(`Expected 1 NSPL_*.csv file in ${NSPL_DIR}, found ${files.length}: ${files.join(', ')}`)
  }
  return join(NSPL_DIR, files[0])
}

// Current areas of 1 type, with full shapes, from the planning.data.gov.uk download
function readDownloadedAreas (type) {
  const path = join(PLANNING_DATA_DIR, `${type}.geojson`)
  try {
    return slimFeatureCollection(JSON.parse(readFileSync(path, 'utf8')), 0)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${path} is missing. Run: npm run areas:download`)
    throw error
  }
}

const writeJson = (name, value) => writeFileSync(join(DATA, name), JSON.stringify(value, null, 2) + '\n')

const epraccurPath = process.env.EPRACCUR_PATH || join(DATA, 'epraccur.csv')
const nsplPath = findNsplCsv()

console.log(`Reading ${epraccurPath}`)
const { totalRead, practices } = await readPractices(epraccurPath)

console.log(`Reading ${nsplPath} (this takes a minute)`)
const wanted = new Set(practices.map(practice => normalisePostcode(practice.postcode)))
const { lookup, columns } = await readPostcodeLookup(nsplPath, wanted)

mkdirSync(AREAS_DIR, { recursive: true })
const areaSummary = {}

// Regions first: practices are given a region by the region code in the NSPL.
// The NSPL download should include a region names file, but this copy does not,
// so the names come from planning.data.gov.uk
const regionAreas = readDownloadedAreas('region')
const regionNames = regionNamesFromAreas(regionAreas)
if (regionNames.size !== 9) throw new Error(`Expected 9 English regions, found ${regionNames.size}`)
const { matched: practicesWithRegion, unmatched } = assignAreas(practices, lookup, regionNames)
let matched = practicesWithRegion

// Then each type of area, 1 at a time to keep memory down
for (const areaType of AREA_TYPES) {
  console.log(`Building ${areaType.plural}`)
  const areas = areaType.value === 'region' ? regionAreas : readDownloadedAreas(areaType.value)

  if (areaType.value !== 'region') {
    // Use the full shapes to find which area each practice's postcode is inside
    const index = indexAreas(areas)
    matched = addAreaEntities(matched, { [areaType.value]: index }).map((practice, i) => ({
      ...practice,
      areaEntities: { ...matched[i].areaEntities, ...practice.areaEntities }
    }))
    areaSummary[areaType.text] = {
      areas: areas.features.length,
      'practices not in one': matched.filter(practice => practice.areaEntities[areaType.value] === null).length
    }
  } else {
    areaSummary[areaType.text] = { areas: areas.features.length, 'practices not in one': 0 }
  }

  // Simpler shapes for drawing on the maps
  writeAreaFile(join(AREAS_DIR, `${areaType.value}.geojson.gz`), slimFeatureCollection(areas, areaType.tolerance))
}

const regions = summariseRegions(regionNames, matched)

writeJson('gp-practices.json', matched)
writeJson('regions.json', regions)
writeJson('gp-practices-unmatched.json', unmatched)

console.log(`
NSPL columns used: ${Object.entries(columns).map(([key, name]) => `${key}=${name}`).join(', ')}
Areas from: ${PLANNING_DATA_DIR}

Practices read:      ${totalRead}
Kept (open, RO76):   ${practices.length}
Matched to a region: ${matched.length}
Unmatched:           ${unmatched.length}
`)
console.table(Object.fromEntries(regions.map(region => [region.name, region.practiceCount])))
for (const [reason, count] of Object.entries(Object.groupBy(unmatched, practice => practice.reason))) {
  console.log(`Unmatched – ${reason}: ${count.length}`)
}
console.table(areaSummary)
