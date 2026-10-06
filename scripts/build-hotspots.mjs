/**
 * The projector: turns a studio delivery into clickable polygons.
 *
 *   node scripts/build-hotspots.mjs public/demo/mock --verify
 *
 * Reads the camera path and the proxy geometry, and for every frame works out
 * where each named object lands on screen:
 *
 *   1. project every vertex of the object through that frame's camera
 *   2. take the convex hull of the projected points
 *   3. subtract whatever is nearer to the camera and overlaps it
 *   4. simplify, drop slivers, and write the result as hotspots.json
 *
 * No masks, no computer vision, no GPU. Because it is geometry rather than
 * image processing, it works on *every* frame rather than only the stop
 * frames a studio was willing to render mattes for.
 *
 * With --verify and an Object-ID pass present, every polygon is checked
 * against the render itself: sample points inside the polygon, read the ID
 * pixel underneath, and see whether it names the object the polygon claims.
 * That is the number to trust — the projector and the renderer are separate
 * implementations, so agreement means something.
 *
 * See docs/HOTSPOT-PIPELINE-PLAN.md §4.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { NodeIO } from '@gltf-transform/core'
import polygonClipping from 'polygon-clipping'

import {
  convexHull,
  area,
  multiArea,
  pointInMultiPolygon,
  pointInRing,
  simplifyRing,
  samplesInRing,
} from './lib/geom2d.mjs'
import { applyFix, solveCamera } from './lib/camera-match.mjs'
import { targetFor } from './lib/naming.mjs'
import {
  addShape,
  createHotspotFile,
  defineTarget,
  describeHotspots,
  validateHotspots,
} from './lib/hotspots.mjs'

// -- options --------------------------------------------------------------- --

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('-')) ?? 'public/demo/mock'
const flag = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : Number(args[at + 1])
}
const options = {
  verify: args.includes('--verify'),
  fovY: flag('--fov', null), // override the delivery's lens
  minAreaPx: flag('--min-area', 300), // drop shapes smaller than this, in pixels
  epsilonPx: flag('--epsilon', 0.4), // Douglas-Peucker tolerance, in pixels
  maxOccluded: flag('--max-occluded', 0.985), // drop a shape hidden this much
  maxPieces: flag('--max-pieces', 3), // fragments kept per object per frame
  // An object's outline is the union of its projected triangles — exact for an
  // L-shaped flat or a curved facade. --hull falls back to wrapping it in a
  // convex hull, which is faster and right only for convex shapes.
  hull: args.includes('--hull'),
  maxTris: flag('--max-tris', 400), // above this, hull anyway: a proxy should be simple
  solve: args.includes('--solve'), // work the lens out from the render itself
  solveFrames: flag('--solve-frames', 3),
  // Where a floor's clickable band comes from: the union of the homes on it
  // (reliable, and what a buyer actually points at), or the studio's own slab
  // geometry, which at distance can be a pixel tall.
  floors: args.includes('--floors-from-proxy') ? 'proxy' : 'union',
}

// -- the delivery ---------------------------------------------------------- --

const camera = JSON.parse(readFileSync(join(dir, 'camera.json'), 'utf8'))
const W = camera.width
const H = camera.height
// The lens can be replaced by --solve, so these are not constants.
let fovY = options.fovY ?? camera.fovY
if (!fovY) throw new Error('camera.json has no fovY; pass --fov <degrees> or --solve')
const aspect = camera.aspect ?? W / H
let FOCAL = 1 / Math.tan(((fovY * Math.PI) / 180) / 2)
let centre = [0, 0] // lens shift, as a fraction of the frame

/**
 * Triangles that touch each other, grouped.
 *
 * A home is often two piers either side of a recessed balcony, or a wing and a
 * core. Occlusion has to be decided per solid piece: asking "is the flat in
 * front of the balcony" has no single answer, while "is this pier in front of
 * the balcony" does.
 */
function partsOf(tris) {
  const key = ([x, y, z]) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
  const parent = tris.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const join = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  const seen = new Map()
  tris.forEach((tri, index) => {
    for (const vertex of tri) {
      const at = key(vertex)
      if (seen.has(at)) join(index, seen.get(at))
      else seen.set(at, index)
    }
  })

  const groups = new Map()
  tris.forEach((tri, index) => {
    const root = find(index)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(tri)
  })
  return [...groups.values()]
}

/**
 * Every named object in the proxy, with its vertices in world space.
 * The scene graph is walked rather than read flat, so a nested export works.
 */
async function loadProxy(path) {
  const doc = await new NodeIO().read(path)
  const objects = []

  const walk = (node, parent) => {
    const local = new Matrix4().compose(
      new Vector3(...node.getTranslation()),
      new Quaternion(...node.getRotation()),
      new Vector3(...node.getScale()),
    )
    const world = new Matrix4().multiplyMatrices(parent, local)

    const mesh = node.getMesh()
    if (mesh) {
      const points = []
      const tris = []
      const scratch = new Vector3()
      for (const prim of mesh.listPrimitives()) {
        const position = prim.getAttribute('POSITION')
        if (!position) continue
        const start = points.length
        for (let i = 0; i < position.getCount(); i++) {
          const [x, y, z] = position.getElement(i, [0, 0, 0])
          scratch.set(x, y, z).applyMatrix4(world)
          points.push([scratch.x, scratch.y, scratch.z])
        }
        // Triangles are kept so occlusion can be resolved by asking the
        // geometry which surface is actually in front at a given pixel.
        const indices = prim.getIndices()
        if (indices) {
          for (let i = 0; i + 2 < indices.getCount(); i += 3) {
            tris.push([
              points[start + indices.getScalar(i)],
              points[start + indices.getScalar(i + 1)],
              points[start + indices.getScalar(i + 2)],
            ])
          }
        } else {
          for (let i = start; i + 2 < points.length; i += 3) {
            tris.push([points[i], points[i + 1], points[i + 2]])
          }
        }
      }
      if (points.length) objects.push({ name: node.getName(), points, tris, parts: partsOf(tris) })
    }

    for (const child of node.listChildren()) walk(child, world)
  }

  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) walk(node, new Matrix4())
  }
  return objects
}

// -- projection ------------------------------------------------------------ --

/** The camera's view matrix for one frame. */
function viewFor(frame) {
  const eye = new Vector3(...frame.eye)
  const world = new Matrix4().lookAt(
    eye,
    new Vector3(...(frame.target ?? camera.target ?? [0, 0, 0])),
    new Vector3(...(frame.up ?? camera.up ?? [0, 1, 0])),
  )
  world.setPosition(eye)
  return world.invert()
}

/**
 * World point -> frame fractions plus the distance in front of the camera.
 * Returns null for anything behind the lens.
 */
function project(point, view, scratch) {
  scratch.set(point[0], point[1], point[2]).applyMatrix4(view)
  const depth = -scratch.z
  if (depth <= 1e-3) return null
  return {
    x: ((FOCAL / aspect) * scratch.x) / depth / 2 + 0.5 + centre[0],
    y: 0.5 - (FOCAL * scratch.y) / depth / 2 + centre[1],
    depth,
  }
}

/**
 * Which of two objects is in front, at a point where they overlap on screen.
 *
 * Ordering by distance alone gets this wrong wherever geometry interlocks —
 * a floor slab's front edge is nearer than the flats standing on it, yet the
 * flats are what you see. So a ray is cast through the overlap and the two
 * objects are asked directly.
 */
function rayTriangle(origin, dir, [a, b, c]) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2]
  const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2]
  const px = dir.y * e2z - dir.z * e2y
  const py = dir.z * e2x - dir.x * e2z
  const pz = dir.x * e2y - dir.y * e2x
  const det = e1x * px + e1y * py + e1z * pz
  if (Math.abs(det) < 1e-12) return Infinity
  const inv = 1 / det
  const tx = origin.x - a[0], ty = origin.y - a[1], tz = origin.z - a[2]
  const u = (tx * px + ty * py + tz * pz) * inv
  if (u < -1e-6 || u > 1 + 1e-6) return Infinity
  const qx = ty * e1z - tz * e1y
  const qy = tz * e1x - tx * e1z
  const qz = tx * e1y - ty * e1x
  const v = (dir.x * qx + dir.y * qy + dir.z * qz) * inv
  if (v < -1e-6 || u + v > 1 + 1e-6) return Infinity
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv
  return t > 1e-6 ? t : Infinity
}

const hitDistance = (tris, origin, dir) => {
  let best = Infinity
  for (const tri of tris) {
    const t = rayTriangle(origin, dir, tri)
    if (t < best) best = t
  }
  return best
}

const overlaps = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1])

/**
 * What an object covers on screen: the union of its projected triangles.
 *
 * A convex hull is right for a box and wrong for everything else — an L-shaped
 * flat's hull swallows the notch, and with it the neighbour's facade. Unioning
 * the triangles costs more but follows the real outline, holes and all.
 */
function outlineOf(points, triangles, limits) {
  if (limits.hull || !triangles.length || triangles.length > limits.maxTris) {
    const hull = convexHull(points)
    return hull.length >= 3 ? [[hull]] : null
  }
  const parts = triangles.filter((tri) => area(tri) > 1e-9).map((tri) => [tri])
  if (!parts.length) return null
  try {
    const union = polygonClipping.union(...parts)
    return union.length ? union : null
  } catch {
    const hull = convexHull(points)
    return hull.length >= 3 ? [[hull]] : null
  }
}

const boundsOf = (multi) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const polygon of multi) {
    for (const [x, y] of polygon[0]) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return [minX, minY, maxX, maxY]
}

/** One frame: outlines, ray-resolved occlusion, simplification. */
function shapesForFrame(objects, frame, limits) {
  const view = viewFor(frame)
  const camToWorld = view.clone().invert()
  const eye = new Vector3(...frame.eye)
  const scratch = new Vector3()

  // Every solid piece of every object, projected on its own.
  const pieces = []
  for (const object of objects) {
    for (const tris of object.parts) {
      const points = []
      const triangles = []
      let near = Infinity
      let behind = false
      for (const tri of tris) {
        const flat = []
        for (const point of tri) {
          const p = project(point, view, scratch)
          if (!p) {
            behind = true
            break
          }
          flat.push([p.x, p.y])
          points.push([p.x, p.y])
          if (p.depth < near) near = p.depth
        }
        if (flat.length === 3) triangles.push(flat)
        if (behind) break
      }
      if (behind || points.length < 3) continue

      const shape = outlineOf(points, triangles, limits)
      if (!shape) continue
      const box = boundsOf(shape)
      if (box[2] < -0.05 || box[0] > 1.05 || box[3] < -0.05 || box[1] > 1.05) continue
      pieces.push({ object, tris, shape, box, near })
    }
  }

  /** The world ray through a point on the frame. */
  const rayThrough = (x, y) => {
    const dir = new Vector3(((x - 0.5) * 2 * aspect) / FOCAL, -((y - 0.5) * 2) / FOCAL, -1)
    return dir.normalize().transformDirection(camToWorld)
  }

  /** Does `other` cover `piece` where the two overlap on screen? */
  const covers = (other, piece) => {
    const x0 = Math.max(other.box[0], piece.box[0])
    const y0 = Math.max(other.box[1], piece.box[1])
    const x1 = Math.min(other.box[2], piece.box[2])
    const y1 = Math.min(other.box[3], piece.box[3])
    if (x1 <= x0 || y1 <= y0) return false

    let inFront = 0
    let tested = 0
    for (let i = 1; i <= 3 && tested < 3; i++) {
      for (let j = 1; j <= 3 && tested < 3; j++) {
        const x = x0 + ((x1 - x0) * i) / 4
        const y = y0 + ((y1 - y0) * j) / 4
        if (!pointInMultiPolygon([x, y], piece.shape) || !pointInMultiPolygon([x, y], other.shape)) continue
        const dir = rayThrough(x, y)
        const tOther = hitDistance(other.tris, eye, dir)
        const tPiece = hitDistance(piece.tris, eye, dir)
        if (!Number.isFinite(tOther) && !Number.isFinite(tPiece)) continue
        tested += 1
        if (tOther < tPiece - 1e-4) inFront += 1
      }
    }
    return tested > 0 && inFront * 2 >= tested
  }

  // What each piece still shows, once nearer pieces are taken out of it.
  const visibleByObject = new Map()
  const nearestByObject = new Map()
  for (const piece of pieces) {
    const occluders = pieces.filter(
      (other) => other !== piece && overlaps(other.box, piece.box) && covers(other, piece),
    )

    let visible = piece.shape
    if (occluders.length) {
      try {
        visible = polygonClipping.difference(piece.shape, ...occluders.map((o) => o.shape))
      } catch {
        visible = piece.shape // a degenerate clip should not lose the piece
      }
    }
    if (!visible.length) continue

    if (!visibleByObject.has(piece.object)) visibleByObject.set(piece.object, [])
    visibleByObject.get(piece.object).push({ visible, whole: piece.shape })
    nearestByObject.set(piece.object, Math.min(nearestByObject.get(piece.object) ?? Infinity, piece.near))
  }

  const results = []
  for (const [object, parts] of visibleByObject) {
    // The object is its pieces put back together.
    let visible = []
    let whole = []
    try {
      visible = parts.length === 1 ? parts[0].visible : polygonClipping.union(...parts.map((p) => p.visible))
      whole = parts.length === 1 ? parts[0].whole : polygonClipping.union(...parts.map((p) => p.whole))
    } catch {
      visible = parts[0].visible
      whole = parts[0].whole
    }

    const visibleArea = multiArea(visible)
    if (visibleArea < limits.minArea) continue
    const wholeArea = multiArea(whole)
    const occluded = wholeArea > 0 ? Math.max(0, 1 - visibleArea / wholeArea) : 1
    if (occluded > limits.maxOccluded) continue

    const shapes = visible
      .filter((polygon) => area(polygon[0]) >= limits.minArea)
      .sort((a, b) => area(b[0]) - area(a[0]))
      .slice(0, limits.maxPieces)
      .map((polygon) => ({
        outer: simplifyRing(polygon[0], limits.epsilon),
        holes: polygon
          .slice(1)
          .filter((hole) => area(hole) >= limits.minArea)
          .map((hole) => simplifyRing(hole, limits.epsilon))
          .filter((hole) => hole.length >= 3),
      }))
      .filter((piece) => piece.outer.length >= 3)

    if (shapes.length) {
      results.push({ item: { object, near: nearestByObject.get(object) }, pieces: shapes, occluded })
    }
  }

  // File order is back-to-front; the viewer hit-tests the other way.
  results.sort((a, b) => b.item.near - a.item.near)
  return results
}

// -- verification against the render --------------------------------------- --

async function verify(file, objects) {
  const idDir = join(dir, 'id')
  if (!existsSync(idDir) || !existsSync(join(dir, 'colors.csv'))) {
    console.log('  (no id pass — skipping verification)')
    return
  }

  const byColour = new Map()
  for (const row of readFileSync(join(dir, 'colors.csv'), 'utf8').trim().split('\n').slice(1)) {
    const [r, g, b, ...rest] = row.split(',')
    byColour.set(`${Number(r)},${Number(g)},${Number(b)}`, rest.join(',').trim())
  }

  const idFrames = readdirSync(idDir).filter((n) => /\.png$/i.test(n)).sort()
  let hits = 0
  let samples = 0
  const misses = new Map()
  let recallWanted = 0
  let recallGot = 0
  const missingShapes = new Map()

  // A deterministic sampler, so the number does not wobble between runs.
  let seed = 12345
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  const targetOf = new Map(objects.map((object) => [object.name, object.target]))
  /** Does the object under this pixel satisfy what the shape claims? */
  const matches = (shapeId, foundName) => {
    if (!foundName) return false
    if (shapeId === foundName) return true
    const claim = file.targets[shapeId]
    const found = targetOf.get(foundName)
    if (!claim || !found) return false
    if (claim.kind === 'floor') return found.tower === claim.tower && found.floor === claim.floor
    return false
  }

  const byKind = new Map()
  const track = (id) => {
    const kind = file.targets[id]?.kind ?? 'unknown'
    if (!byKind.has(kind)) byKind.set(kind, { hits: 0, samples: 0, recallWanted: 0, recallGot: 0 })
    return byKind.get(kind)
  }

  for (const entry of file.frames) {
    const name = idFrames[entry.frame]
    if (!name) continue
    const { data, info } = await sharp(join(idDir, name)).raw().toBuffer({ resolveWithObject: true })
    const nameAt = (x, y) => {
      const px = Math.min(info.width - 1, Math.max(0, Math.round(x * info.width - 0.5)))
      const py = Math.min(info.height - 1, Math.max(0, Math.round(y * info.height - 0.5)))
      const i = (py * info.width + px) * info.channels
      return byColour.get(`${data[i]},${data[i + 1]},${data[i + 2]}`) ?? null
    }

    // Precision: does the pixel under the polygon belong to the same object?
    for (const shape of entry.shapes) {
      const inHole = (p) => (shape.holes ?? []).some((hole) => pointInRing(p, hole))
      for (const point of samplesInRing(shape.d, 12, random)) {
        if (inHole(point)) continue
        const found = nameAt(point[0], point[1])
        const kind = track(shape.id)
        samples += 1
        kind.samples += 1
        if (matches(shape.id, found)) {
          hits += 1
          kind.hits += 1
        } else {
          const key = `${shape.id} -> ${found ?? 'background'}`
          misses.set(key, (misses.get(key) ?? 0) + 1)
        }
      }
    }

    // Recall: every object the render shows clearly should have a polygon.
    const seen = new Map()
    for (let i = 0; i < data.length; i += info.channels) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
      if (key === '0,0,0') continue
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const withShape = new Set(entry.shapes.map((s) => s.id))
    for (const [key, count] of seen) {
      if (count < 400) continue // slivers are allowed to be missing
      const objectName = byColour.get(key)
      const objectTarget = targetOf.get(objectName)
      if (!objectName || !objectTarget) continue
      if (objectTarget.kind === 'floor' && !objects.find((o) => o.name === objectName)?.emit) continue
      const kind = track(objectName)
      recallWanted += 1
      kind.recallWanted += 1
      if (withShape.has(objectName)) {
        recallGot += 1
        kind.recallGot += 1
      } else {
        missingShapes.set(objectName, (missingShapes.get(objectName) ?? 0) + 1)
      }
    }
  }

  const precision = samples ? (hits / samples) * 100 : 0
  const recall = recallWanted ? (recallGot / recallWanted) * 100 : 0
  console.log(`  precision ${precision.toFixed(1)}% (${hits}/${samples} sampled points land on the right object)`)
  console.log(`  recall    ${recall.toFixed(1)}% (${recallGot}/${recallWanted} clearly visible objects got a polygon)`)

  // Broken down by what the polygon points at: a 0.25 m floor band seen from
  // 150 m is a couple of pixels tall, and drags the average down with it.
  for (const kind of ['unit', 'room', 'floor', 'amenity', 'tower']) {
    const p = byKind.get(kind)
    if (!p || !p.samples) continue
    console.log(
      `    ${kind.padEnd(8)} precision ${((p.hits / p.samples) * 100).toFixed(1)}%` +
        (p.recallWanted ? `  recall ${((p.recallGot / p.recallWanted) * 100).toFixed(1)}%` : ''),
    )
  }

  const worst = [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (worst.length) console.log(`  top mismatches: ${worst.map(([k, n]) => `${k} ×${n}`).join(' · ')}`)
  const missed = [...missingShapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  if (missed.length) console.log(`  missing shapes: ${missed.map(([k, n]) => `${k} ×${n}`).join(' · ')}`)
}

/**
 * Silhouettes to solve the lens against: a few Object-ID frames spread round
 * the orbit, shrunk with nearest-neighbour so the colours stay flat. Only
 * "is this the building" matters here, so colors.csv is not needed.
 */
async function maskSamples(count) {
  const idDir = join(dir, 'id')
  if (!existsSync(idDir)) return []
  const files = readdirSync(idDir)
    .filter((name) => /\.png$/i.test(name))
    .sort()
  if (!files.length) return []

  const indices = []
  for (let i = 0; i < Math.min(count, files.length); i++) {
    indices.push(Math.floor((i * files.length) / Math.min(count, files.length)))
  }

  const samples = []
  for (const index of indices) {
    const { data, info } = await sharp(join(idDir, files[index]))
      .resize({ width: 240, kernel: 'nearest' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const mask = new Uint8Array(info.width * info.height)
    for (let i = 0, at = 0; i < data.length; i += info.channels, at += 1) {
      mask[at] = data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8 ? 1 : 0
    }
    samples.push({ frame: index, mask, w: info.width, h: info.height })
  }
  return samples
}

// -- main ------------------------------------------------------------------ --

async function main() {
  const started = Date.now()
  let objects = (await loadProxy(join(dir, 'proxy.glb')))
    .map((object) => ({ ...object, target: targetFor(object.name) }))
    .filter((object) => object.target)
  // With union floors the studio's slabs still block what is behind them —
  // they just stop producing hotspots of their own.
  objects = objects.map((object) => ({
    ...object,
    emit: !(options.floors === 'union' && object.target.kind === 'floor'),
  }))

  if (options.solve) {
    const samples = await maskSamples(options.solveFrames)
    if (!samples.length) {
      console.log('  --solve needs at least one Object-ID frame to compare against; skipping')
    } else {
      const solved = solveCamera({
        objects,
        frames: camera.frames,
        samples,
        aspect,
        initialFov: fovY,
        cameraDefaults: camera,
      })
      const drift = Math.max(...solved.perFrame.map((f) => f.iou)) - Math.min(...solved.perFrame.map((f) => f.iou))
      console.log(
        `
solved lens: ${solved.fovY.toFixed(2)}° (delivery said ${Number(fovY).toFixed(2)}°) · ` +
          `silhouette overlap ${(solved.score * 100).toFixed(1)}% (was ${(solved.scoreAtStated * 100).toFixed(1)}%)`,
      )
      if (solved.fix.upAxis !== 'y' || solved.fix.scale !== 1) {
        console.log(`  export fix applied: ${solved.fix.upAxis}-up proxy, scale ×${solved.fix.scale}`)
      }
      if (Math.abs(solved.centre[0]) > 0.002 || Math.abs(solved.centre[1]) > 0.002) {
        console.log(`  lens shift: ${(solved.centre[0] * 100).toFixed(1)}%, ${(solved.centre[1] * 100).toFixed(1)}% of the frame`)
      }
      if (Math.abs(solved.fovY - fovY) > 0.3) {
        console.log('  ⚠ the stated lens is wrong; the solved one is being used')
      }
      if (drift > 0.04) {
        console.log(`  ⚠ overlap varies by ${(drift * 100).toFixed(1)}% across the orbit — the lens is probably animated`)
      }
      for (const frame of solved.perFrame) {
        if (frame.iou < 0.8) console.log(`  ⚠ frame ${frame.frame} only matches ${(frame.iou * 100).toFixed(0)}%`)
      }

      fovY = solved.fovY
      FOCAL = 1 / Math.tan(((fovY * Math.PI) / 180) / 2)
      centre = solved.centre
      if (solved.fix.upAxis !== 'y' || solved.fix.scale !== 1) {
        objects = objects.map((object) => ({
          ...object,
          points: applyFix(object.points, solved.fix),
          tris: object.tris.map((tri) => applyFix(tri, solved.fix)),
          parts: object.parts.map((part) => part.map((tri) => applyFix(tri, solved.fix))),
        }))
      }
    }
  }

  const file = createHotspotFile({
    source: 'proxy',
    project: camera.project ?? dir.split(/[\\/]/).pop(),
    frameCount: camera.frameCount ?? camera.frames.length,
    camera: { fovY, aspect, width: W, height: H, ...(centre[0] || centre[1] ? { centre } : {}) },
  })
  for (const object of objects) if (object.emit) defineTarget(file, object.name, object.target)

  // One target per floor, built from the homes on it.
  const floorIds = new Map()
  if (options.floors === 'union') {
    for (const object of objects) {
      const { tower, floor } = object.target
      if (!floor || !tower || !object.emit) continue
      const id = `${tower}_F${floor}`
      if (!floorIds.has(id)) {
        floorIds.set(id, [])
        defineTarget(file, id, { kind: 'floor', tower, floor })
      }
      floorIds.get(id).push(object.name)
    }
  }

  const limits = {
    hull: options.hull,
    maxTris: options.maxTris,
    minArea: options.minAreaPx / (W * H),
    epsilon: options.epsilonPx / W,
    maxOccluded: options.maxOccluded,
    maxPieces: options.maxPieces,
  }

  for (const frame of camera.frames) {
    const results = shapesForFrame(objects, frame, limits)
    for (const { item, pieces, occluded } of results) {
      if (!item.object.emit) continue
      for (const piece of pieces) {
        addShape(file, frame.frame, { id: item.object.name, points: piece.outer, holes: piece.holes, occluded })
      }
    }

    // A floor band is whatever its homes cover, merged. Slab geometry at
    // 150 m can be a pixel tall; the homes never are.
    if (options.floors === 'union') {
      const byFloor = new Map()
      for (const { item, pieces } of results) {
        const { tower, floor } = item.object.target
        if (!floor || !tower || !item.object.emit) continue
        const id = `${tower}_F${floor}`
        if (!byFloor.has(id)) byFloor.set(id, [])
        for (const piece of pieces) byFloor.get(id).push([piece.outer])
      }
      for (const [id, polygons] of byFloor) {
        if (!polygons.length) continue
        let merged
        try {
          merged = polygonClipping.union(...polygons)
        } catch {
          continue
        }
        const kept = merged
          .filter((polygon) => area(polygon[0]) >= limits.minArea)
          .sort((a, b) => area(b[0]) - area(a[0]))
          .slice(0, limits.maxPieces)
        for (const polygon of kept) {
          addShape(file, frame.frame, {
            id,
            points: simplifyRing(polygon[0], limits.epsilon),
            holes: polygon
              .slice(1)
              .filter((hole) => area(hole) >= limits.minArea)
              .map((hole) => simplifyRing(hole, limits.epsilon)),
          })
        }
      }
    }
  }

  const report = validateHotspots(file)
  const out = join(dir, 'hotspots.json')
  writeFileSync(out, JSON.stringify(file))
  const kb = Math.round(readFileSync(out).length / 1024)

  console.log(`\n${out} · ${describeHotspots(file)} · ${kb} kB · ${((Date.now() - started) / 1000).toFixed(1)}s`)
  console.log(`  ${report.stats.shapesPerFrame} shapes per frame, ${Math.round(report.stats.points / Math.max(1, report.stats.shapes))} points per shape`)
  for (const error of report.errors) console.log(`  ✗ ${error}`)
  for (const warning of report.warnings.slice(0, 3)) console.log(`  · ${warning}`)
  if (report.warnings.length > 3) console.log(`  · …and ${report.warnings.length - 3} more warnings`)

  if (options.verify) await verify(file, objects)
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
