/**
 * Turns the Unreal delivery into a project the viewer can open.
 *
 *   node scripts/import-unreal-render.mjs --to public/demo/unreal-tower
 *   node scripts/trace-masks.mjs public/demo/unreal-tower
 *   node scripts/build-unreal-project.mjs
 *   node scripts/build-unreal-project.mjs public/demo/unreal-highrise highrise
 *
 * The inventory is read out of the hotspots rather than declared here: the
 * homes that exist are the homes the ID pass actually drew, so the price list
 * and the clickable polygons cannot drift apart.
 */
import { readFileSync, readdirSync, renameSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'public/demo/unreal-tower'
// 'tower': the curved tower, six homes a floor. 'highrise': the 21-storey slab,
// eight a floor - four balcony stacks on each long face.
const PRESET = process.argv[3] ?? 'tower'
const base = `/${dir.replace(/^public\//, '').split(String.fromCharCode(92)).join('/')}`

// The tracer writes hotspots-traced.json; the manifest points at hotspots.json.
if (existsSync(join(dir, 'hotspots-traced.json'))) {
  renameSync(join(dir, 'hotspots-traced.json'), join(dir, 'hotspots.json'))
}
const hotspots = JSON.parse(readFileSync(join(dir, 'hotspots.json'), 'utf8'))
const frames = readdirSync(join(dir, 'beauty'))
  .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  .sort()
  .map((name) => `${base}/beauty/${name}`)

// Six homes a floor, tiling the plate: two rows of three.
const TOWER_TYPES = {
  A: { type: '3BHK', bhk: 3, sbua: 1840, carpet: 1330, facing: 'North-West · Park' },
  B: { type: '4BHK', bhk: 4, sbua: 2420, carpet: 1760, facing: 'North · Skyline' },
  C: { type: '3BHK', bhk: 3, sbua: 1840, carpet: 1330, facing: 'North-East · City' },
  D: { type: '3BHK', bhk: 3, sbua: 1810, carpet: 1310, facing: 'South-West · Greens' },
  E: { type: '4BHK', bhk: 4, sbua: 2420, carpet: 1760, facing: 'South · Podium' },
  F: { type: '3BHK', bhk: 3, sbua: 1810, carpet: 1310, facing: 'South-East · Avenue' },
}
// Eight a floor: corner homes are three-bedroom, the middle ones two.
const HIGHRISE_TYPES = {
  A: { type: '3BHK', bhk: 3, sbua: 1650, carpet: 1190, facing: 'North-West · Gardens' },
  B: { type: '2BHK', bhk: 2, sbua: 1180, carpet: 850, facing: 'North · Pool' },
  C: { type: '2BHK', bhk: 2, sbua: 1180, carpet: 850, facing: 'North · Clubhouse' },
  D: { type: '3BHK', bhk: 3, sbua: 1650, carpet: 1190, facing: 'North-East · Gardens' },
  E: { type: '3BHK', bhk: 3, sbua: 1650, carpet: 1190, facing: 'South-East · Avenue' },
  F: { type: '2BHK', bhk: 2, sbua: 1180, carpet: 850, facing: 'South · Avenue' },
  G: { type: '2BHK', bhk: 2, sbua: 1180, carpet: 850, facing: 'South · Avenue' },
  H: { type: '3BHK', bhk: 3, sbua: 1650, carpet: 1190, facing: 'South-West · Avenue' },
}
const TYPES = PRESET === 'highrise' ? HIGHRISE_TYPES : TOWER_TYPES
const STATUS = ['Available', 'Available', 'Available', 'Available', 'Available', 'Booked', 'Sold']
const statusFor = (key) => {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return STATUS[hash % STATUS.length]
}
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`

// Which homes the ID pass actually drew.
const found = new Set()
let floors = 0
for (const target of Object.values(hotspots.targets)) {
  if (target.kind === 'unit' && target.unit) {
    found.add(target.unit)
    floors = Math.max(floors, target.floor ?? 0)
  }
}

const units = []
for (const id of [...found].sort()) {
  const match = /^(\d+)([A-H])$/.exec(id)
  if (!match) continue
  const floor = Number(match[1])
  const code = match[2]
  const spec = TYPES[code]
  if (!spec) continue
  const rate = 23500 + Math.max(0, floor - 4) * 55
  units.push({
    id,
    flatNo: id,
    floor,
    floorLabel: ordinal(floor),
    code,
    ...spec,
    price: Number(((spec.sbua * rate) / 1e7).toFixed(2)),
    status: statusFor(id),
    interiors: [],
  })
}

const manifest = {
  version: 1,
  source: 'Rendered in Unreal Engine 5.8 from a stock high-rise — a pipeline test, not a project',
  aspect: 16 / 9,
  frameCount: frames.length,
  preview: frames,
  full: frames,
  hotspots: `${base}/hotspots.json`,
  stopEvery: 1,
  building: { id: 'T1', label: PRESET === 'highrise' ? 'Highrise Residences' : 'Unreal Tower', floors },
  plan: PRESET === 'highrise'
    ? Object.entries(HIGHRISE_TYPES).map(([code, spec], i) => ({ code, type: spec.type, facing: spec.facing, start: -90 + i * 45 }))
    : [
    { code: 'A', type: '3BHK', facing: 'North-West · Park', start: -60 },
    { code: 'B', type: '4BHK', facing: 'North · Skyline', start: 0 },
    { code: 'C', type: '3BHK', facing: 'North-East · City', start: 60 },
    { code: 'D', type: '3BHK', facing: 'South-West · Greens', start: 120 },
    { code: 'E', type: '4BHK', facing: 'South · Podium', start: 180 },
    { code: 'F', type: '3BHK', facing: 'South-East · Avenue', start: 240 },
  ],
  typeColors: { '2BHK': '#6ec6b8', '3BHK': '#a881f9', '4BHK': '#e0ad62' },
  units,
  unitPlans: {},
  interiors: {},
  amenities: {},
}

writeFileSync(join(dir, 'orbit.json'), JSON.stringify(manifest))
console.log(
  `wrote ${join(dir, 'orbit.json')} · ${frames.length} frames · ${floors} floors · ${units.length} homes`,
)
