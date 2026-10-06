/**
 * How well does one drawn outline follow the orbit? Scored against the
 * traced (Object-ID) hotspots, which are exact.
 *
 *   node scripts/test-follow.mjs public/demo/unreal-orbit [frame] [ids…]
 *
 * The "drawing" is the answer key's own outline on that frame — a perfect
 * hand — so the score measures only the propagation: footage in, outlines on
 * every other frame out, nothing else used. See scripts/lib/orbit-follow.mjs.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

import { hoverHits, pairOutlines, placeOutline, liftOutline, outlineAt, overlap, solveOrbit, toGrey, trackAround } from './lib/orbit-follow.mjs'

const dir = process.argv[2] ?? 'public/demo/unreal-orbit'
const drawn = Number(process.argv[3] ?? 0)
const W = 960, H = 540, SPAN = 12

const orbit = JSON.parse(readFileSync(join(dir, 'orbit.json'), 'utf8'))
const key = JSON.parse(readFileSync(join(dir, 'hotspots.json'), 'utf8'))
const N = orbit.frameCount
const aspect = orbit.aspect

const grey = async (f) => {
  const file = join(dir, 'beauty', `${String(((f % N) + N) % N).padStart(4, '0')}.jpg`)
  const { data } = await sharp(file).resize(W, H).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return toGrey(data, W, H)
}

let t0 = Date.now()
const anchor = await grey(drawn)
const before = [], after = []
for (let k = 1; k <= SPAN; k++) {
  before.push(await grey(drawn - k))
  after.push(await grey(drawn + k))
}
const tracks = trackAround(anchor, before, after, W, H)
console.log(`tracked ${tracks.length} points over ±${SPAN} frames in ${Date.now() - t0} ms`)

t0 = Date.now()
// TRUE_CAMERA=1 uses the camera Unreal actually rendered with, to separate
// camera error from lifting error.
const solve = process.env.TRUE_CAMERA
  ? solveOrbit(tracks, N, { fixed: { focal: 30 / 36, pitch: Math.atan2(4000 - 11500, 32000), step: (-2 * Math.PI) / N } })
  : solveOrbit(tracks, N)
console.log(
  `camera: field of view ${solve.fovDeg.toFixed(1)}° (${(36 * solve.focal).toFixed(1)} mm on full frame), ` +
    `tilt ${((solve.pitch * 180) / Math.PI).toFixed(1)}°, turning ${solve.step > 0 ? '+' : '-'}, ` +
    `median fit ${(solve.rms * W).toFixed(2)} px, ${solve.points.length} points in 3D, ${Date.now() - t0} ms`,
)

const shapesOf = (f, id) => key.frames[f].shapes.filter((s) => s.id === id).map((s) => s.d)
const onFrame = key.frames[drawn].shapes
const largest = [...onFrame].sort((a, b) => b.area - a.area)
const ids = process.argv.slice(4).length
  ? process.argv.slice(4)
  : [...new Set(largest.map((s) => s.id))].filter((id) => key.targets[id]?.kind === 'unit').filter((_, i) => i % 9 === 0).slice(0, 12)

const summary = []
const hovers = []
const buckets = {}
for (const id of ids) {
  const drawnShape = onFrame.filter((s) => s.id === id).sort((a, b) => b.area - a.area)[0]
  if (!drawnShape) continue
  let lifted
  try {
    lifted = liftOutline(drawnShape.d, solve, aspect)
  } catch (error) {
    console.log(id, error.message)
    continue
  }
  // SECOND=<frames>: the second look — the flat drawn again that many frames
  // away (either side, whichever shows more of it), then triangulated from
  // the two drawings.
  const second = Number(process.env.SECOND ?? 0)
  if (second) {
    // Either side, or both when VIEWS=3.
    const offsets = (process.env.VIEWS === '3' ? [second, -second] : [second, -second].slice(0, 1))
    const views = [{ offset: 0, outline: drawnShape.d }]
    const sides = [second, -second].map((offset) => {
      const f = (((drawn + offset) % N) + N) % N
      const truth = shapesOf(f, id)
      return { offset, truth, area: truth.reduce((s, d) => s + Math.abs(areaOf(d)), 0) }
    }).sort((a, b) => b.area - a.area)
    for (const side of sides.slice(0, offsets.length)) {
      if (side.area <= 0) continue
      // The answer key's own outline there, as another careful drawing.
      const there = [...side.truth].sort((p, q) => Math.abs(areaOf(q)) - Math.abs(areaOf(p)))[0]
      views.push({ offset: side.offset, outline: there })
    }
    const paired = pairOutlines(views.map((v) => v.outline), aspect)
    lifted = placeOutline(views.map((v, i) => ({ offset: v.offset, outline: paired[i] })), solve, aspect)
  }
  const scores = []
  let wrongVisible = 0, missed = 0
  for (let f = 0; f < N; f++) {
    let offset = f - drawn
    if (offset > N / 2) offset -= N
    if (offset < -N / 2) offset += N
    const truth = shapesOf(f, id)
    const guess = outlineAt(lifted, solve, offset, aspect)
    const truthArea = truth.reduce((s, d) => s + Math.abs(areaOf(d)), 0)
    if (!guess && truthArea > 0.00015) missed++
    if (guess && truthArea < 0.00002) wrongVisible++
    // Score only where the flat is meaningfully in view, so a sliver that
    // is all edge does not dominate.
    if (guess && truthArea > 0.00015) scores.push({ offset, iou: overlap([guess], truth), hover: hoverHits(guess, truth) })
  }
  if (process.env.PER_FRAME) console.log(scores.map((x) => `${x.offset}:${Math.round(x.hover * 100)}`).join(' '))
  const mean = scores.reduce((s, x) => s + x.iou, 0) / (scores.length || 1)
  const within = (deg) => scores.filter((s) => Math.abs(s.offset) <= deg)
  const avg = (list) => list.reduce((s, x) => s + x.iou, 0) / (list.length || 1)
  summary.push(mean)
  for (const [lo, hi] of [[0, 30], [30, 60], [60, 90], [90, 180]]) {
    const band = scores.filter((x) => Math.abs(x.offset) >= lo && Math.abs(x.offset) < hi)
    buckets[`${lo}-${hi}°`] ??= []
    buckets[`${lo}-${hi}°`].push(...band.map((x) => x.hover))
  }
  hovers.push(scores.reduce((s, x) => s + x.hover, 0) / (scores.length || 1))
  console.log(
    `${id.padEnd(10)} seen on ${String(scores.length).padStart(3)} frames: overlap ${(mean * 100).toFixed(0)}%` +
      ` (±30° ${(avg(within(30)) * 100).toFixed(0)}%, ±60° ${(avg(within(60)) * 100).toFixed(0)}%)` +
      ` · hover hits ${((scores.reduce((s, x) => s + x.hover, 0) / (scores.length || 1)) * 100).toFixed(0)}%` +
      ` · shown when hidden ${wrongVisible} · hidden when shown ${missed} · support ${lifted.support}`,
  )
}
console.log(`mean overlap ${((summary.reduce((a, b) => a + b, 0) / summary.length) * 100).toFixed(1)}%, hover hits ${((hovers.reduce((a, b) => a + b, 0) / hovers.length) * 100).toFixed(1)}% over ${summary.length} homes`)

function areaOf(points) {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length]
    s += x0 * y1 - x1 * y0
  }
  return s / 2
}
console.log('hover hits by angle from the drawn frame: ' + Object.entries(buckets).map(([k, v]) => `${k} ${((v.reduce((a, b) => a + b, 0) / (v.length || 1)) * 100).toFixed(0)}% (${v.length})`).join(' · '))
