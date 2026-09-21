/**
 * Builds the demo amenities walkthrough: the landscaped grounds of the project
 * at human scale, to be walked like a visitor would.
 *
 *   node scripts/fetch-polyhaven.mjs   (once)
 *   node scripts/build-amenities.mjs
 *
 * Writes public/demo/amenities.glb — entrance plaza with gatehouse and
 * fountain, central lawn ringed by a jogging track, a 25 m pool with deck,
 * loungers and umbrellas, a kids' play area (slide, swings, see-saw, climbing
 * arches, sandpit), a fenced tennis court and a clubhouse pavilion you can walk
 * into. Trees, shrubs, lamps, benches and picnic tables are CC0 Poly Haven
 * models; surfaces are Poly Haven textures; the rest is generated.
 *
 * Site: x −48…48, z −40…38 (metres). Entrance on the south edge (z = 38).
 */
import { mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createScene } from './lib/scene.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../public/demo/amenities.glb')

const s = await createScene('Amenities')
const { THREE } = s
const M = s.materials.define

// ------------------------------------------------------------ materials --

// A manicured lawn. None of Poly Haven's grass textures is one — they are all
// natural ground and render sandy at eye level — so the colour is set here and
// only leafy_grass's normal map is kept, for blade-level surface grain.
M('grass', { texture: 'leafy_grass', maps: ['nor_gl'], tile: 3, color: [0.3, 0.48, 0.2], roughness: 0.95, normalScale: 0.8 })
M('plaza', { texture: 'hexagonal_concrete_paving', tile: 2.2 })
M('path', { texture: 'patio_tiles', tile: 1.8 })
M('track', { texture: 'rubberized_track', tile: 2.5 })
M('rubber', { texture: 'rubber_tiles', tile: 1.4 })
M('deck', { texture: 'wood_floor_deck', tile: 2.2 })
M('poolTile', { texture: 'blue_floor_tiles_01', tile: 1.0 })
M('sandstone', { texture: 'red_sandstone_tiles', tile: 1.8 })
M('asphalt', { texture: 'asphalt_02', tile: 4 })
M('concrete', { texture: 'concrete_floor_02', tile: 3 })
M('marble', { texture: 'marble_01', tile: 2.4, roughness: 0.2, normalScale: 0.3 })
M('water', { color: [0.24, 0.6, 0.72], opacity: 0.62, roughness: 0.03, metallic: 0.1 })
M('courtGreen', { color: [0.2, 0.43, 0.38], roughness: 0.85 })
M('courtClay', { color: [0.56, 0.32, 0.25], roughness: 0.9 })
M('line', { color: [0.95, 0.95, 0.93], roughness: 0.8 })
M('net', { color: [0.1, 0.12, 0.11], opacity: 0.55, roughness: 0.9 })
M('fence', { color: [0.14, 0.22, 0.18], opacity: 0.22, roughness: 0.8 })
M('postGreen', { color: [0.14, 0.22, 0.18], roughness: 0.4, metallic: 0.6 })
M('red', { color: [0.8, 0.22, 0.17], roughness: 0.45 })
M('yellow', { color: [0.95, 0.73, 0.18], roughness: 0.45 })
M('blue', { color: [0.2, 0.42, 0.76], roughness: 0.45 })
M('green', { color: [0.3, 0.63, 0.35], roughness: 0.45 })
M('steel', { color: [0.72, 0.73, 0.75], roughness: 0.3, metallic: 0.9 })
M('chrome', { color: [0.88, 0.89, 0.9], roughness: 0.1, metallic: 1 })
M('timber', { color: [0.55, 0.38, 0.24], roughness: 0.7 })
M('sand', { color: [0.86, 0.78, 0.6], roughness: 1 })
M('canvas', { color: [0.95, 0.93, 0.88], roughness: 0.9, doubleSided: true })
M('cushion', { color: [0.93, 0.91, 0.87], roughness: 0.95 })
M('render', { color: [0.93, 0.92, 0.89], roughness: 0.9 })
M('granite', { color: [0.16, 0.16, 0.17], roughness: 0.35 })
M('glass', { color: [0.78, 0.86, 0.9], opacity: 0.18, roughness: 0.04 })
M('frame', { color: [0.18, 0.18, 0.19], roughness: 0.35, metallic: 0.7 })
M('walnut', { color: [0.33, 0.21, 0.13], roughness: 0.55 })
M('foliage', { color: [0.25, 0.41, 0.21], roughness: 0.9 })
M('bark', { color: [0.3, 0.23, 0.17], roughness: 0.9 })
M('ceiling', { color: [0.95, 0.94, 0.91], roughness: 0.95 })

// ------------------------------------------------------------- helpers --

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const UP = V(0, 1, 0)
const yawTo = (x, z, lookX, lookZ) =>
  Math.round((Math.atan2(-(lookX - x), -(lookZ - z)) * 180) / Math.PI)

/** Cylinder between two points: posts, rails, chains, legs. */
function cyl(name, mat, a, b, radius, segments = 10) {
  const A = V(...a)
  const B = V(...b)
  const geo = new THREE.CylinderGeometry(radius, radius, A.distanceTo(B), segments)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, B.clone().sub(A).normalize())
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, V(1, 1, 1))
  return s.geometry(name, mat, geo, m)
}

/** Any three.js geometry, placed by position / Euler rotation / scale. */
function place(name, mat, geo, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    V(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    V(...scale),
  )
  return s.geometry(name, mat, geo, m)
}

const zone = (label, order, view) => ({
  label,
  order,
  view: { x: view[0], z: view[1], yaw: yawTo(...view) },
})

const nodes = []
const add = (...items) => nodes.push(...items.flat())

// --------------------------------------------------------------- ground --

const POOL = [11.5, -30, 36.5, -18]
const FOUNTAIN = { x: 0, z: 31, r: 2.4 }

// Everything is walkable lawn, with holes where the pool and fountain are,
// so the only way into the water is not at all.
add(
  s.slab(
    'Zone_Landscaped_Gardens',
    'grass',
    { outer: [-48, -40, 48, 38], holes: [POOL], circles: [FOUNTAIN], y: 0 },
    zone('Landscaped Gardens', 8, [40, 34, 20, 20]),
  ),
)

// Entrance plaza, drive lanes and the gatehouse.
add(
  s.slab(
    'Zone_Entrance_Plaza',
    'plaza',
    { outer: [-14, 26, 14, 38], circles: [FOUNTAIN], y: 0.04 },
    zone('Entrance Plaza', 0, [0, 37, 0, 20]),
  ),
  s.box('Walk_Drive_West', 'asphalt', [-48, -0.08, 33], [-14, 0.02, 38]),
  s.box('Walk_Drive_East', 'asphalt', [14, -0.08, 33], [48, 0.02, 38]),
)

// Fountain: raised basin, water, a sculptural column and bowl.
add(
  place('Fountain_Basin', 'granite', new THREE.CylinderGeometry(2.4, 2.5, 0.55, 48), [0, 0.275, 31]),
  place('Water_Fountain', 'water', new THREE.CylinderGeometry(2.2, 2.2, 0.04, 48), [0, 0.52, 31]),
  place('Fountain_Column', 'granite', new THREE.CylinderGeometry(0.28, 0.36, 1.0, 24), [0, 0.8, 31]),
  // The lower hemisphere is already a dish, open side up.
  place(
    'Fountain_Bowl',
    'granite',
    new THREE.SphereGeometry(0.9, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    [0, 2.15, 31],
  ),
  place('Water_Fountain_Bowl', 'water', new THREE.CylinderGeometry(0.82, 0.82, 0.03, 32), [0, 2.1, 31]),
)

// Gate pillars, the monolith sign and a security cabin — every Gurugram
// society has one at the gate.
add(
  s.box('Gate_Pillar_West', 'granite', [-7.2, 0, 37], [-6, 3.4, 38.2]),
  s.box('Gate_Pillar_East', 'granite', [6, 0, 37], [7.2, 3.4, 38.2]),
  s.box('Gate_Beam', 'granite', [-7.2, 3.4, 37.1], [7.2, 3.8, 38.1]),
  s.box('Sign_Monolith', 'granite', [-11.5, 0, 35.6], [-8.5, 1.5, 36]),
  s.box('Gatehouse_Base', 'render', [16.5, 0, 29.5], [20.5, 1.1, 33.5]),
  s.box('Gatehouse_Glass_S', 'glass', [16.5, 1.1, 33.44], [20.5, 2.3, 33.5]),
  s.box('Gatehouse_Glass_W', 'glass', [16.5, 1.1, 29.5], [16.56, 2.3, 33.5]),
  s.box('Gatehouse_Back', 'render', [16.5, 1.1, 29.5], [20.5, 2.3, 29.8]),
  s.box('Gatehouse_Side', 'render', [20.2, 1.1, 29.5], [20.5, 2.3, 33.5]),
  s.box('Gatehouse_Roof', 'granite', [16, 2.3, 29], [21, 2.55, 34.2]),
)

// Boundary wall, with the gate opening in the south side.
add(
  s.box('Boundary_S_West', 'render', [-48, 0, 38], [-7.2, 2.2, 38.3]),
  s.box('Boundary_S_East', 'render', [7.2, 0, 38], [48, 2.2, 38.3]),
  s.box('Boundary_N', 'render', [-48, 0, -40.3], [48, 2.2, -40]),
  s.box('Boundary_W', 'render', [-48.3, 0, -40], [-48, 2.2, 38.3]),
  s.box('Boundary_E', 'render', [48, 0, -40], [48.3, 2.2, 38.3]),
)

// ------------------------------------------------------ lawn and track --

add(
  s.slab('Zone_Central_Lawn', 'grass', { outer: [-22, -8, 22, 22], y: 0.02 }, zone('Central Lawn', 1, [-19, 20, 8, -4])),
)

// The track is four strips under one zone, so it reads as one place.
add(
  s.group(
    'Zone_Jogging_Track',
    [
      s.box('Walk_Track_N', 'track', [-24, -0.07, -10], [24, 0.03, -8]),
      s.box('Walk_Track_S', 'track', [-24, -0.07, 22], [24, 0.03, 24]),
      s.box('Walk_Track_W', 'track', [-24, -0.07, -8], [-22, 0.03, 22]),
      s.box('Walk_Track_E', 'track', [22, -0.07, -8], [24, 0.03, 22]),
    ],
  ).setExtras(zone('Jogging Track', 2, [23, 23, 23, -6])),
)

// Paths from the track out to every amenity.
add(
  s.box('Walk_Path_Plaza', 'path', [-2, -0.07, 24], [2, 0.035, 26]),
  s.box('Walk_Path_Pool', 'path', [8, -0.07, -12], [12, 0.035, -10]),
  s.box('Walk_Path_Kids', 'path', [-18, -0.07, -12], [-14, 0.035, -10]),
  s.box('Walk_Path_Tennis', 'path', [24, -0.07, 5], [28, 0.035, 8]),
  s.box('Walk_Path_Clubhouse', 'path', [-26, -0.07, 12], [-24, 0.035, 16]),
)

// ------------------------------------------------------------------ pool --

const [px0, pz0, px1, pz1] = POOL
add(
  s.slab(
    'Zone_Swimming_Pool',
    'deck',
    { outer: [6, -36, 42, -12], holes: [POOL], y: 0.06 },
    zone('Swimming Pool', 3, [8, -13, 30, -27]),
  ),
  // Coping you can stand on, right at the edge.
  s.box('Walk_Coping_N', 'concrete', [px0 - 0.4, -0.04, pz0 - 0.4], [px1 + 0.4, 0.09, pz0]),
  s.box('Walk_Coping_S', 'concrete', [px0 - 0.4, -0.04, pz1], [px1 + 0.4, 0.09, pz1 + 0.4]),
  s.box('Walk_Coping_W', 'concrete', [px0 - 0.4, -0.04, pz0], [px0, 0.09, pz1]),
  s.box('Walk_Coping_E', 'concrete', [px1, -0.04, pz0], [px1 + 0.4, 0.09, pz1]),
  // Tiled basin and the water over it.
  s.box('Pool_Floor', 'poolTile', [px0, -1.6, pz0], [px1, -1.5, pz1]),
  s.box('Pool_Wall_N', 'poolTile', [px0, -1.5, pz0], [px1, 0.02, pz0 + 0.05]),
  s.box('Pool_Wall_S', 'poolTile', [px0, -1.5, pz1 - 0.05], [px1, 0.02, pz1]),
  s.box('Pool_Wall_W', 'poolTile', [px0, -1.5, pz0], [px0 + 0.05, 0.02, pz1]),
  s.box('Pool_Wall_E', 'poolTile', [px1 - 0.05, -1.5, pz0], [px1, 0.02, pz1]),
  s.box('Water_Pool', 'water', [px0, -0.28, pz0], [px1, -0.24, pz1]),
  // Pool ladder.
  cyl('Pool_Ladder_L', 'chrome', [px1 - 3.2, -1.2, pz1 - 0.1], [px1 - 3.2, 0.9, pz1 + 0.3], 0.025),
  cyl('Pool_Ladder_R', 'chrome', [px1 - 2.6, -1.2, pz1 - 0.1], [px1 - 2.6, 0.9, pz1 + 0.3], 0.025),
)

const lounger = s.prefab('Lounger', () => [
  s.box('Lounger_Frame', 'timber', [-0.35, 0.22, -0.95], [0.35, 0.3, 0.95]),
  s.box('Lounger_Leg_A', 'timber', [-0.33, 0, -0.9], [-0.27, 0.22, -0.84]),
  s.box('Lounger_Leg_B', 'timber', [0.27, 0, -0.9], [0.33, 0.22, -0.84]),
  s.box('Lounger_Leg_C', 'timber', [-0.33, 0, 0.84], [-0.27, 0.22, 0.9]),
  s.box('Lounger_Leg_D', 'timber', [0.27, 0, 0.84], [0.33, 0.22, 0.9]),
  s.box('Lounger_Cushion', 'cushion', [-0.32, 0.3, -0.35], [0.32, 0.38, 0.9]),
  place('Lounger_Back', 'cushion', new THREE.BoxGeometry(0.64, 0.08, 0.75), [0, 0.52, -0.62], [-0.55, 0, 0]),
])

const umbrella = s.prefab('Umbrella', () => [
  cyl('Umbrella_Pole', 'steel', [0, 0, 0], [0, 2.45, 0], 0.03),
  place('Umbrella_Base', 'granite', new THREE.CylinderGeometry(0.28, 0.3, 0.08, 20), [0, 0.04, 0]),
  place('Umbrella_Canopy', 'canvas', new THREE.ConeGeometry(1.5, 0.55, 8, 1, true), [0, 2.5, 0]),
])

for (const [i, x] of [13, 17, 21, 25, 29, 33].entries()) {
  add(lounger([x, 0.06, -33.4], 180))
  if (i % 2 === 0) add(umbrella([x + 2, 0.06, -33.6]))
}
for (const z of [-27, -23, -19]) add(lounger([39.4, 0.06, z], 90))
add(umbrella([39.6, 0.06, -21]))

// ---------------------------------------------------------- kids' play --

add(
  s.slab('Zone_Kids_Play_Area', 'rubber', { outer: [-44, -36, -14, -12], y: 0.05 }, zone("Kids' Play Area", 4, [-15.5, -13.5, -34, -28])),
)

// Slide tower: posts, platform, roof, ladder and the chute.
{
  const cx = -36
  const cz = -28
  const h = 1.5
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    add(cyl('Slide_Post', 'blue', [cx + dx, 0, cz + dz], [cx + dx, 2.7, cz + dz], 0.06))
  }
  add(
    s.box('Slide_Platform', 'timber', [cx - 0.65, h - 0.06, cz - 0.65], [cx + 0.65, h, cz + 0.65]),
    place('Slide_Roof', 'red', new THREE.ConeGeometry(1.1, 0.9, 4), [cx, 3.1, cz], [0, Math.PI / 4, 0]),
    s.box('Slide_Rail_Back', 'yellow', [cx - 0.65, h, cz - 0.66], [cx + 0.65, h + 0.7, cz - 0.6]),
  )
  // Ladder on the -x side.
  add(
    cyl('Slide_Ladder_L', 'yellow', [cx - 1.5, 0, cz - 0.3], [cx - 0.62, h, cz - 0.3], 0.035),
    cyl('Slide_Ladder_R', 'yellow', [cx - 1.5, 0, cz + 0.3], [cx - 0.62, h, cz + 0.3], 0.035),
  )
  for (let step = 1; step <= 4; step += 1) {
    const t = step / 5
    const x = cx - 1.5 + 0.88 * t
    add(cyl('Slide_Rung', 'yellow', [x, h * t, cz - 0.3], [x, h * t, cz + 0.3], 0.025))
  }
  // Chute on the +x side, sloping to the ground.
  const length = 3.4
  const drop = h - 0.2
  const angle = Math.atan2(drop, length)
  add(
    place('Slide_Chute', 'yellow', new THREE.BoxGeometry(length, 0.05, 0.6), [cx + 0.65 + length / 2, 0.2 + drop / 2, cz], [0, 0, -angle]),
    place('Slide_Side_L', 'red', new THREE.BoxGeometry(length, 0.22, 0.04), [cx + 0.65 + length / 2, 0.31 + drop / 2, cz - 0.3], [0, 0, -angle]),
    place('Slide_Side_R', 'red', new THREE.BoxGeometry(length, 0.22, 0.04), [cx + 0.65 + length / 2, 0.31 + drop / 2, cz + 0.3], [0, 0, -angle]),
  )
}

// Swings: an A-frame with two seats on chains.
{
  const cx = -24
  const cz = -30
  const top = 2.4
  for (const x of [cx - 2, cx + 2]) {
    add(
      cyl('Swing_Leg', 'green', [x, 0, cz - 0.9], [x, top, cz], 0.055),
      cyl('Swing_Leg', 'green', [x, 0, cz + 0.9], [x, top, cz], 0.055),
    )
  }
  add(cyl('Swing_Beam', 'green', [cx - 2.05, top, cz], [cx + 2.05, top, cz], 0.06))
  for (const x of [cx - 0.9, cx + 0.9]) {
    add(
      cyl('Swing_Chain', 'steel', [x - 0.22, top, cz], [x - 0.22, 0.5, cz], 0.012, 6),
      cyl('Swing_Chain', 'steel', [x + 0.22, top, cz], [x + 0.22, 0.5, cz], 0.012, 6),
      s.box('Swing_Seat', 'red', [x - 0.25, 0.45, cz - 0.13], [x + 0.25, 0.5, cz + 0.13]),
    )
  }
}

// See-saw.
add(
  s.box('SeeSaw_Pivot', 'blue', [-20.2, 0, -17.2], [-19.8, 0.45, -16.8]),
  place('SeeSaw_Plank', 'yellow', new THREE.BoxGeometry(3.2, 0.06, 0.3), [-20, 0.5, -17], [0, 0, 0.14]),
  cyl('SeeSaw_Handle_A', 'red', [-21.2, 0.4, -17.12], [-21.2, 0.72, -17.12], 0.025),
  cyl('SeeSaw_Handle_B', 'red', [-18.8, 0.72, -17.12], [-18.8, 1.05, -17.12], 0.025),
)

// Climbing arches: four half-hoops crossing into a dome.
for (let i = 0; i < 4; i += 1) {
  add(
    place(
      'Climbing_Arch',
      i % 2 ? 'blue' : 'green',
      new THREE.TorusGeometry(1.6, 0.045, 8, 40, Math.PI),
      [-36, 0, -18],
      [0, (i * Math.PI) / 4, 0],
    ),
  )
}

// Sandpit with a timber border.
add(
  s.box('Sandpit_Border_N', 'timber', [-30, 0, -21], [-26, 0.28, -20.8]),
  s.box('Sandpit_Border_S', 'timber', [-30, 0, -17.2], [-26, 0.28, -17]),
  s.box('Sandpit_Border_W', 'timber', [-30, 0, -21], [-29.8, 0.28, -17]),
  s.box('Sandpit_Border_E', 'timber', [-26.2, 0, -21], [-26, 0.28, -17]),
  s.box('Sandpit_Sand', 'sand', [-29.8, 0, -20.8], [-26.2, 0.2, -17.2]),
)

// -------------------------------------------------------------- tennis --

add(
  s.slab('Zone_Tennis_Court', 'courtClay', { outer: [28, -8, 46, 22], y: 0.04 }, zone('Tennis Court', 5, [29.5, 20.5, 37, 0])),
  s.box('Court_Surface', 'courtGreen', [31.5, 0.04, -4.9], [42.47, 0.046, 18.87]),
)
{
  const L = (name, a, b) => add(s.box(`Court_Line_${name}`, 'line', [a[0], 0.046, a[1]], [b[0], 0.048, b[1]]))
  L('Base_N', [31.5, -4.9], [42.47, -4.85])
  L('Base_S', [31.5, 18.82], [42.47, 18.87])
  L('Side_W', [31.5, -4.9], [31.55, 18.87])
  L('Side_E', [42.42, -4.9], [42.47, 18.87])
  L('Single_W', [32.87, -4.9], [32.92, 18.87])
  L('Single_E', [41.05, -4.9], [41.1, 18.87])
  L('Service_N', [32.87, 1.37], [41.1, 1.42])
  L('Service_S', [32.87, 12.55], [41.1, 12.6])
  L('Centre', [36.96, 1.37], [37.01, 12.6])
  add(
    cyl('Net_Post_W', 'postGreen', [30.6, 0, 6.99], [30.6, 1.07, 6.99], 0.04),
    cyl('Net_Post_E', 'postGreen', [43.4, 0, 6.99], [43.4, 1.07, 6.99], 0.04),
    s.box('Net', 'net', [30.6, 0.05, 6.97], [43.4, 0.92, 7.01]),
    s.box('Net_Tape', 'line', [30.6, 0.9, 6.96], [43.4, 0.95, 7.02]),
  )
  // Chain-link fence, with a gate on the west side where the path arrives.
  const fence = (name, a, b) => {
    add(s.box(`Fence_${name}`, 'fence', [Math.min(a[0], b[0]) - 0.02, 0, Math.min(a[1], b[1]) - 0.02], [Math.max(a[0], b[0]) + 0.02, 3.2, Math.max(a[1], b[1]) + 0.02]))
  }
  fence('N', [28, -8], [46, -8])
  fence('S', [28, 22], [46, 22])
  fence('E', [46, -8], [46, 22])
  fence('W_Lower', [28, -8], [28, 5])
  fence('W_Upper', [28, 8], [28, 22])
  for (let x = 28; x <= 46; x += 3) {
    add(cyl('Fence_Post', 'postGreen', [x, 0, -8], [x, 3.2, -8], 0.04), cyl('Fence_Post', 'postGreen', [x, 0, 22], [x, 3.2, 22], 0.04))
  }
  for (let z = -8; z <= 22; z += 3) {
    add(cyl('Fence_Post', 'postGreen', [46, 0, z], [46, 3.2, z], 0.04))
    if (z < 5 || z > 8) add(cyl('Fence_Post', 'postGreen', [28, 0, z], [28, 3.2, z], 0.04))
  }
}

// ----------------------------------------------------------- clubhouse --

add(
  s.slab('Zone_Clubhouse', 'sandstone', { outer: [-46, 10, -26, 24], y: 0.04 }, zone('Clubhouse', 6, [-27, 22, -37, 6])),
  s.slab('Zone_Clubhouse_Lounge', 'marble', { outer: [-45.8, -7.8, -28.2, 9.8], y: 0.08 }, zone('Clubhouse Lounge', 7, [-30, 8, -42, -4])),
  s.box('Ceiling_Clubhouse', 'ceiling', [-45.8, 4.0, -7.8], [-28.2, 4.1, 9.8]),
)
{
  const rotY = (degrees) => new THREE.Matrix4().makeRotationY((degrees * Math.PI) / 180)
  const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z)
  const H = 4.1
  // South face: glazed, with the entrance.
  add(
    s.wall('Clubhouse_Wall_S', 'render', { length: 18, height: H, thickness: 0.25, openings: [
      { x: 0.8, y: 0.3, w: 6.0, h: 3.4 },
      { x: 7.6, y: 0, w: 2.8, h: 3.2 },
      { x: 11.2, y: 0.3, w: 6.0, h: 3.4 },
    ] }, at(-46, 0, 10)),
    s.box('Clubhouse_Glass_SW', 'glass', [-45.2, 0.3, 9.99], [-39.2, 3.7, 10.01]),
    s.box('Clubhouse_Glass_SE', 'glass', [-34.8, 0.3, 9.99], [-28.8, 3.7, 10.01]),
    s.wall('Clubhouse_Wall_N', 'render', { length: 18, height: H, thickness: 0.25, openings: [
      { x: 2, y: 1.2, w: 14, h: 1.6 },
    ] }, at(-46, 0, -8)),
    s.box('Clubhouse_Glass_N', 'glass', [-44, 1.2, -8.01], [-30, 2.8, -7.99]),
    s.wall('Clubhouse_Wall_W', 'render', { length: 18, height: H, thickness: 0.25 }, at(-46, 0, -8).multiply(rotY(-90))),
    s.wall('Clubhouse_Wall_E', 'render', { length: 18, height: H, thickness: 0.25 }, at(-28, 0, -8).multiply(rotY(-90))),
    s.box('Clubhouse_Roof', 'granite', [-47.2, H, -9.2], [-26.8, H + 0.35, 12.4]),
    s.box('Clubhouse_Reception', 'walnut', [-44.6, 0.08, 3.6], [-43.8, 1.1, 7.8]),
  )
}

// ------------------------------------------------------ furniture & trees --

const models = []
const F = async (id, options) => models.push(await s.model(id, options))

// Clubhouse lounge.
await F('sofa_02', { position: [-37, 0.08, -3.2] })
await F('sofa_02', { position: [-37, 0.08, 1.4], rotation: 180 })
await F('modern_coffee_table_01', { position: [-37, 0.08, -0.9] })
await F('potted_plant_02', { position: [-29, 0.08, 9], simplifyRatio: 0.25 })
await F('potted_plant_02', { position: [-45, 0.08, -7], simplifyRatio: 0.25 })

// Plaza.
await F('planter_box_02', { position: [-5, 0.04, 27.2], simplifyRatio: 0.5 })
await F('planter_box_02', { position: [5, 0.04, 27.2], simplifyRatio: 0.5 })

// Pool deck.
await F('outdoor_table_chair_set_01', { position: [8, 0.06, -20] })
await F('outdoor_table_chair_set_01', { position: [8, 0.06, -26] })

// Parents watch from benches at the play area.
await F('painted_wooden_bench', { position: [-16.5, 0.05, -24], rotation: -90 })
await F('painted_wooden_bench', { position: [-16.5, 0.05, -30], rotation: -90 })
await F('painted_wooden_bench', { position: [-40, 0.05, -13.4], rotation: 180 })

// Lawn seating and picnic tables.
await F('modular_street_seating', { position: [-14, 0.02, 20.6], rotation: 180, simplifyRatio: 0.4 })
await F('modular_street_seating', { position: [14, 0.02, 20.6], rotation: 180, simplifyRatio: 0.4 })
await F('wooden_picnic_table', { position: [-10, 0.02, 4] })
await F('wooden_picnic_table', { position: [10, 0.02, 4], rotation: 90 })

// Hero trees are procedural jacarandas (below). Poly Haven's jacaranda is
// ~300k triangles of disconnected leaf cards that no simplifier can merge;
// four of them, drawn again for shadows, would sink the frame rate.

// Hedges along the plaza and behind the pool deck.
for (const [x, z, r] of [[-11, 27, 0], [11, 27, 0], [14, -37.5, 0], [24, -37.5, 0], [34, -37.5, 0]]) {
  await F('shrub_02', { position: [x, 0.02, z], rotation: r, scale: 0.8, simplifyRatio: 0.25 })
}

// Street lamps along the track and paths; each lamp head is a night light.
const lampSpots = [[-24.8, -10.8], [24.8, -10.8], [-24.8, 24.8], [24.8, 24.8], [-24.8, 7], [24.8, 7], [-8, 25], [8, 25], [7, -12.8], [-19, -12.8]]
for (const [x, z] of lampSpots) await F('street_lamp_01', { position: [x, 0.02, z], simplifyRatio: 0.4 })

// Stylised garden trees around the edges: one prefab, placed many times.
const tree = s.prefab('Garden_Tree', () => [
  cyl('Tree_Trunk', 'bark', [0, 0, 0], [0, 2.8, 0], 0.16, 8),
  place('Tree_Canopy_A', 'foliage', new THREE.IcosahedronGeometry(1.7, 1), [0, 3.7, 0]),
  place('Tree_Canopy_B', 'foliage', new THREE.IcosahedronGeometry(1.2, 1), [0.7, 4.5, 0.3]),
  place('Tree_Canopy_C', 'foliage', new THREE.IcosahedronGeometry(1.1, 1), [-0.6, 4.2, -0.4]),
])
// Flowering jacaranda: a leaning trunk, three limbs and a wide, flat canopy in
// the violet Gurugram's avenues turn every April.
M('jacaranda', { color: [0.56, 0.46, 0.74], roughness: 0.85 })
const jacaranda = s.prefab('Jacaranda', () => [
  cyl('Jacaranda_Trunk', 'bark', [0, 0, 0], [0.3, 3.2, 0.1], 0.24, 10),
  cyl('Jacaranda_Limb_A', 'bark', [0.3, 3.0, 0.1], [2.2, 4.6, 0.6], 0.12, 8),
  cyl('Jacaranda_Limb_B', 'bark', [0.3, 3.0, 0.1], [-1.6, 4.4, -1.2], 0.12, 8),
  cyl('Jacaranda_Limb_C', 'bark', [0.3, 3.0, 0.1], [0.4, 4.9, 2.0], 0.11, 8),
  place('Jacaranda_Crown_A', 'jacaranda', new THREE.IcosahedronGeometry(2.4, 1), [0.3, 5.2, 0.2], [0, 0, 0], [1.35, 0.55, 1.25]),
  place('Jacaranda_Crown_B', 'jacaranda', new THREE.IcosahedronGeometry(1.8, 1), [2.4, 5.0, 0.8], [0, 0.6, 0], [1.2, 0.6, 1.1]),
  place('Jacaranda_Crown_C', 'jacaranda', new THREE.IcosahedronGeometry(1.7, 1), [-1.8, 4.9, -1.2], [0, 1.1, 0], [1.2, 0.6, 1.2]),
  place('Jacaranda_Crown_D', 'foliage', new THREE.IcosahedronGeometry(1.5, 1), [0.5, 4.5, 2.1], [0, 0.3, 0], [1.1, 0.55, 1.1]),
])
for (const [x, z, r, k] of [[-18, -24, 20, 1.05], [-18, 16, 140, 0.95], [44, -34, 260, 1], [18, 30, 80, 0.9], [-6, -3, 200, 0.85]]) {
  add(jacaranda([x, 0.02, z], r, k))
}

const treeSpots = []
for (let x = -44; x <= 44; x += 8) treeSpots.push([x, -38.2])
for (let z = -30; z <= 30; z += 8) {
  // The clubhouse and its terrace fill the west edge from z −10 to 24.
  if (z < -12 || z > 26) treeSpots.push([-46.4, z])
  treeSpots.push([46.4, z])
}
for (const x of [-40, -32, 26, 34, 42]) treeSpots.push([x, 30])
treeSpots.forEach(([x, z], i) => add(tree([x, 0, z], (i * 47) % 360, 0.85 + (i % 3) * 0.12)))

// --------------------------------------------------------------- lights --

const lights = [
  ...lampSpots.map(([x, z], i) => s.empty(`Light_Lamp_${i + 1}`, [x, 3.6, z], { intensity: 26, color: '#ffd29a', distance: 16 })),
  s.empty('Light_Pool_A', [18, -0.9, -24], { intensity: 30, color: '#7fd4ff', distance: 12 }),
  s.empty('Light_Pool_B', [30, -0.9, -24], { intensity: 30, color: '#7fd4ff', distance: 12 }),
  s.empty('Light_Clubhouse', [-37, 3.6, 1], { intensity: 40, color: '#ffe0b3', distance: 18 }),
  s.empty('Light_Gatehouse', [18.5, 2.1, 31.5], { intensity: 14, color: '#ffe0b3', distance: 8 }),
]

s.add(
  s.group('Grounds', nodes),
  s.group('Furniture', models),
  s.group('Lights', lights),
  // Walk in through the gate, the fountain ahead and the gardens beyond.
  s.empty('Spawn', [0, 0.04, 36.6], { yaw: yawTo(0, 36.6, 0, 20) }),
)

mkdirSync(dirname(OUT), { recursive: true })
const { out, stats } = await s.write(OUT)
console.log(
  `wrote ${out}\n  ${(statSync(out).size / 1048576).toFixed(2)} MB · ${stats.meshes} meshes · ` +
    `${Object.values(stats.models).reduce((a, b) => a + b, 0)} Poly Haven placements from ${Object.keys(stats.models).length} models`,
)
