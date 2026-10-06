/**
 * Builds the tower overlay for the "Horizon One" orbit demo:
 * public/demo/horizon/orbit.json.
 *
 *   node scripts/build-horizon.mjs
 *
 * The frames come from a free drone orbit (Pexels video 31320451, Pexels
 * licence), extracted with ffmpeg into public/demo/horizon/{preview,frames}.
 * The footage is real, so nothing here draws the building. This script only
 * works out where the tower is in each frame, so the viewer can outline it and
 * light up a floor:
 *
 * 1. Keyframes, read by eye off a grid: the tower's left and right edges at the
 *    roof and at the bottom of the frame, and the top of the roof.
 * 2. For every frame, those guesses are snapped to the real edges. The tower
 *    is dark glass, so along each row its edges are the strongest light-to-dark
 *    steps nearby. A straight line is fitted through them, outliers dropped.
 * 3. The lines are smoothed across frames, so the outline glides and doesn't
 *    jitter.
 *
 * Coordinates are stored as fractions of the frame (0–1), so any resolution
 * tier can use them.
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const DIR = 'public/demo/horizon'
const W = 640
const H = 360

// Read off the preview frames (640 × 360): [frame, xLeftTop, xLeftBottom,
// xRightTop, xRightBottom, roofTop].
const KEYS = [
  [1, 280, 283, 358, 353, 117],
  [30, 282, 290, 355, 352, 112],
  [60, 278, 283, 356, 356, 110],
  [90, 272, 283, 360, 358, 100],
  [120, 272, 283, 368, 362, 112],
  [150, 281, 290, 372, 362, 112],
  [180, 281, 288, 367, 358, 112],
]
const ELLIPSE = 0.28 // roof depth ÷ tower width: the camera looks down ~34°

function guessAt(frame) {
  const i = Math.max(0, KEYS.findIndex((k, n) => frame >= k[0] && frame <= (KEYS[n + 1]?.[0] ?? Infinity)))
  const a = KEYS[i]
  const b = KEYS[Math.min(i + 1, KEYS.length - 1)]
  const t = b[0] === a[0] ? 0 : (frame - a[0]) / (b[0] - a[0])
  return a.slice(1).map((v, k) => v + (b[k + 1] - v) * t)
}

const files = readdirSync(join(DIR, 'preview')).filter((f) => f.endsWith('.webp')).sort()

/** Fit x = a·y + c through points, dropping the worst outliers once. */
function fitLine(points) {
  const solve = (pts) => {
    const n = pts.length
    const sy = pts.reduce((s, p) => s + p.y, 0)
    const sx = pts.reduce((s, p) => s + p.x, 0)
    const syy = pts.reduce((s, p) => s + p.y * p.y, 0)
    const sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
    const d = n * syy - sy * sy || 1
    const a = (n * sxy - sy * sx) / d
    return { a, c: (sx - a * sy) / n }
  }
  let line = solve(points)
  const kept = points.filter((p) => Math.abs(p.x - (line.a * p.y + line.c)) < 3)
  if (kept.length >= 8) line = solve(kept)
  return { ...line, support: kept.length }
}

const raw = []
for (const [index, file] of files.entries()) {
  const frame = index + 1
  const [gLt, gLb, gRt, gRb, gRoof] = guessAt(frame)
  const { data } = await sharp(join(DIR, 'preview', file)).greyscale().raw().toBuffer({ resolveWithObject: true })
  const lum = (x, y) => data[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]
  const band = (x0, x1, y) => {
    let s = 0
    for (let x = x0; x <= x1; x++) s += lum(x, y)
    return s / (x1 - x0 + 1)
  }

  const width = gRt - gLt
  const yc = gRoof + ELLIPSE * width
  const left = []
  const right = []
  for (let y = Math.round(yc + 10); y < H - 4; y += 3) {
    const t = (y - yc) / (H - yc)
    const gl = Math.round(gLt + (gLb - gLt) * t)
    const gr = Math.round(gRt + (gRb - gRt) * t)
    let best = { x: gl, s: 0 }
    for (let x = gl - 10; x <= gl + 10; x++) {
      const s = band(x - 4, x - 1, y) - band(x + 1, x + 4, y) // lighter outside, dark tower inside
      if (s > best.s) best = { x, s }
    }
    if (best.s > 10) left.push({ x: best.x, y })
    best = { x: gr, s: 0 }
    for (let x = gr - 10; x <= gr + 10; x++) {
      const s = band(x + 1, x + 4, y) - band(x - 4, x - 1, y)
      if (s > best.s) best = { x, s }
    }
    if (best.s > 10) right.push({ x: best.x, y })
  }

  const fallback = (top, bottom) => ({ a: (bottom - top) / (H - yc), c: top - ((bottom - top) / (H - yc)) * yc, support: 0 })
  const L = left.length >= 10 ? fitLine(left) : fallback(gLt, gLb)
  const R = right.length >= 10 ? fitLine(right) : fallback(gRt, gRb)
  // Keep a fit only if it stayed near the guess; otherwise trust the guess.
  const near = (line, top, bottom) =>
    Math.abs(line.a * yc + line.c - top) < 8 && Math.abs(line.a * H + line.c - bottom) < 8
  raw.push({
    roof: gRoof,
    lt: near(L, gLt, gLb) ? L.a * yc + L.c : gLt,
    lb: near(L, gLt, gLb) ? L.a * H + L.c : gLb,
    rt: near(R, gRt, gRb) ? R.a * yc + R.c : gRt,
    rb: near(R, gRt, gRb) ? R.a * H + R.c : gRb,
    snapped: [near(L, gLt, gLb) && L.support > 0, near(R, gRt, gRb) && R.support > 0],
  })
}

// Smooth across time: a centred moving average.
const smooth = (key, radius = 3) =>
  raw.map((_, i) => {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(raw.length - 1, i + radius); j++) {
      sum += raw[j][key]
      n += 1
    }
    return sum / n
  })
const series = Object.fromEntries(['roof', 'lt', 'lb', 'rt', 'rb'].map((k) => [k, smooth(k)]))

const round = (v) => Math.round(v * 10000) / 10000
const frames = raw.map((_, i) => {
  const width = series.rt[i] - series.lt[i]
  const yc = series.roof[i] + ELLIPSE * width
  return {
    // Edge lines from the roof line (yc) to the bottom of the frame.
    left: [round(series.lt[i] / W), round(yc / H), round(series.lb[i] / W), 1],
    right: [round(series.rt[i] / W), round(yc / H), round(series.rb[i] / W), 1],
    roofDepth: round((ELLIPSE * width) / H), // ellipse half-height, as a frame fraction
  }
})

const snappedL = raw.filter((r) => r.snapped[0]).length
const snappedR = raw.filter((r) => r.snapped[1]).length

const manifest = {
  version: 1,
  source: 'Pexels video 31320451 (Pexels licence) — demo footage, not a listing',
  aspect: 16 / 9,
  frameCount: files.length,
  preview: files.map((f) => `preview/${f}`),
  full: files.map((f) => `frames/${f}`),
  towers: [
    {
      id: 'Tower_Horizon',
      label: 'Horizon One',
      floors: 48,
      // Floor pitch as a fraction of the tower's width in frame (measured).
      floorPitch: 0.105,
      frames,
    },
  ],
}
// -- stop frames, inventory, gallery ------------------------------------- --

// Like Panom, the orbit comes to rest only on stop frames; overlays appear
// there and hide while turning, so they never lag the footage.
manifest.stopEvery = 12

// One row per home — the developer's Excel sheet, invented for the demo.
// Four homes a floor, one per quarter of the round plan.
const PLAN = [
  { code: 'A', type: '3BHK', facing: 'East · Expressway', start: -45 },
  { code: 'B', type: '3BHK', facing: 'North · Skyline', start: 45 },
  { code: 'C', type: '4BHK', facing: 'West · Sunset', start: 135 },
  { code: 'D', type: '4BHK', facing: 'South · Greens', start: 225 },
]
const TYPES = {
  '3BHK': { bhk: 3, sbua: 1950, carpet: 1420 },
  '4BHK': { bhk: 4, sbua: 2650, carpet: 1980 },
}
const STATUS = ['Available', 'Available', 'Available', 'Available', 'Available', 'Available', 'Booked', 'Sold', 'Sold']
const statusFor = (key) => {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return STATUS[hash % STATUS.length]
}
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`
const RATE = 26000
const FLOOR_RISE = 45
manifest.plan = PLAN
manifest.typeColors = { '3BHK': '#a881f9', '4BHK': '#ff86e3' }
manifest.units = []
for (let floor = 1; floor <= manifest.towers[0].floors; floor++) {
  for (const home of PLAN) {
    const t = TYPES[home.type]
    const id = `${floor}${home.code}`
    const rate = RATE + Math.max(0, floor - 4) * FLOOR_RISE
    manifest.units.push({
      id,
      flatNo: id,
      floor,
      floorLabel: ordinal(floor),
      code: home.code,
      type: home.type,
      bhk: t.bhk,
      sbua: t.sbua,
      carpet: t.carpet,
      facing: home.facing,
      status: statusFor(`horizon-${id}`),
      price: Math.round((rate * t.sbua) / 1e5) / 100,
      interiors: ['bathroom', 'walk-in-closet'],
    })
  }
}
manifest.building = { id: 'Tower_Horizon', label: 'Horizon One', floors: manifest.towers[0].floors }
// Plans per home type, drawn from the walkthrough's own layout.
manifest.unitPlans = { '3BHK': '/demo/unit-3bhk.plan.json' }
// 360° tours per home type: view ids in the demo project.
manifest.unitTours = { '3BHK': 'unit-360' }
// Interior and amenity renders — one studio (Maverick Frame, Pexels), so the
// look is consistent. Not this building's interiors; see CREDITS.
manifest.interiors = {
  bathroom: { label: 'Master Bath', image: 'gallery/bathroom.webp' },
  'walk-in-closet': { label: 'Walk-in Wardrobe', image: 'gallery/walk-in-closet.webp' },
}
manifest.amenities = {
  'rooftop-pool': { label: 'Sky Pool', text: 'Infinity-edge pool and sun deck on the 48th floor.', image: 'gallery/rooftop-pool.webp' },
  'indoor-pool': { label: 'Indoor Lap Pool', text: 'Heated pool and spa, open all year.', image: 'gallery/indoor-pool.webp' },
  gardens: { label: 'Podium Gardens', text: 'Landscaped walks and seating around the tower base.', image: 'gallery/gardens.webp' },
}

writeFileSync(join(DIR, 'orbit.json'), JSON.stringify(manifest))
console.log(`wrote ${join(DIR, 'orbit.json')} · ${files.length} frames · edges snapped: left ${snappedL}, right ${snappedR}`)
