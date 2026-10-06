/**
 * Floors repeat: draw the lowest and highest flat of a column, and fill the
 * floors between by spacing them evenly in 3D. Scored like test-follow.
 *
 *   node scripts/test-stamp.mjs public/demo/unreal-orbit [frame] [low] [high] [spread]
 *
 * Each of the two flats is "drawn" (answer-key outline) on the frame and
 * `spread` frames either side of it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

import { fillBetween, hoverHits, outlineAt, pairOutlines, placeOutline, solveOrbit, toGrey, trackAround } from './lib/orbit-follow.mjs'

const dir = process.argv[2] ?? 'public/demo/unreal-orbit'
const drawn = Number(process.argv[3] ?? 0)
const low = Number(process.argv[4] ?? 3), high = Number(process.argv[5] ?? 24)
const spread = Number(process.argv[6] ?? 60)
const W = 960, H = 540, SPAN = 12
const orbit = JSON.parse(readFileSync(join(dir, 'orbit.json'), 'utf8'))
const key = JSON.parse(readFileSync(join(dir, 'hotspots.json'), 'utf8'))
const N = orbit.frameCount, aspect = orbit.aspect
const grey = async (f) => {
  const file = join(dir, 'beauty', `${String(((f % N) + N) % N).padStart(4, '0')}.jpg`)
  const { data } = await sharp(file).resize(W, H).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return toGrey(data, W, H)
}
const anchor = await grey(drawn)
const before = [], after = []
for (let k = 1; k <= SPAN; k++) {
  before.push(await grey(drawn - k))
  after.push(await grey(drawn + k))
}
const solve = solveOrbit(trackAround(anchor, before, after, W, H), N)
const area = (d) => {
  let s = 0
  for (let i = 0; i < d.length; i++) s += d[i][0] * d[(i + 1) % d.length][1] - d[(i + 1) % d.length][0] * d[i][1]
  return Math.abs(s / 2)
}
const at = (f) => (((f % N) + N) % N)
const shapes = (f, id) => key.frames[at(f)].shapes.filter((s) => s.id === id).map((s) => s.d)
const biggest = (f, id) => shapes(f, id).sort((a, b) => area(b) - area(a))[0]
const floorId = (sector, floor) => `T1_F${String(floor).padStart(2, '0')}_${sector}`

const all = []
for (const sector of 'ABCDEF') {
  const lo = floorId(sector, low), hi = floorId(sector, high)
  const offsets = [0, spread, -spread].filter((o) => biggest(drawn + o, lo) && biggest(drawn + o, hi) && area(biggest(drawn + o, lo)) > 0.0001)
  if (!offsets.includes(0) || offsets.length < 2) {
    console.log(`${sector}: not drawable on these frames`)
    continue
  }
  const place = (id) => {
    const paired = pairOutlines(offsets.map((o) => biggest(drawn + o, id)), aspect)
    return placeOutline(offsets.map((o, i) => ({ offset: o, outline: paired[i] })), solve, aspect)
  }
  const a = place(lo), b = place(hi)
  const scores = []
  for (let floor = 1; floor <= 25; floor++) {
    const t = (floor - low) / (high - low)
    const stamped = fillBetween(a, b, t)
    const id = floorId(sector, floor)
    let hits = 0, count = 0
    for (let f = 0; f < N; f++) {
      let offset = f - drawn
      if (offset > N / 2) offset -= N
      if (offset < -N / 2) offset += N
      if (Math.abs(offset) > 90) continue
      const truth = shapes(f, id)
      if (truth.reduce((s, d) => s + area(d), 0) < 0.00015) continue
      hits += hoverHits(outlineAt(stamped, solve, offset, aspect), truth)
      count++
    }
    if (count) scores.push({ floor, hover: hits / count })
  }
  const mean = scores.reduce((s, x) => s + x.hover, 0) / scores.length
  all.push(mean)
  console.log(`column ${sector}: drawn floors ${low} and ${high} on ${offsets.length} frames → ${scores.length} floors, hover hits ${(mean * 100).toFixed(0)}%` +
    `  [${scores.map((s) => `${s.floor}:${Math.round(s.hover * 100)}`).join(' ')}]`)
}
console.log(`all columns: hover hits ${((all.reduce((a, b) => a + b, 0) / all.length) * 100).toFixed(1)}% (frames within 90° of the drawn one)`)
