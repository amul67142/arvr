/**
 * Working out the lens a studio actually rendered with.
 *
 * Renderers disagree about focal length: a V-Ray physical camera and a plain
 * 3ds Max camera compute a different field of view from the same millimetres,
 * FBX and glTF each re-derive it on export, and a glTF's yfov may already have
 * lost the original. So the number in a delivery is a starting guess, never a
 * fact.
 *
 * Rather than trust it, this solves for it: rasterise the proxy's silhouette,
 * compare it with the silhouette the renderer actually produced, and search
 * for the lens that makes them coincide. The same search also catches the two
 * other classic export faults — a proxy exported Z-up when the camera is Y-up,
 * and a proxy in centimetres when the camera is in metres.
 *
 * What it needs to compare against is one mask: an Object-ID frame, which
 * costs a studio minutes even when they cannot export a camera path.
 *
 * See docs/HOTSPOT-PIPELINE-PLAN.md §4.2.
 */
import { Matrix4, Vector3 } from 'three'

/** Candidate fixes for how the proxy was exported. */
const UP_AXES = {
  y: new Matrix4(),
  z: new Matrix4().makeRotationX(-Math.PI / 2), // Z-up scene into a Y-up camera
}
const SCALES = [1, 0.01, 0.001, 0.0254, 100]

/** Apply an export fix to a set of world-space points. */
export function applyFix(points, { upAxis, scale }) {
  const matrix = UP_AXES[upAxis] ?? UP_AXES.y
  const v = new Vector3()
  return points.map((point) => {
    v.set(point[0], point[1], point[2]).applyMatrix4(matrix).multiplyScalar(scale)
    return [v.x, v.y, v.z]
  })
}

/** Fill the proxy's triangles into a coverage bitmap, ignoring depth. */
function silhouette(triangles, view, focal, aspect, w, h, centre) {
  const bitmap = new Uint8Array(w * h)
  const p = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]
  const scratch = new Vector3()

  for (const tri of triangles) {
    let visible = true
    for (let i = 0; i < 3; i++) {
      const point = tri[i]
      scratch.set(point[0], point[1], point[2]).applyMatrix4(view)
      const depth = -scratch.z
      if (depth <= 1e-3) {
        visible = false
        break
      }
      p[i].x = (((focal / aspect) * scratch.x) / depth / 2 + 0.5 + centre[0]) * w
      p[i].y = (0.5 - (focal * scratch.y) / depth / 2 + centre[1]) * h
    }
    if (!visible) continue

    const minX = Math.max(0, Math.floor(Math.min(p[0].x, p[1].x, p[2].x)))
    const maxX = Math.min(w - 1, Math.ceil(Math.max(p[0].x, p[1].x, p[2].x)))
    const minY = Math.max(0, Math.floor(Math.min(p[0].y, p[1].y, p[2].y)))
    const maxY = Math.min(h - 1, Math.ceil(Math.max(p[0].y, p[1].y, p[2].y)))
    if (minX > maxX || minY > maxY) continue

    const den = (p[1].y - p[2].y) * (p[0].x - p[2].x) + (p[2].x - p[1].x) * (p[0].y - p[2].y)
    if (Math.abs(den) < 1e-9) continue

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5
        const l0 = ((p[1].y - p[2].y) * (px - p[2].x) + (p[2].x - p[1].x) * (py - p[2].y)) / den
        if (l0 < 0) continue
        const l1 = ((p[2].y - p[0].y) * (px - p[2].x) + (p[0].x - p[2].x) * (py - p[2].y)) / den
        if (l1 < 0) continue
        if (1 - l0 - l1 < 0) continue
        bitmap[y * w + x] = 1
      }
    }
  }
  return bitmap
}

const iouOf = (a, b) => {
  let both = 0
  let either = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) {
      either += 1
      if (a[i] && b[i]) both += 1
    }
  }
  return either ? both / either : 0
}

/** The camera's view matrix for a frame. */
export function viewMatrix(frame, fallback = {}) {
  const eye = new Vector3(...frame.eye)
  const world = new Matrix4().lookAt(
    eye,
    new Vector3(...(frame.target ?? fallback.target ?? [0, 0, 0])),
    new Vector3(...(frame.up ?? fallback.up ?? [0, 1, 0])),
  )
  world.setPosition(eye)
  return world.invert()
}

const focalOf = (fovY) => 1 / Math.tan(((fovY * Math.PI) / 180) / 2)

/**
 * Solve the lens (and any export fix) against one or more masked frames.
 *
 *   samples  [{ frame, mask, w, h }]  mask is 1 where the building is
 *   objects  [{ points, tris }]       the proxy, in world space as delivered
 */
export function solveCamera({ objects, frames, samples, aspect, initialFov, cameraDefaults = {} }) {
  if (!samples.length) throw new Error('nothing to solve against: no masked frames')

  const trianglesFor = (fix) => {
    if (fix.upAxis === 'y' && fix.scale === 1) return objects.flatMap((object) => object.tris)
    const matrix = UP_AXES[fix.upAxis]
    const v = new Vector3()
    const move = (point) => {
      v.set(point[0], point[1], point[2]).applyMatrix4(matrix).multiplyScalar(fix.scale)
      return [v.x, v.y, v.z]
    }
    return objects.flatMap((object) => object.tris.map((tri) => tri.map(move)))
  }

  const scoreFor = (triangles, fovY, centre) => {
    let total = 0
    for (const sample of samples) {
      const frame = frames.find((candidate) => candidate.frame === sample.frame) ?? frames[sample.frame]
      if (!frame) continue
      const view = viewMatrix(frame, cameraDefaults)
      const drawn = silhouette(triangles, view, focalOf(fovY), aspect, sample.w, sample.h, centre)
      total += iouOf(drawn, sample.mask)
    }
    return total / samples.length
  }

  // 1. Which export fix, and roughly which lens. A coarse sweep is enough to
  //    tell a wrong up-axis or a centimetre proxy from a wrong focal length.
  let best = { fix: { upAxis: 'y', scale: 1 }, fovY: initialFov, score: -1 }
  for (const upAxis of Object.keys(UP_AXES)) {
    for (const scale of SCALES) {
      const triangles = trianglesFor({ upAxis, scale })
      for (let fovY = 12; fovY <= 80; fovY += 4) {
        const score = scoreFor(triangles, fovY, [0, 0])
        if (score > best.score) best = { fix: { upAxis, scale }, fovY, score }
      }
    }
  }

  // 2. Refine the lens by golden-section search around the best coarse value.
  const triangles = trianglesFor(best.fix)
  const phi = (Math.sqrt(5) - 1) / 2
  let lo = Math.max(5, best.fovY - 5)
  let hi = Math.min(100, best.fovY + 5)
  let c = hi - phi * (hi - lo)
  let d = lo + phi * (hi - lo)
  let fc = scoreFor(triangles, c, [0, 0])
  let fd = scoreFor(triangles, d, [0, 0])
  for (let i = 0; i < 18 && hi - lo > 0.01; i++) {
    if (fc > fd) {
      hi = d
      d = c
      fd = fc
      c = hi - phi * (hi - lo)
      fc = scoreFor(triangles, c, [0, 0])
    } else {
      lo = c
      c = d
      fc = fd
      d = lo + phi * (hi - lo)
      fd = scoreFor(triangles, d, [0, 0])
    }
  }
  const fovY = Math.round(((fc > fd ? c : d) + Number.EPSILON) * 1000) / 1000

  // 3. A lens shift shows up as the whole silhouette sitting off-centre.
  let centre = [0, 0]
  let score = scoreFor(triangles, fovY, centre)
  for (let step = 0.02; step >= 0.0025; step /= 2) {
    for (const axis of [0, 1]) {
      for (const direction of [1, -1]) {
        const trial = [...centre]
        trial[axis] += direction * step
        const trialScore = scoreFor(triangles, fovY, trial)
        if (trialScore > score + 1e-4) {
          centre = trial
          score = trialScore
        }
      }
    }
  }

  // 4. How well it holds across every masked frame — drift means the studio
  //    animated the lens, and no single value will fit.
  const perFrame = samples.map((sample) => {
    const frame = frames.find((candidate) => candidate.frame === sample.frame) ?? frames[sample.frame]
    const view = viewMatrix(frame, cameraDefaults)
    const drawn = silhouette(triangles, view, focalOf(fovY), aspect, sample.w, sample.h, centre)
    return { frame: sample.frame, iou: iouOf(drawn, sample.mask) }
  })

  return {
    fovY,
    fix: best.fix,
    centre,
    score,
    startedFrom: initialFov,
    scoreAtStated: scoreFor(triangles, initialFov, [0, 0]),
    perFrame,
  }
}
