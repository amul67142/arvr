/**
 * The tracer: turns Object-ID render passes into the same clickable polygons
 * the projector produces, for studios that cannot export a camera.
 *
 *   node scripts/trace-masks.mjs public/demo/mock --compare
 *
 * Every pixel of the ID pass is one flat colour naming one object. So:
 *
 *   1. group pixels by colour, splitting each colour into connected regions
 *   2. walk the boundary between inside and outside pixels (crack following,
 *      which keeps the area honest where the projector's hull would not)
 *   3. keep the loops: positive ones are outlines, negative ones are holes
 *   4. simplify, drop slivers, and write the same hotspots.json
 *
 * With --compare the result is measured against the projector's file for the
 * same frames, as intersection-over-union per shape. Two independent methods
 * agreeing is the strongest check this pipeline has: the projector never looks
 * at an image, and the tracer never looks at the geometry.
 *
 * See docs/HOTSPOT-PIPELINE-PLAN.md §5.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import polygonClipping from 'polygon-clipping'

import { area, simplifyRing } from './lib/geom2d.mjs'
import { floorIdFor, targetFor } from './lib/naming.mjs'
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
  compare: args.includes('--compare'),
  out: args.includes('--out') ? args[args.indexOf('--out') + 1] : 'hotspots-traced.json',
  minAreaPx: flag('--min-area', 300),
  // Traced boundaries follow pixel stair-steps, so they need a looser
  // tolerance than projected ones: 1 px costs 0.2% of overlap and saves 75%
  // of the file.
  epsilonPx: flag('--epsilon', 1),
  maxPieces: flag('--max-pieces', 3),
  floors: args.includes('--floors-from-masks') ? 'masks' : 'union',
  frames: args.includes('--frames')
    ? args[args.indexOf('--frames') + 1].split(',').map((n) => Number(n.trim()))
    : null,
}

// -- the delivery ---------------------------------------------------------- --

const byColour = new Map()
for (const row of readFileSync(join(dir, 'colors.csv'), 'utf8').trim().split('\n').slice(1)) {
  const [r, g, b, ...rest] = row.split(',')
  byColour.set(((Number(r) << 16) | (Number(g) << 8) | Number(b)) >>> 0, rest.join(',').trim())
}

const idFrames = readdirSync(join(dir, 'id'))
  .filter((name) => /\.png$/i.test(name))
  .sort()

const camera = existsSync(join(dir, 'camera.json'))
  ? JSON.parse(readFileSync(join(dir, 'camera.json'), 'utf8'))
  : null

// -- tracing ---------------------------------------------------------------- --

/**
 * The boundary of a region, as closed loops of pixel-grid corners.
 *
 * Each inside pixel contributes the edges it does not share with another
 * inside pixel, wound consistently; chaining them gives outlines (positive
 * area) and holes (negative). Tracing pixel centres instead would lose half a
 * pixel all round and collapse anything one pixel wide.
 */
function loopsOf(inside, [x0, y0, x1, y1]) {
  const edges = new Map()
  const add = (ax, ay, bx, by) => {
    const key = ax * 100000 + ay
    const list = edges.get(key)
    if (list) list.push([bx, by])
    else edges.set(key, [[bx, by]])
  }

  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      if (!inside(i, j)) continue
      if (!inside(i, j - 1)) add(i, j, i + 1, j) // top, +x
      if (!inside(i + 1, j)) add(i + 1, j, i + 1, j + 1) // right, +y
      if (!inside(i, j + 1)) add(i + 1, j + 1, i, j + 1) // bottom, -x
      if (!inside(i - 1, j)) add(i, j + 1, i, j) // left, -y
    }
  }

  const loops = []
  while (edges.size) {
    const startKey = edges.keys().next().value
    const sx = Math.floor(startKey / 100000)
    const sy = startKey - sx * 100000
    let cx = sx
    let cy = sy
    const loop = []
    for (let guard = 0; guard < 1e6; guard++) {
      const key = cx * 100000 + cy
      const list = edges.get(key)
      if (!list?.length) break
      const [nx, ny] = list.pop()
      if (!list.length) edges.delete(key)
      loop.push([cx, cy])
      cx = nx
      cy = ny
      if (cx === sx && cy === sy) break
    }
    if (loop.length >= 4) loops.push(loop)
  }
  return loops
}

/** Signed shoelace: positive is an outline, negative is a hole. */
function signedArea(ring) {
  let sum = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % n]
    sum += x0 * y1 - x1 * y0
  }
  return sum / 2
}

const pointInRing = ([x, y], ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** One ID frame -> regions, each a named object with an outline and holes. */
function regionsIn(data, info) {
  const { width: W, height: H, channels } = info
  const labels = new Int32Array(W * H).fill(-1)
  const regions = []
  const stack = []

  const colourAt = (at) => {
    const i = at * channels
    return ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) >>> 0
  }

  for (let start = 0; start < W * H; start++) {
    if (labels[start] !== -1) continue
    const colour = colourAt(start)
    const name = byColour.get(colour)
    if (!name) {
      labels[start] = -2 // background, or a colour nobody named
      continue
    }

    const id = regions.length
    const region = { name, pixels: 0, box: [W, H, 0, 0] }
    regions.push(region)
    stack.push(start)
    labels[start] = id

    while (stack.length) {
      const at = stack.pop()
      const x = at % W
      const y = (at - x) / W
      region.pixels += 1
      if (x < region.box[0]) region.box[0] = x
      if (y < region.box[1]) region.box[1] = y
      if (x > region.box[2]) region.box[2] = x
      if (y > region.box[3]) region.box[3] = y

      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return
        const next = ny * W + nx
        if (labels[next] !== -1 || colourAt(next) !== colour) return
        labels[next] = id
        stack.push(next)
      }
      push(x - 1, y)
      push(x + 1, y)
      push(x, y - 1)
      push(x, y + 1)
    }
  }

  return { labels, regions, W, H }
}

// -- build ------------------------------------------------------------------ --

const file = createHotspotFile({
  source: 'mask',
  project: dir.split(/[\\/]/).pop(),
  frameCount: camera?.frameCount ?? idFrames.length,
  notes: 'Traced from Object-ID passes',
})

const started = Date.now()
let traced = 0

for (const [index, name] of idFrames.entries()) {
  if (options.frames && !options.frames.includes(index)) continue
  const { data, info } = await sharp(join(dir, 'id', name)).raw().toBuffer({ resolveWithObject: true })
  const { labels, regions, W, H } = regionsIn(data, info)
  const minArea = options.minAreaPx
  const epsilon = options.epsilonPx

  // Biggest regions first, so a capped object keeps the piece that matters.
  const order = regions
    .map((region, id) => ({ region, id }))
    .filter(({ region }) => region.pixels >= minArea)
    .sort((a, b) => b.region.pixels - a.region.pixels)

  const perName = new Map()
  const unitShapes = new Map()

  for (const { region, id } of order) {
    const kept = perName.get(region.name) ?? 0
    if (kept >= options.maxPieces) continue

    const target = targetFor(region.name)
    if (!target) continue
    if (options.floors === 'union' && target.kind === 'floor') continue

    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && labels[y * W + x] === id
    const loops = loopsOf(inside, region.box)
    const outlines = loops.filter((loop) => signedArea(loop) > 0)
    const holes = loops.filter((loop) => signedArea(loop) < 0)
    if (!outlines.length) continue

    const outline = outlines.sort((a, b) => signedArea(b) - signedArea(a))[0]
    const toFraction = (ring) => ring.map(([x, y]) => [x / W, y / H])
    const outerPx = simplifyRing(outline, epsilon)
    const mine = holes
      .filter((hole) => Math.abs(signedArea(hole)) >= minArea && pointInRing(hole[0], outline))
      .map((hole) => simplifyRing(hole, epsilon))

    if (!file.targets[region.name]) defineTarget(file, region.name, target)
    const points = toFraction(outerPx)
    addShape(file, index, { id: region.name, points, holes: mine.map(toFraction) })
    perName.set(region.name, kept + 1)
    traced += 1

    if (options.floors === 'union' && (target.kind === 'unit' || target.kind === 'room')) {
      const floorId = floorIdFor(target)
      if (!unitShapes.has(floorId)) unitShapes.set(floorId, { target, polygons: [] })
      unitShapes.get(floorId).polygons.push([points])
    }
  }

  // A floor band is the homes on it, merged — the same rule the projector
  // uses, so the two files can be compared shape for shape.
  for (const [floorId, { target, polygons }] of unitShapes) {
    if (!polygons.length) continue
    let merged
    try {
      merged = polygonClipping.union(...polygons)
    } catch {
      continue
    }
    if (!file.targets[floorId]) defineTarget(file, floorId, { kind: 'floor', tower: target.tower, floor: target.floor })
    for (const polygon of merged
      .filter((p) => area(p[0]) >= minArea / (W * H))
      .sort((a, b) => area(b[0]) - area(a[0]))
      .slice(0, options.maxPieces)) {
      addShape(file, index, {
        id: floorId,
        points: polygon[0],
        holes: polygon.slice(1).filter((hole) => area(hole) >= minArea / (W * H)),
      })
    }
  }

  process.stdout.write(`\r  traced frame ${index + 1}/${idFrames.length}`)
}
process.stdout.write('\n')

const report = validateHotspots(file)
const out = join(dir, options.out)
writeFileSync(out, JSON.stringify(file))
console.log(`\n${out} · ${describeHotspots(file)} · ${Math.round(readFileSync(out).length / 1024)} kB · ${((Date.now() - started) / 1000).toFixed(1)}s`)
for (const error of report.errors.slice(0, 5)) console.log(`  ✗ ${error}`)

// -- comparison against the projector --------------------------------------- --

if (options.compare) {
  const otherPath = join(dir, 'hotspots.json')
  if (!existsSync(otherPath)) {
    console.log('  (no hotspots.json to compare against — run build-hotspots first)')
  } else {
    const other = JSON.parse(readFileSync(otherPath, 'utf8'))
    const multiOf = (shapes) => {
      let union = []
      for (const shape of shapes) {
        const polygon = [shape.d, ...(shape.holes ?? [])]
        try {
          union = union.length ? polygonClipping.union(union, [polygon]) : [polygon]
        } catch {
          // a self-touching ring: keep what we have
        }
      }
      return union
    }
    const byId = (entry) => {
      const map = new Map()
      for (const shape of entry?.shapes ?? []) {
        if (!map.has(shape.id)) map.set(shape.id, [])
        map.get(shape.id).push(shape)
      }
      return map
    }
    const areaOf = (multi) => multi.reduce((sum, polygon) => sum + polygon.reduce((s, ring, i) => s + (i ? -area(ring) : area(ring)), 0), 0)

    const scores = []
    const perKind = new Map()
    let onlyTraced = 0
    let onlyProjected = 0

    for (const entry of file.frames) {
      const mine = byId(entry)
      const theirs = byId(other.frames.find((f) => f.frame === entry.frame))
      for (const [id, shapes] of mine) {
        const match = theirs.get(id)
        if (!match) {
          onlyTraced += 1
          continue
        }
        const a = multiOf(shapes)
        const b = multiOf(match)
        let intersection = []
        let union = []
        try {
          intersection = polygonClipping.intersection(a, b)
          union = polygonClipping.union(a, b)
        } catch {
          continue
        }
        const iou = areaOf(union) > 0 ? areaOf(intersection) / areaOf(union) : 0
        scores.push({ id, frame: entry.frame, iou })
        const kind = file.targets[id]?.kind ?? 'unknown'
        if (!perKind.has(kind)) perKind.set(kind, [])
        perKind.get(kind).push(iou)
      }
      for (const id of theirs.keys()) if (!mine.has(id)) onlyProjected += 1
    }

    const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0)
    const all = scores.map((s) => s.iou)
    console.log(`\n  traced vs projected — ${scores.length} shapes compared on ${file.frames.length} frames`)
    console.log(`  mean overlap ${(mean(all) * 100).toFixed(1)}%  ·  median ${(all.sort((a, b) => a - b)[Math.floor(all.length / 2)] * 100).toFixed(1)}%`)
    for (const [kind, list] of [...perKind].sort()) {
      console.log(`    ${kind.padEnd(8)} ${(mean(list) * 100).toFixed(1)}% over ${list.length} shapes`)
    }
    console.log(`  only traced: ${onlyTraced} · only projected: ${onlyProjected}`)
    const worst = scores.sort((a, b) => a.iou - b.iou).slice(0, 5)
    if (worst.length) {
      console.log(`  worst: ${worst.map((s) => `${s.id}@${s.frame} ${(s.iou * 100).toFixed(0)}%`).join(' · ')}`)
    }
  }
}
