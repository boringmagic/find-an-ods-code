// Builds app/data/gp-practices.json, app/data/regions.json and
// app/data/gp-practices-unmatched.json from:
//
// - app/data/epraccur.csv: ODS GP practices report
// - data-sources/nspl/NSPL_*.csv: ONS National Statistics Postcode Lookup (not committed)
// - planning.data.gov.uk region.csv: names of the 9 English regions
//
// Run with: npm run data:build
// Options (environment variables):
//   EPRACCUR_PATH, NSPL_PATH, REGION_NAMES_URL

import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalisePostcode,
  readPractices,
  readPostcodeLookup,
  readRegionNames,
  assignAreas,
  summariseRegions
} from '../app/lib/gp-practices.js'

const ROOT = new URL('..', import.meta.url).pathname
const DATA = join(ROOT, 'app/data')
const NSPL_DIR = join(ROOT, 'data-sources/nspl')

function findNsplCsv () {
  if (process.env.NSPL_PATH) return process.env.NSPL_PATH
  const files = readdirSync(NSPL_DIR).filter(file => /^NSPL_.*\.csv$/i.test(file))
  if (files.length !== 1) {
    throw new Error(`Expected 1 NSPL_*.csv file in ${NSPL_DIR}, found ${files.length}: ${files.join(', ')}`)
  }
  return join(NSPL_DIR, files[0])
}

async function getRegionNames () {
  // The NSPL download should include a region names and codes file, but this copy does not,
  // so we use the planning.data.gov.uk region dataset
  const url = process.env.REGION_NAMES_URL || 'https://files.planning.data.gov.uk/dataset/region.csv'
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download region names from ${url}: ${response.status}`)
  const names = readRegionNames(await response.text())
  if (names.size !== 9) throw new Error(`Expected 9 English regions from ${url}, found ${names.size}`)
  return { names, url }
}

const writeJson = (name, value) => writeFileSync(join(DATA, name), JSON.stringify(value, null, 2) + '\n')

const epraccurPath = process.env.EPRACCUR_PATH || join(DATA, 'epraccur.csv')
const nsplPath = findNsplCsv()

console.log(`Reading ${epraccurPath}`)
const { totalRead, practices } = await readPractices(epraccurPath)

console.log(`Reading ${nsplPath} (this takes a minute)`)
const wanted = new Set(practices.map(practice => normalisePostcode(practice.postcode)))
const { lookup, columns } = await readPostcodeLookup(nsplPath, wanted)

const { names: regionNames, url: regionNamesUrl } = await getRegionNames()
const { matched, unmatched } = assignAreas(practices, lookup, regionNames)
const regions = summariseRegions(regionNames, matched)

writeJson('gp-practices.json', matched)
writeJson('regions.json', regions)
writeJson('gp-practices-unmatched.json', unmatched)

console.log(`
NSPL columns used: ${Object.entries(columns).map(([key, name]) => `${key}=${name}`).join(', ')}
Region names from: ${regionNamesUrl}

Practices read:      ${totalRead}
Kept (open, RO76):   ${practices.length}
Matched to a region: ${matched.length}
Unmatched:           ${unmatched.length}
`)
console.table(Object.fromEntries(regions.map(region => [region.name, region.practiceCount])))
for (const [reason, count] of Object.entries(Object.groupBy(unmatched, practice => practice.reason))) {
  console.log(`Unmatched – ${reason}: ${count.length}`)
}
