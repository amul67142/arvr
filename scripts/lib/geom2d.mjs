/**
 * The small 2D helpers the hotspot projector needs: convex hull, polyline
 * simplification, point-in-polygon and area.
 *
 * Deliberately dependency-free and deliberately separate from the renderer, so
 * that when the projector's polygons are checked against a rendered ID pass,
 * the two are genuinely independent implementations rather than the same
 * mistake agreeing with itself.
 */

/** Andrew's monotone chain. Returns the hull in counter-clockwise order. */
export function convexHull(points) {
  if (points.length < 3) return [...points]
  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const half = (list) => {
    const out = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }

  const hull = [...half(sorted), ...half([...sorted].reverse())]
  return hull.length >= 3 ? hull : [...points]
}

/** Shoelace area, always positive. */
export function area(ring) {
  let sum = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % n]
    sum += x0 * y1 - x1 * y0
  }
  return Math.abs(sum) / 2
}

const distanceToSegment = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  if (len === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / len
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Douglas-Peucker on an open polyline. */
function simplifyLine(points, epsilon) {
  if (points.length < 3) return points
  let worst = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], points[0], points[points.length - 1])
    if (d > worst) {
      worst = d
      index = i
    }
  }
  if (worst <= epsilon) return [points[0], points[points.length - 1]]
  const left = simplifyLine(points.slice(0, index + 1), epsilon)
  const right = simplifyLine(points.slice(index), epsilon)
  return [...left.slice(0, -1), ...right]
}

/**
 * Douglas-Peucker on a closed ring. The ring is cut at its two most distant
 * points so the simplification cannot collapse the whole loop.
 */
export function simplifyRing(ring, epsilon) {
  if (ring.length < 4 || epsilon <= 0) return ring
  let a = 0
  let b = 0
  let best = -1
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1])
    if (d > best) {
      best = d
      b = i
    }
  }
  const first = simplifyLine(ring.slice(a, b + 1), epsilon)
  const second = simplifyLine([...ring.slice(b), ring[0]], epsilon)
  const out = [...first.slice(0, -1), ...second.slice(0, -1)]
  return out.length >= 3 ? out : ring
}

/** Ray casting; points exactly on an edge may go either way. */
export function pointInRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A point inside a polygon-clipping MultiPolygon (outer rings minus holes). */
export function pointInMultiPolygon(point, multi) {
  for (const polygon of multi) {
    if (!pointInRing(point, polygon[0])) continue
    const inHole = polygon.slice(1).some((hole) => pointInRing(point, hole))
    if (!inHole) return true
  }
  return false
}

/** Total area of a MultiPolygon, holes subtracted. */
export function multiArea(multi) {
  let total = 0
  for (const polygon of multi) {
    total += area(polygon[0])
    for (const hole of polygon.slice(1)) total -= area(hole)
  }
  return total
}

/** Evenly spread sample points inside a ring, for checking against an image. */
export function samplesInRing(ring, count, random = Math.random) {
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const out = []
  for (let tries = 0; out.length < count && tries < count * 60; tries++) {
    const p = [minX + random() * (maxX - minX), minY + random() * (maxY - minY)]
    if (pointInRing(p, ring)) out.push(p)
  }
  return out
}
