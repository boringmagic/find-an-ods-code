// Makes GeoJSON shapes smaller so they load quickly in the browser.
// Uses the Douglas-Peucker method: drop points that are closer than
// `tolerance` (in degrees) to the line between their neighbours.

const PRECISION = 1e5 // 5 decimal places is about 1 metre

function distanceToSegment ([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  let t = lengthSquared ? ((x - x1) * dx + (y - y1) * dy) / lengthSquared : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

export function simplifyLine (points, tolerance) {
  if (points.length <= 2) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]

  while (stack.length) {
    const [start, end] = stack.pop()
    let furthest = -1
    let furthestDistance = tolerance
    for (let i = start + 1; i < end; i++) {
      const distance = distanceToSegment(points[i], points[start], points[end])
      if (distance > furthestDistance) {
        furthest = i
        furthestDistance = distance
      }
    }
    if (furthest !== -1) {
      keep[furthest] = 1
      stack.push([start, furthest], [furthest, end])
    }
  }

  return points.filter((point, i) => keep[i])
}

const round = ([x, y]) => [Math.round(x * PRECISION) / PRECISION, Math.round(y * PRECISION) / PRECISION]

function simplifyRing (ring, tolerance) {
  // A ring starts and ends on the same point, so split it at the point
  // furthest from the start to stop the whole ring collapsing to a line
  let split = 1
  for (let i = 1; i < ring.length - 1; i++) {
    if (Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]) >
        Math.hypot(ring[split][0] - ring[0][0], ring[split][1] - ring[0][1])) split = i
  }
  const simplified = [
    ...simplifyLine(ring.slice(0, split + 1), tolerance),
    ...simplifyLine(ring.slice(split), tolerance).slice(1)
  ]
  return (simplified.length >= 4 ? simplified : ring).map(round)
}

const simplifyPolygon = (rings, tolerance) => rings.map(ring => simplifyRing(ring, tolerance))

export function simplifyGeometry (geometry, tolerance) {
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: simplifyPolygon(geometry.coordinates, tolerance) }
  }
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(polygon => simplifyPolygon(polygon, tolerance)) }
  }
  return geometry
}
