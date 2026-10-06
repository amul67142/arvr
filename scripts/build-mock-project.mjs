/**
 * Turns the synthetic delivery into a project the viewer can open.
 *
 *   node scripts/mock-studio.mjs        # the "studio" renders
 *   node scripts/build-hotspots.mjs public/demo/mock --verify
 *   node scripts/build-mock-project.mjs # -> public/demo/mock/orbit.json
 *
 * This is the same shape a real project's orbit manifest takes: the frames,
 * where the hotspots live, and the inventory behind them. Paths are absolute
 * so the file also works when it is attached by hand in the editor.
 *
 * Every frame is a stop frame here, because the projector bakes polygons for
 * all of them — the overlay no longer has to wait for the orbit to rest.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'public/demo/mock'
const base = `/${dir.replace(/^public\//, '').replace(/\\/g, '/')}`

const camera = JSON.parse(readFileSync(join(dir, 'camera.json'), 'utf8'))
const hotspots = JSON.parse(readFileSync(join(dir, 'hotspots.json'), 'utf8'))
const frames = readdirSync(join(dir, 'beauty'))
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .sort()
  .map((name) => `${base}/beauty/${name}`)

// The developer's price list, invented for the test.
const TYPES = {
  A: { type: '3BHK', bhk: 3, sbua: 1870, carpet: 1360, facing: 'East · Park' },
  B: { type: '3BHK', bhk: 3, sbua: 1870, carpet: 1360, facing: 'North · Skyline' },
  C: { type: '2BHK', bhk: 2, sbua: 1240, carpet: 910, facing: 'West · Sunset' },
  D: { type: '2BHK', bhk: 2, sbua: 1240, carpet: 910, facing: 'South · Greens' },
}
const STATUS = ['Available', 'Available', 'Available', 'Available', 'Available', 'Booked', 'Sold']
const statusFor = (key) => {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return STATUS[hash % STATUS.length]
}
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`

// How many floors the hotspots actually describe.
const floors = Math.max(
  ...Object.values(hotspots.targets)
    .map((target) => target.floor ?? 0)
    .filter(Boolean),
)

const units = []
for (let floor = 1; floor <= floors; floor++) {
  for (const [code, spec] of Object.entries(TYPES)) {
    const id = `${floor}${code}`
    const rate = 21000 + Math.max(0, floor - 3) * 40
    units.push({
      id,
      flatNo: id,
      floor,
      floorLabel: ordinal(floor),
      code,
      type: spec.type,
      bhk: spec.bhk,
      sbua: spec.sbua,
      carpet: spec.carpet,
      facing: spec.facing,
      status: statusFor(`mock-${id}`),
      price: Math.round((rate * spec.sbua) / 1e5) / 100,
      interiors: [],
    })
  }
}

const manifest = {
  version: 1,
  source: 'Synthetic delivery from scripts/mock-studio.mjs — a pipeline test, not a project',
  aspect: (camera.aspect ?? 16 / 9),
  frameCount: frames.length,
  preview: frames,
  full: frames,
  // The polygons this project is clickable by.
  hotspots: `${base}/hotspots.json`,
  // Hotspots exist for every frame, so every frame can be rested on.
  stopEvery: 1,
  building: { id: 'T1', label: 'Mock Tower', floors },
  plan: [
    { code: 'A', type: '3BHK', facing: 'East · Park', start: -45 },
    { code: 'B', type: '3BHK', facing: 'North · Skyline', start: 45 },
    { code: 'C', type: '2BHK', facing: 'West · Sunset', start: 135 },
    { code: 'D', type: '2BHK', facing: 'South · Greens', start: 225 },
  ],
  typeColors: { '3BHK': '#a881f9', '2BHK': '#6fd3c7' },
  units,
  unitPlans: { '3BHK': '/demo/unit-3bhk.plan.json' },
  interiors: {},
  amenities: {},
}

writeFileSync(join(dir, 'orbit.json'), JSON.stringify(manifest))
console.log(
  `wrote ${join(dir, 'orbit.json')} · ${frames.length} frames · ${floors} floors · ${units.length} homes · ` +
    `hotspots ${manifest.hotspots}`,
)
