/**
 * The hotspot contract.
 *
 * One file describes every clickable region of a rotation, frame by frame:
 * a flat's facade, its balcony, a floor band, the whole tower. Three different
 * producers write this same file —
 *
 *   proxy   projected from the studio's camera + proxy geometry (the default)
 *   mask    traced from Object-ID / Cryptomatte render passes
 *   manual  drawn by hand over stop frames
 *
 * — so no render delivery can ever produce a dead end, and the viewer only
 * ever learns one format.
 *
 * Coordinates are fractions of the frame (0–1), like the orbit manifest, so
 * any resolution tier can use them. Shapes are stored back-to-front; the
 * viewer hit-tests front-to-back.
 *
 * See docs/HOTSPOT-PIPELINE-PLAN.md.
 */

export const HOTSPOT_VERSION = 1
export const SOURCES = ['proxy', 'mask', 'manual']
export const KINDS = ['tower', 'floor', 'unit', 'room', 'amenity']

const round = (value, places = 4) => Math.round(value * 10 ** places) / 10 ** places

/** Shoelace area of a ring, in frame fractions squared. Always positive. */
export function polygonArea(points) {
  let sum = 0
  for (let i = 0, n = points.length; i < n; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % n]
    sum += x0 * y1 - x1 * y0
  }
  return Math.abs(sum) / 2
}

/**
 * Start a file. `camera` is recorded for audit only — the viewer never reads
 * it — so that a delivery can be checked against the camera it was baked with.
 */
export function createHotspotFile({ source, project, frameCount, camera = null, notes = null }) {
  if (!SOURCES.includes(source)) throw new Error(`Unknown hotspot source "${source}"`)
  return {
    version: HOTSPOT_VERSION,
    source,
    project,
    frameCount,
    generatedAt: new Date().toISOString(),
    ...(camera ? { camera } : {}),
    ...(notes ? { notes } : {}),
    targets: {},
    frames: [],
  }
}

/**
 * Declare what a polygon id points at, once per file:
 *
 *   defineTarget(file, 'T1-F12-A', { kind: 'unit', tower: 'T1', floor: 12, unit: '12A' })
 *   defineTarget(file, 'T1-F12-A-BAL', { kind: 'room', unit: '12A', room: 'balcony' })
 */
export function defineTarget(file, id, target) {
  if (!KINDS.includes(target.kind)) throw new Error(`Unknown target kind "${target.kind}" for ${id}`)
  file.targets[id] = target
  return file
}

/**
 * Add one polygon to one frame. `points` are [x, y] pairs in frame fractions,
 * in ring order. `occluded` is how much of the shape was hidden by nearer
 * geometry (0–1), so the viewer can ignore slivers.
 */
export function addShape(file, frameIndex, { id, points, holes = [], occluded = 0 }) {
  if (points.length < 3) return file
  let frame = file.frames.find((entry) => entry.frame === frameIndex)
  if (!frame) {
    frame = { frame: frameIndex, shapes: [] }
    file.frames.push(frame)
  }
  const ring = (points) => points.map(([x, y]) => [round(x), round(y)])
  const kept = holes.filter((hole) => hole.length >= 3)
  frame.shapes.push({
    id,
    d: ring(points),
    // A flat standing on a floor slab punches a hole in the slab's polygon.
    // The viewer fills with even-odd, so a hole is just another subpath.
    ...(kept.length ? { holes: kept.map(ring) } : {}),
    area: round(kept.reduce((sum, hole) => sum - polygonArea(hole), polygonArea(points)), 6),
    ...(occluded > 0.001 ? { occluded: round(occluded, 3) } : {}),
  })
  return file
}

/** Frames ascending, and shapes back-to-front within a frame. */
export function sortHotspots(file, depthOf = null) {
  file.frames.sort((a, b) => a.frame - b.frame)
  if (depthOf) {
    for (const frame of file.frames) {
      frame.shapes.sort((a, b) => depthOf(b, frame.frame) - depthOf(a, frame.frame))
    }
  }
  return file
}

/**
 * Check a file before it is written or read. Returns errors rather than
 * throwing, so a build can report everything wrong at once.
 */
export function validateHotspots(file) {
  const errors = []
  const warnings = []

  if (file?.version !== HOTSPOT_VERSION) errors.push(`version must be ${HOTSPOT_VERSION}`)
  if (!SOURCES.includes(file?.source)) errors.push(`source must be one of ${SOURCES.join(', ')}`)
  if (!Number.isInteger(file?.frameCount) || file.frameCount < 1) errors.push('frameCount must be a positive integer')
  if (!file?.targets || Object.keys(file.targets).length === 0) errors.push('no targets declared')

  let shapes = 0
  let points = 0
  const seenFrames = new Set()
  const usedIds = new Set()

  for (const frame of file?.frames ?? []) {
    if (!Number.isInteger(frame.frame) || frame.frame < 0 || frame.frame >= file.frameCount) {
      errors.push(`frame ${frame.frame} is outside 0..${file.frameCount - 1}`)
    }
    if (seenFrames.has(frame.frame)) errors.push(`frame ${frame.frame} appears twice`)
    seenFrames.add(frame.frame)

    for (const shape of frame.shapes ?? []) {
      shapes += 1
      points += shape.d?.length ?? 0
      usedIds.add(shape.id)
      if (!file.targets?.[shape.id]) errors.push(`frame ${frame.frame}: shape "${shape.id}" has no target`)
      if (!Array.isArray(shape.d) || shape.d.length < 3) {
        errors.push(`frame ${frame.frame}: shape "${shape.id}" has fewer than 3 points`)
        continue
      }
      for (const hole of shape.holes ?? []) {
        if (!Array.isArray(hole) || hole.length < 3) {
          errors.push(`frame ${frame.frame}: shape "${shape.id}" has a degenerate hole`)
        } else {
          points += hole.length
        }
      }
      for (const [x, y] of shape.d) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          errors.push(`frame ${frame.frame}: shape "${shape.id}" has a non-finite point`)
          break
        }
        // Polygons may spill past the frame edge; far outside means a bad camera.
        if (x < -1 || x > 2 || y < -1 || y > 2) {
          warnings.push(`frame ${frame.frame}: shape "${shape.id}" lies far outside the frame`)
          break
        }
      }
    }
  }

  for (const id of Object.keys(file?.targets ?? {})) {
    if (!usedIds.has(id)) warnings.push(`target "${id}" is never used by a shape`)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      frames: seenFrames.size,
      shapes,
      points,
      targets: Object.keys(file?.targets ?? {}).length,
      shapesPerFrame: seenFrames.size ? Math.round((shapes / seenFrames.size) * 10) / 10 : 0,
    },
  }
}

/** Human summary for a build log. */
export function describeHotspots(file) {
  const { stats } = validateHotspots(file)
  return `${file.source} · ${stats.frames}/${file.frameCount} frames · ${stats.shapes} shapes · ${stats.targets} targets · ${stats.points} points`
}
