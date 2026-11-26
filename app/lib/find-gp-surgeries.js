// Logic for the "find GP surgeries by region" pages. Routes in app/routes.js stay thin.

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
  const names = regions.filter(region => regionCodes.includes(region.code)).map(region => region.name)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('')
}
