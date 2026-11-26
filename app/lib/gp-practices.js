// Pure functions and file readers for building app/data/gp-practices.json.
// Used by scripts/build-gp-practices.js and tested in tests/unit/gp-practices.test.js.
//
// Sources:
// - ODS "GP Practices (Prescribing Cost Centres)" report (epraccur.csv)
// - ONS National Statistics Postcode Lookup (NSPL)
// - planning.data.gov.uk region dataset, for region names

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

const GP_PRACTICE_ROLE = 'RO76'
const ENGLISH_REGION = /^E12\d{6}$/

// Split 1 CSV line into values. Handles quoted values with commas and "" inside
export function parseCsvLine (line) {
  const values = []
  let value = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const character = line[i]
    if (inQuotes) {
      if (character === '"' && line[i + 1] === '"') {
        value += '"'
        i++
      } else if (character === '"') {
        inQuotes = false
      } else {
        value += character
      }
    } else if (character === '"') {
      inQuotes = true
    } else if (character === ',') {
      values.push(value)
      value = ''
    } else {
      value += character
    }
  }
  values.push(value)
  return values
}

export function parseCsv (text) {
  return text.split(/\r?\n/).filter(line => line.trim() !== '').map(parseCsvLine)
}

async function * readCsvRows (path) {
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity })
  for await (const line of lines) {
    if (line.trim() !== '') yield parseCsvLine(line)
  }
}

export function normalisePostcode (postcode = '') {
  return postcode.replace(/\s+/g, '').toUpperCase()
}

// Read 1 row of epraccur.csv. Column numbers are from the ODS spec, counting from 1
export function parsePractice (fields) {
  const column = number => (fields[number - 1] ?? '').trim()
  return {
    odsCode: column(1),
    name: column(2),
    addressLines: [column(5), column(6), column(7)].filter(Boolean),
    town: column(8),
    postcode: column(10),
    phone: column(18),
    icbCode: column(4),
    status: column(13),
    prescribingSettings: column(26).split('|').map(code => code.trim()).filter(Boolean)
  }
}

export function isOpenGpPractice (practice) {
  return practice.status === 'ACTIVE' && practice.prescribingSettings.includes(GP_PRACTICE_ROLE)
}

export async function readPractices (path) {
  let totalRead = 0
  const practices = []
  for await (const fields of readCsvRows(path)) {
    if (totalRead === 0 && fields[0] === 'Organisation Code') continue // header row
    totalRead++
    const practice = parsePractice(fields)
    if (isOpenGpPractice(practice)) practices.push(practice)
  }
  return { totalRead, practices }
}

// NSPL column names include the year of the boundaries (rgn26cd, lad26cd),
// which changes between editions, so find them by pattern
const NSPL_COLUMNS = {
  postcode: /^pcds$/,
  region: /^rgn\d{2}cd$/,
  localAuthorityDistrict: /^lad\d{2}cd$/,
  ward: /^wd\d{2}cd$/,
  builtUpArea: /^bua\d{2}cd$/
}
const REQUIRED_NSPL_COLUMNS = ['postcode', 'region']

export function findNsplColumns (header) {
  const columns = {}
  for (const [key, pattern] of Object.entries(NSPL_COLUMNS)) {
    const name = header.find(column => pattern.test(column.trim().toLowerCase()))
    if (name) columns[key] = name.trim()
    else if (REQUIRED_NSPL_COLUMNS.includes(key)) {
      throw new Error(`Could not find the ${key} column in the NSPL header`)
    }
  }
  return columns
}

// Stream the NSPL and keep only the postcodes in `wantedPostcodes` (normalised)
export async function readPostcodeLookup (path, wantedPostcodes) {
  const lookup = new Map()
  let columns
  let index

  for await (const fields of readCsvRows(path)) {
    if (!columns) {
      columns = findNsplColumns(fields)
      index = Object.fromEntries(Object.entries(columns).map(([key, name]) => [key, fields.indexOf(name)]))
      continue
    }
    const postcode = normalisePostcode(fields[index.postcode])
    if (!wantedPostcodes.has(postcode)) continue
    const value = key => (index[key] === undefined ? '' : fields[index[key]] ?? '')
    lookup.set(postcode, {
      regionCode: value('region'),
      ladCode: value('localAuthorityDistrict'),
      wardCode: value('ward'),
      builtUpAreaCode: value('builtUpArea')
    })
  }
  return { lookup, columns }
}

// Region names from planning.data.gov.uk region.csv (reference and name columns)
export function readRegionNames (text) {
  const [header, ...rows] = parseCsv(text)
  const reference = header.indexOf('reference')
  const name = header.indexOf('name')
  const endDate = header.indexOf('end-date')
  return new Map(rows
    .filter(row => ENGLISH_REGION.test(row[reference]) && !(endDate >= 0 && row[endDate]))
    .map(row => [row[reference], row[name]])
    .sort(([a], [b]) => a.localeCompare(b)))
}

const byName = (a, b) => a.name.localeCompare(b.name) || a.odsCode.localeCompare(b.odsCode)

export function assignAreas (practices, lookup, regionNames) {
  const matched = []
  const unmatched = []

  for (const { status, prescribingSettings, ...practice } of practices) {
    const areas = lookup.get(normalisePostcode(practice.postcode))
    if (!areas) {
      unmatched.push({ ...practice, reason: 'Postcode not found in the NSPL' })
    } else if (!regionNames.has(areas.regionCode)) {
      unmatched.push({ ...practice, regionCode: areas.regionCode, reason: 'Postcode is not in an English region' })
    } else {
      matched.push({
        ...practice,
        regionCode: areas.regionCode,
        regionName: regionNames.get(areas.regionCode),
        ladCode: areas.ladCode,
        wardCode: areas.wardCode,
        builtUpAreaCode: areas.builtUpAreaCode
      })
    }
  }

  return { matched: matched.sort(byName), unmatched: unmatched.sort(byName) }
}

export function summariseRegions (regionNames, practices) {
  return [...regionNames].map(([code, name]) => ({
    code,
    name,
    practiceCount: practices.filter(practice => practice.regionCode === code).length
  }))
}
