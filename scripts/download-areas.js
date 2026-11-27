// Downloads the planning.data.gov.uk area datasets once, into data-sources/planning-data/.
// They are large (about 475MB) so they are not committed. Run `npm run data:build` next.
//
// Run with: npm run areas:download

import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { AREA_TYPES } from '../app/lib/area-types.js'
import { datasetDownloadUrl } from '../app/lib/planning-data.js'

const DIR = new URL('../data-sources/planning-data/', import.meta.url).pathname
mkdirSync(DIR, { recursive: true })

for (const { value } of AREA_TYPES) {
  const url = datasetDownloadUrl(value)
  const path = join(DIR, `${value}.geojson`)
  process.stdout.write(`Downloading ${url} … `)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path))
  console.log('done')
}

console.log(`\nSaved to ${DIR}\nNow run: npm run data:build`)
