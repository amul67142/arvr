/**
 * Tower shapes for a rotation frame, in the overlay's viewBox units.
 *
 * A tower is described per frame (see scripts/build-horizon.mjs) by its left
 * and right edge lines, from its roof line down to the bottom of the frame,
 * and by how deep its roof ellipse looks from the camera. Floors are bands a
 * fixed fraction of the tower's width tall, curving down at the front the same
 * way the roof does.
 */

export const VIEW_W = 1600
export const VIEW_H = 900

const ARC_STEPS = 24

function edges(frame) {
  const [lx1, ly1, lx2, ly2] = frame.left
  const [rx1, , rx2] = frame.right
  const y1 = ly1 * VIEW_H
  const y2 = ly2 * VIEW_H
  const at = (xa, xb) => (y) => (xa + (xb - xa) * ((y - y1) / (y2 - y1 || 1))) * VIEW_W
  return {
    roofY: y1,
    bottomY: y2,
    left: at(lx1, lx2),
    right: at(rx1, rx2),
    depth: frame.roofDepth * VIEW_H,
  }
}

/** The front half of an ellipse across the tower at height y (sags by depth). */
function frontArc(e, y, reverse = false) {
  const x0 = e.left(y)
  const x1 = e.right(y)
  const points = []
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS
    const u = t * 2 - 1
    points.push([x0 + (x1 - x0) * t, y + e.depth * Math.sqrt(Math.max(0, 1 - u * u))])
  }
  return reverse ? points.reverse() : points
}

const toPath = (points) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z'

/** Silhouette: both edges, the bottom of the frame, and the back of the roof. */
export function towerOutline(frame) {
  const e = edges(frame)
  const cx = (e.left(e.roofY) + e.right(e.roofY)) / 2
  const hw = (e.right(e.roofY) - e.left(e.roofY)) / 2
  const points = [
    [e.left(e.roofY), e.roofY],
    [e.left(e.bottomY), e.bottomY],
    [e.right(e.bottomY), e.bottomY],
    [e.right(e.roofY), e.roofY],
  ]
  for (let i = 0; i <= ARC_STEPS; i++) {
    const a = (i / ARC_STEPS) * Math.PI
    points.push([cx + hw * Math.cos(a), e.roofY - e.depth * Math.sin(a)])
  }
  return toPath(points)
}

/** Where a tower's label pin sits: just above the top of its roof. */
export function towerTop(frame) {
  const e = edges(frame)
  return { x: (e.left(e.roofY) + e.right(e.roofY)) / 2, y: e.roofY - e.depth }
}

/**
 * One floor as a band on the facade, or null when it falls outside the frame.
 * Floor `count` is the top floor, directly under the roof line.
 */
export function floorBand(frame, tower, floor) {
  const e = edges(frame)
  const pitch = tower.floorPitch * (e.right(e.roofY) - e.left(e.roofY))
  const top = e.roofY + (tower.floors - floor) * pitch
  const bottom = top + pitch
  if (top + e.depth >= e.bottomY) return null
  const clamp = ([x, y]) => [x, Math.min(y, e.bottomY)]
  return toPath([...frontArc(e, top).map(clamp), ...frontArc(e, bottom, true).map(clamp)])
}

// -- baked hotspots --------------------------------------------------------- --

/**
 * Shapes that came from a hotspots.json rather than from the tower's
 * silhouette: exact per-flat, per-balcony and per-floor polygons, projected
 * from the studio's camera and proxy (see scripts/build-hotspots.mjs).
 *
 * Coordinates arrive as fractions of the frame, which map straight onto this
 * overlay's viewBox because both cover the frame the same way.
 */
const ringPath = (ring) =>
  ring.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * VIEW_W).toFixed(1)} ${(y * VIEW_H).toFixed(1)}`).join('') + 'Z'

/** Outer ring plus any holes, as one path. Filled even-odd, so holes read. */
export function shapePath(shape) {
  return [shape.d, ...(shape.holes ?? [])].map(ringPath).join('')
}

/** Every shape on a frame, with its target resolved and its path built. */
export function shapesAt(file, frame) {
  const entry = file?.frames?.find((candidate) => candidate.frame === frame)
  if (!entry) return null
  return entry.shapes
    .map((shape, index) => ({
      key: `${shape.id}-${index}`,
      id: shape.id,
      target: file.targets?.[shape.id] ?? null,
      area: shape.area ?? 0,
      d: shapePath(shape),
    }))
    .filter((shape) => shape.target)
}

/** Where a label should sit: above the topmost shape, centred on them all. */
export function shapesTop(shapes) {
  if (!shapes?.length) return null
  let top = Infinity
  let left = Infinity
  let right = -Infinity
  for (const shape of shapes) {
    for (const match of shape.d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)) {
      const x = Number(match[1])
      const y = Number(match[2])
      if (y < top) top = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  return Number.isFinite(top) ? { x: (left + right) / 2, y: top } : null
}
