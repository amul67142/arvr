/**
 * Turns the panorama stops into a walkthrough the viewer can open.
 *
 *   node scripts/build-unreal-tour.mjs
 *
 * Every link marker is placed by geometry rather than by eye. The panoramas
 * were all rendered with the camera's heading at zero, so the bearing from one
 * stop to the next fixes exactly which column of the image the marker belongs
 * in — measured against the renders, +Y in the world lands at u = 0.75. The
 * same arithmetic gives the marker's height from the climb between the stops,
 * so a link up to the roof points up rather than at the horizon.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const from = process.argv[2] ?? 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders'
const to = process.argv[3] ?? 'public/demo/unreal-tower/tour'

const stops = readFileSync(join(from, 'pano-stops.csv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => {
    const [frame, name, x, y, z] = line.split(',')
    return { frame, name, x: +x, y: +y, z: +z }
  })

const LABELS = {
  approach: 'The Approach',
  forecourt: 'Forecourt',
  podium: 'Podium Deck',
  deck: 'Pool Deck',
  skyline: 'Skyline View',
  roof: 'Roof Terrace',
}
const LINKS = {
  approach: ['forecourt'],
  forecourt: ['approach', 'podium'],
  podium: ['forecourt', 'deck', 'skyline'],
  deck: ['podium'],
  skyline: ['podium', 'roof'],
  roof: ['skyline'],
}

/** Where a world direction falls in the panorama. */
const uFor = (dx, dy) => {
  const bearing = (Math.atan2(dy, dx) * 180) / Math.PI
  return Number((((((-bearing / 360) % 1) + 1) % 1)).toFixed(4))
}
/** And how far above or below the horizon. */
const vFor = (dx, dy, dz) => {
  const elevation = Math.atan2(dz, Math.hypot(dx, dy))
  return Number(Math.min(0.88, Math.max(0.12, 0.5 - elevation / Math.PI)).toFixed(4))
}

mkdirSync(to, { recursive: true })
const rooms = stops.map((stop) => {
  copyFileSync(join(from, 'pano', `${stop.frame}.jpeg`), join(to, `${stop.name}.jpg`))
  const links = (LINKS[stop.name] ?? []).map((target) => {
    const other = stops.find((s) => s.name === target)
    const dx = other.x - stop.x
    const dy = other.y - stop.y
    // Aim at the far stop's standing height, not its camera height, so a
    // marker on flat ground sits on the ground rather than in the sky.
    const dz = other.z - stop.z - 60
    return { to: target, u: uFor(dx, dy), v: vFor(dx, dy, dz), label: LABELS[target] }
  })
  return {
    id: stop.name,
    label: LABELS[stop.name] ?? stop.name,
    src: `${stop.name}.jpg`,
    look: uFor(-1564 - stop.x, -90 - stop.y), // open facing the tower
    at: [Number((stop.x / 100).toFixed(1)), Number((-stop.y / 100).toFixed(1))],
    faceAt: 270,
    links,
  }
})

// A site plan for the mini-map: the same footprints the model has.
const plan = {
  bounds: [-62, -42, 66, 78],
  rooms: [
    { id: 'Site', rect: [-62, -42, 66, 78], outdoor: true },
    { id: 'Podium', rect: [-54.6, -34.3, 61.8, 31.6] },
    { id: 'Tower', rect: [-41.2, -14.2, 10.0, 16.0] },
  ],
}
writeFileSync(join(to, 'site.plan.json'), JSON.stringify(plan))

const tour = {
  version: 2,
  source: 'Equirectangular 360s rendered in Unreal Engine 5.8 from a stock high-rise. A pipeline test, not a project.',
  plan: `/demo/unreal-tower/tour/site.plan.json`,
  rooms,
}
writeFileSync(join(to, 'tour.json'), JSON.stringify(tour, null, 2))

console.log(`wrote ${to}/tour.json · ${rooms.length} stops`)
for (const room of rooms) {
  console.log(`  ${room.id.padEnd(10)} at [${room.at}]  links: ${room.links.map((l) => `${l.to}@u${l.u}`).join(' ') || '—'}`)
}
