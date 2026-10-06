/**
 * Builds the "Maple Court" showcase: public/demo/maple/.
 *
 *   node scripts/build-maple.mjs
 *
 * Panom's technique, reproduced with free renders. Every picture is a
 * professional architectural render: Maverick Frame on Pexels, Pexels licence.
 * Nothing is modelled. The interactive layer sits on fixed "stop" views:
 *
 * - The garden elevation (render 38549783) carries one outline per flat, per
 *   floor, and for the building. The outlines follow the render's own
 *   structure. Floor lines come from its slab bands, and flat boundaries from
 *   the solid brick piers between window groups. The piers were found once by
 *   scanning the two window rows for pixel columns with no glass, and their
 *   centres are the x values in STACKS. Every outline therefore stops on a
 *   wall, never across a window.
 * - The lawn and street renders show other sides of the development. They
 *   carry the building outline and amenity pins, as Panom's wider shots do.
 *
 * The inventory below stands in for the developer's Excel sheet: one row per
 * flat. Names, prices and availability are invented for the demo.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const SRC = '.cache/renders'
const OUT = 'public/demo/maple'
mkdirSync(OUT, { recursive: true })

// ------------------------------------------------------------- images --

const IMAGES = {
  elevation: '38549783',
  lawn: '38549785',
  street: '38565906',
  'rooftop-pool': '38680697',
  'indoor-pool': '38680684',
  gardens: '38506129',
  bathroom: '38565870',
  'walk-in-closet': '38791959',
}
const sizes = {}
for (const [name, id] of Object.entries(IMAGES)) {
  const out = join(OUT, `${name}.webp`)
  const info = await sharp(join(SRC, `${id}.jpg`))
    .resize({ width: 3000, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(out)
  sizes[name] = { width: info.width, height: info.height }
}

// ------------------------------------------------ the garden elevation --

// Floor bands, top to bottom, in the elevation's pixels (3000 × 1442).
const FLOOR_Y = {
  3: [898, 1005], // pavilion only
  2: [1003, 1150],
  1: [1150, 1265],
  0: [1265, 1360],
}
const FLOOR_LABEL = { 0: 'Ground', 1: '1st', 2: '2nd', 3: '3rd' }

// Flats along the facade, left to right, split at the brick piers.
// [position, x0, x1, type, floors, facing]
const STACKS = [
  [1, 300, 565, '3BHK', [0, 1, 2, 3], 'South-West · Corner'],
  [2, 565, 826, '3BHK', [0, 1, 2, 3], 'South · Garden'],
  [3, 826, 1064, '3BHK', [0, 1, 2], 'South · Garden'],
  [4, 1064, 1436, '4BHK', [0, 1, 2], 'South · Garden'],
  [5, 1436, 1732, '3BHK', [0, 1, 2], 'South · Garden'],
  [6, 1732, 2097, '4BHK', [0, 1, 2], 'South · Garden'],
  [7, 2097, 2366, '3BHK', [0, 1, 2], 'South · Garden'],
  [8, 2366, 2571, '2BHK', [0, 1, 2], 'South · Garden'],
  [9, 2571, 2745, '2BHK', [0, 1, 2], 'South-East · Corner'],
]

const TYPES = {
  '2BHK': { bhk: 2, sbua: 1180, carpet: 820 },
  '3BHK': { bhk: 3, sbua: 1650, carpet: 1150 },
  '4BHK': { bhk: 4, sbua: 2150, carpet: 1500 },
}
const RATE = 11500 // ₹ per sq ft
const FLOOR_RISE = 60 // ₹ per sq ft per floor
const STATUS = ['Available', 'Available', 'Available', 'Available', 'Available', 'Booked', 'Sold', 'Sold']
const statusFor = (key) => {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return STATUS[hash % STATUS.length]
}

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

const units = []
const unitShapes = []
for (const [pos, x0, x1, type, floors, facing] of STACKS) {
  for (const floor of floors) {
    const id = `A-${floor}0${pos}`
    const t = TYPES[type]
    const rate = RATE + floor * FLOOR_RISE
    units.push({
      id,
      flatNo: id,
      floor,
      floorLabel: FLOOR_LABEL[floor],
      type,
      bhk: t.bhk,
      sbua: t.sbua,
      carpet: t.carpet,
      facing,
      status: statusFor(id),
      price: Math.round((rate * t.sbua) / 1e5) / 100, // ₹ crore, 2 dp
      interiors: ['bathroom', 'walk-in-closet'],
    })
    const [y0, y1] = FLOOR_Y[floor]
    // Inset a hair so neighbouring outlines don't share one stroke.
    unitShapes.push({ kind: 'unit', id, points: rect(x0 + 3, y0 + 3, x1 - 3, y1 - 3) })
  }
}

const floorShapes = [0, 1, 2, 3].map((floor) => {
  const [y0, y1] = FLOOR_Y[floor]
  const x1 = floor === 3 ? 826 : 2745
  return { kind: 'floor', id: `floor-${floor}`, floor, label: `${FLOOR_LABEL[floor]} floor`, points: rect(300, y0 + 2, x1, y1 - 2) }
})

const building = {
  kind: 'building',
  id: 'maple-court',
  label: 'Maple Court',
  points: [[300, 898], [826, 898], [826, 1000], [2366, 1000], [2366, 968], [2745, 968], [2745, 1360], [300, 1360]],
  pin: [560, 898],
}

// ------------------------------------------------- the other two views --

const lawnBuilding = {
  kind: 'building',
  id: 'maple-court',
  label: 'Maple Court',
  points: [[0, 900], [250, 860], [500, 820], [1480, 960], [1480, 1200], [2730, 1244], [2730, 1840], [1500, 1990], [660, 2080], [0, 2000]],
  pin: [760, 858],
}
const streetBuilding = {
  kind: 'building',
  id: 'maple-court',
  label: 'Maple Court',
  points: [[1560, 1175], [1790, 1085], [1900, 1053], [2000, 1050], [2783, 1208], [2845, 1320], [2845, 1780], [1560, 1780]],
  pin: [2000, 1050],
}

// Amenity pins open the studio's amenity renders.
const AMENITIES = {
  'rooftop-pool': { label: 'Rooftop Pool', text: 'Infinity-edge pool and sun deck on the east block.' },
  'indoor-pool': { label: 'Indoor Pool', text: 'Heated lap pool with spa loungers, open all year.' },
  gardens: { label: 'Landscaped Gardens', text: 'Winding garden walks and seating through the grounds.' },
}
const pin = (amenity, x, y) => ({ kind: 'amenity', id: `pin-${amenity}-${x}`, amenity, label: AMENITIES[amenity].label, at: [x, y] })

const manifest = {
  version: 1,
  kind: 'stops',
  project: 'Maple Court',
  source: 'Renders: Maverick Frame on Pexels (Pexels licence). Project, flats and prices are invented.',
  typeColors: { '2BHK': '#83d3fb', '3BHK': '#a881f9', '4BHK': '#ff86e3' },
  stops: [
    {
      id: 'elevation',
      label: 'Garden Elevation',
      image: 'elevation.webp',
      ...sizes.elevation,
      focus: [180, 760, 2870, 1450], // open framed on the building, not the sky
      shapes: [building, ...floorShapes, ...unitShapes],
      pins: [pin('rooftop-pool', 2555, 968), pin('gardens', 1180, 1395)],
    },
    {
      id: 'lawn',
      label: 'Lawn View',
      image: 'lawn.webp',
      ...sizes.lawn,
      focus: [0, 650, 3000, 2500],
      shapes: [lawnBuilding],
      pins: [pin('gardens', 1900, 2330), pin('indoor-pool', 1000, 1640)],
    },
    {
      id: 'street',
      label: 'Street View',
      image: 'street.webp',
      ...sizes.street,
      focus: [300, 750, 3000, 2300],
      shapes: [streetBuilding],
      pins: [pin('indoor-pool', 2200, 1600), pin('rooftop-pool', 2400, 1140)],
    },
  ],
  amenities: Object.fromEntries(
    Object.entries(AMENITIES).map(([id, a]) => [id, { ...a, image: `${id}.webp` }]),
  ),
  interiors: {
    bathroom: { label: 'Master Bath', image: 'bathroom.webp' },
    'walk-in-closet': { label: 'Walk-in Wardrobe', image: 'walk-in-closet.webp' },
  },
  building: { id: 'maple-court', label: 'Maple Court', floors: 4, note: 'Ground + 3 · pavilion rises to the 3rd floor' },
  units,
}

writeFileSync(join(OUT, 'showcase.json'), JSON.stringify(manifest))
const byType = units.reduce((o, u) => ((o[u.type] = (o[u.type] ?? 0) + 1), o), {})
console.log(`wrote ${OUT}/showcase.json · ${units.length} flats ${JSON.stringify(byType)} · ${manifest.stops.length} stops`)
