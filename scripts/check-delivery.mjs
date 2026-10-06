/**
 * Checks a studio delivery before anyone builds anything from it.
 *
 *   node scripts/check-delivery.mjs public/demo/mock
 *
 * Reads whatever the folder actually contains and reports what is usable:
 *
 *   camera.json   one camera per frame, finite, with a lens
 *   proxy.glb     named objects, real transforms, sane bounds
 *   beauty/       the frames a buyer will see
 *   id/           flat-colour Object-ID pass, matched to colors.csv
 *   truth.json    optional; only our synthetic deliveries have one
 *
 * This is gate 3 in docs/HOTSPOT-PIPELINE-PLAN.md: the studio's pilot batch
 * runs through here first, and the full render is ordered only if it passes.
 * Everything is a warning unless it would stop the bake, so one bad frame is
 * reported rather than thrown.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { NodeIO } from '@gltf-transform/core'

const dir = process.argv[2] ?? 'public/demo/mock'
const problems = []
const notes = []
const fail = (message) => problems.push(message)
const note = (message) => notes.push(message)

const framesIn = (folder) =>
  existsSync(join(dir, folder))
    ? readdirSync(join(dir, folder))
        .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
        .sort()
    : []

// -- camera ---------------------------------------------------------------- --

let camera = null
if (!existsSync(join(dir, 'camera.json'))) {
  note('no camera.json — the projector cannot run; only the mask tracer can')
} else {
  camera = JSON.parse(readFileSync(join(dir, 'camera.json'), 'utf8'))
  const frames = camera.frames ?? []
  const broken = frames.filter(
    (f) => !Array.isArray(f.eye) || f.eye.some((v) => !Number.isFinite(v)) || !Array.isArray(f.target),
  )
  if (!camera.fovY && !camera.focalLength) fail('camera.json has neither fovY nor focalLength')
  if (broken.length) fail(`camera.json: ${broken.length} frames have no usable position`)
  if (camera.frameCount && frames.length !== camera.frameCount) {
    fail(`camera.json says ${camera.frameCount} frames but lists ${frames.length}`)
  }

  // A turntable should keep its radius and height; drift means the studio
  // animated the camera, which the projector must be told about.
  const radii = frames.map((f) => Math.hypot(f.eye[0] - f.target[0], f.eye[2] - f.target[2]))
  const heights = frames.map((f) => f.eye[1])
  const spread = (values) => Math.max(...values) - Math.min(...values)
  if (radii.length > 1) {
    note(
      `camera path: radius ${radii[0].toFixed(1)} m (spread ${spread(radii).toFixed(2)}), ` +
        `height ${heights[0].toFixed(1)} m (spread ${spread(heights).toFixed(2)})`,
    )
    if (spread(radii) > radii[0] * 0.02) note('  radius varies — not a clean turntable, solve the camera per frame')
  }
}

// -- proxy ----------------------------------------------------------------- --

let proxyNodes = []
if (!existsSync(join(dir, 'proxy.glb'))) {
  note('no proxy.glb — the projector cannot run; only the mask tracer can')
} else {
  const doc = await new NodeIO().read(join(dir, 'proxy.glb'))
  proxyNodes = doc.getRoot().listNodes()
  const named = proxyNodes.filter((n) => n.getName() && n.getName() !== 'Node')
  const withMesh = proxyNodes.filter((n) => n.getMesh())
  if (named.length === 0) fail('proxy.glb has no named objects — nothing can be linked to a flat')
  if (withMesh.length === 0) fail('proxy.glb has no geometry')

  const pattern = /^T\d+_F\d+_[A-Z]+(_[A-Z]+)?$/
  const matching = named.filter((n) => pattern.test(n.getName()))
  const rooms = matching.filter((n) => n.getName().endsWith('_BAL'))
  const slabs = matching.filter((n) => n.getName().endsWith('_SLAB'))
  const units = matching.filter((n) => !n.getName().endsWith('_BAL') && !n.getName().endsWith('_SLAB'))
  note(
    `proxy.glb: ${proxyNodes.length} nodes, ${named.length} named — ` +
      `${units.length} flats, ${rooms.length} balconies, ${slabs.length} floor bands`,
  )
  if (units.length === 0) {
    fail('no object matches the naming convention T<tower>_F<floor>_<unit> — see the render brief')
  }

  // Degenerate transforms are the usual sign of a wrong export.
  const flat = proxyNodes.filter((n) => n.getMesh() && n.getScale().some((s) => Math.abs(s) < 1e-4))
  if (flat.length) fail(`${flat.length} proxy objects have a zero scale`)
}

// -- frames ---------------------------------------------------------------- --

const beauty = framesIn('beauty')
const ids = framesIn('id')
note(`frames: ${beauty.length} beauty, ${ids.length} id`)
if (beauty.length === 0) fail('no beauty frames')

if (ids.length && beauty.length) {
  const a = await sharp(join(dir, 'beauty', beauty[0])).metadata()
  const b = await sharp(join(dir, 'id', ids[0])).metadata()
  if (a.width !== b.width || a.height !== b.height) {
    fail(`id pass is ${b.width}×${b.height} but the beauty frame is ${a.width}×${a.height}`)
  } else {
    note(`  resolution ${a.width}×${a.height}`)
  }
  if (a.width < 1920) note('  beauty frames are below 1920 px wide — fine for a pilot, too soft for delivery')

  const stems = (list) => new Set(list.map((name) => basename(name).replace(/\.[^.]+$/, '')))
  const beautyStems = stems(beauty)
  const orphans = [...stems(ids)].filter((stem) => !beautyStems.has(stem))
  if (orphans.length) fail(`${orphans.length} id frames have no matching beauty frame (e.g. ${orphans[0]})`)
}

// -- id pass vs colors.csv -------------------------------------------------- --

if (ids.length) {
  if (!existsSync(join(dir, 'colors.csv'))) {
    fail('id frames but no colors.csv — the colours cannot be mapped to flats')
  } else {
    const rows = readFileSync(join(dir, 'colors.csv'), 'utf8').trim().split('\n').slice(1)
    const byColour = new Map()
    for (const row of rows) {
      const [r, g, b, ...rest] = row.split(',')
      byColour.set(`${Number(r)},${Number(g)},${Number(b)}`, rest.join(',').trim())
    }
    if (byColour.size !== rows.length) fail(`colors.csv has ${rows.length} rows but only ${byColour.size} unique colours`)

    // Sample the middle frame: every colour present must be named, and the
    // regions must be flat (anti-aliasing would multiply the colour count).
    const sample = ids[Math.floor(ids.length / 2)]
    const { data, info } = await sharp(join(dir, 'id', sample)).raw().toBuffer({ resolveWithObject: true })
    const seen = new Map()
    for (let i = 0; i < data.length; i += info.channels) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
      if (key === '0,0,0') continue
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const unknown = [...seen.keys()].filter((key) => !byColour.has(key))
    note(`id ${sample}: ${seen.size} objects visible of ${byColour.size} named`)
    if (unknown.length) {
      const stray = unknown.reduce((sum, key) => sum + seen.get(key), 0)
      const share = stray / (info.width * info.height)
      if (share > 0.02 || unknown.length > seen.size) {
        fail(
          `${unknown.length} colours in the id pass are not in colors.csv (${(share * 100).toFixed(1)}% of pixels) — ` +
            'anti-aliasing is probably on; ask for it off',
        )
      } else {
        note(`  ${unknown.length} stray colours (${(share * 100).toFixed(2)}% of pixels) — edge pixels, tolerable`)
      }
    }
    const slivers = [...seen.values()].filter((count) => count < 50).length
    if (slivers) note(`  ${slivers} objects cover fewer than 50 px in this frame`)
  }
}

// -- can the lens be trusted? ----------------------------------------------- --

if (camera && !ids.length) {
  note(
    'no Object-ID frame to solve the lens against — ask the studio for one ' +
      '(minutes of their time), or the stated focal length has to be taken on trust',
  )
} else if (camera && ids.length) {
  note('a lens check is possible: run build-hotspots with --solve')
}

// -- ground truth, when it is ours ------------------------------------------ --

if (existsSync(join(dir, 'truth.json')) && proxyNodes.length) {
  const truth = JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8'))
  let worst = 0
  let missing = 0
  for (const box of truth.boxes) {
    const node = proxyNodes.find((n) => n.getName() === box.name)
    if (!node) {
      missing += 1
      continue
    }
    const t = node.getTranslation()
    const s = node.getScale()
    for (let i = 0; i < 3; i++) {
      worst = Math.max(worst, Math.abs(t[i] - box.center[i]), Math.abs(s[i] - box.size[i]))
    }
  }
  if (missing) fail(`${missing} objects in truth.json are missing from proxy.glb`)
  note(`truth.json: worst proxy transform error ${worst.toExponential(2)} m`)
  if (worst > 1e-3) fail('proxy.glb does not match truth.json')
}

// -- verdict ---------------------------------------------------------------- --

console.log(`\nDelivery check — ${dir}\n`)
for (const line of notes) console.log(`  · ${line}`)
if (problems.length) {
  console.log('')
  for (const line of problems) console.log(`  ✗ ${line}`)
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}. Do not order the full render yet.\n`)
  process.exit(1)
}
console.log('\n  ✓ usable: the projector and the tracer can both run on this.\n')
