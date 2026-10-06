/**
 * Writes public/demo/skyline.glb — "Skyline Heights", a 35-floor tower from
 * a 3ds Max export (Downloads/Exterior: Building.glb + window textures),
 * finished and set in a street block of its own.
 *
 *   node scripts/build-skyline.mjs [path/to/Exterior]
 *
 * What the export arrived with, and what this does about it:
 * - 16 materials, all black "fallback Material" — every part gets a real
 *   material by what it is (identified by rendering each part on its own):
 *   dark cladding, champagne fins, bronze mullions, tinted glass, travertine
 *   podium, concrete slabs, louvres.
 * - No UVs at all, so the ten window_color_*.jpg interiors had nowhere to go —
 *   each window-backdrop panel now gets UVs spanning just that panel, and the
 *   ten sets get the ten images: rooms behind the glass, lit at night.
 * - One mesh per material running the full height — so the tower is cut into
 *   floors at its slab levels (measured from the slabs: a 9.1 m podium roof,
 *   five 4.18 m lower floors, then 3.826 m floors to 144.8 m, crown above).
 *   Each floor is `Tower_Skyline_Floor_NN`, so the viewer can pick it.
 *
 * Around it: two streets with footpaths and street trees, an entrance
 * forecourt with a drop-off loop round a fountain garden, side lawns, lamps
 * and benches, and neighbouring blocks for scale.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

import { createScene } from './lib/scene.mjs'

const SOURCE = resolve(process.argv[2] ?? '.cache/exterior')
const OUT = 'public/demo/skyline.glb'
const NAME = 'Tower_Skyline'

const s = await createScene('Skyline Heights')
const { THREE } = s
const M = s.materials.define
const V = (x, y, z) => new THREE.Vector3(x, y, z)

// -------------------------------------------------------------- materials --

const windowImages = Array.from({ length: 10 }, (_, i) =>
  readFileSync(join(SOURCE, `AM181_004_window_color_${String(i + 1).padStart(3, '0')}.jpg`)),
)
windowImages.forEach((image, i) =>
  M(`interior_${i + 1}`, { image, imageType: 'image/jpeg', glow: [0.5, 0.45, 0.36], roughness: 0.9 }),
)
// Colours matched to the model's own preview render (Evermotion AM181_004):
// white cladding and fins, pale blue-grey glass that mirrors the sky, light
// frames, a charcoal podium. The export itself carried no materials.
M('glass', {
  color: [0.62, 0.72, 0.8],
  opacity: 0.62,
  roughness: 0.02,
  metallic: 0.55,
  normalImage: readFileSync(join(SOURCE, 'AM181_004_Glass_NM.jpg')),
  normalScale: 0.2,
  tile: 3,
})
M('cladding', { color: [0.93, 0.93, 0.92], roughness: 0.55 })
M('fins', { color: [0.95, 0.95, 0.94], roughness: 0.45 })
M('mullion', { color: [0.78, 0.79, 0.8], roughness: 0.4, metallic: 0.5 })
M('blinds', { color: [0.94, 0.93, 0.9], roughness: 0.85 })
M('louvre', { color: [0.7, 0.71, 0.72], roughness: 0.5, metallic: 0.4 })
M('slab', { color: [0.9, 0.9, 0.89], roughness: 0.8 })
M('travertine', { color: [0.3, 0.31, 0.33], roughness: 0.6, metallic: 0.2 })

// Site.
M('asphalt', { texture: 'asphalt_02', tile: 4 })
M('paving', { texture: 'hexagonal_concrete_paving', tile: 2.2 })
M('footpath', { texture: 'patio_tiles', tile: 1.8 })
M('kerb', { color: [0.72, 0.72, 0.7], roughness: 0.8 })
M('marking', { color: [0.95, 0.95, 0.92], roughness: 0.6 })
M('grass', { texture: 'leafy_grass', maps: ['nor_gl'], tile: 3, color: [0.3, 0.48, 0.2], roughness: 0.95, normalScale: 0.8 })
M('water', { color: [0.24, 0.6, 0.72], opacity: 0.62, roughness: 0.03, metallic: 0.1 })
M('granite', { color: [0.16, 0.16, 0.17], roughness: 0.35 })
M('poolTile', { texture: 'blue_floor_tiles_01', tile: 1.2 })
M('foliage', { color: [0.25, 0.41, 0.21], roughness: 0.9 })
M('bark', { color: [0.3, 0.23, 0.17], roughness: 0.9 })

/** Neighbouring blocks: concrete with a glazed band per storey, as a PNG. */
async function bandPattern(size = 256) {
  const data = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const band = y % 64 < 26 // spandrel
      const mullion = x % 32 < 3
      const [r, g, b] = band ? [236, 235, 232] : mullion ? [214, 214, 212] : [196, 204, 210]
      const i = (y * size + x) * 3
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer()
}
// One repeat of the pattern is four storeys: 14 m.
M('context', { image: await bandPattern(), tile: 14, roughness: 0.7 })

// ------------------------------------------------------ reading the tower --

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const source = await io.read(join(SOURCE, 'Building.glb'))
const sourceScene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0]

// Part → material, by mesh and primitive index (see the header).
const KIND = {
  AM181_004_001: ['mullion', 'mullion'],
  Obj_AM181_004_002: Array.from({ length: 10 }, (_, i) => `interior_${i + 1}`),
  AM181_004_003: ['blinds'],
  Obj_AM181_004_004: ['fins', 'glass', 'fins', 'louvre'],
  Obj_AM181_004_005: ['slab', 'cladding', 'travertine'],
}

// Floor levels, measured from the slab mesh.
const PODIUM_ROOF = 9.1
const LEVELS = [
  ...Array.from({ length: 5 }, (_, i) => PODIUM_ROOF + i * ((30 - PODIUM_ROOF) / 5)),
  ...Array.from({ length: 31 }, (_, i) => 30 + i * 3.826),
]
const CROWN = LEVELS.at(-1) // 144.8 m: plant floors and crown above
const FLOORS = LEVELS.length - 1

/** Which group a triangle belongs to: 'podium', 'crown', 'frame' or a floor. */
function bucketOf(minY, maxY) {
  const mid = (minY + maxY) / 2
  if (mid < PODIUM_ROOF) return maxY - minY > PODIUM_ROOF + 2 ? 'frame' : 'podium'
  if (mid >= CROWN) return 'crown'
  let floor = LEVELS.findIndex((level, i) => mid >= level && mid < LEVELS[i + 1]) + 1
  const height = LEVELS[floor] - LEVELS[floor - 1]
  // Members spanning several storeys (fins, full-height cladding strips)
  // belong to no single floor.
  if (maxY - minY > height * 1.25) return 'frame'
  return floor
}

/** Planar UVs in metres, projected along the triangle's dominant axis. */
function planarUV(p, n) {
  const ax = Math.abs(n.x)
  const ay = Math.abs(n.y)
  const az = Math.abs(n.z)
  if (ay >= ax && ay >= az) return [p.x, p.z]
  if (ax >= az) return [p.z, p.y]
  return [p.x, p.y]
}

/**
 * UVs for window backdrops: each connected panel gets the whole image,
 * horizontal along its face and vertical up it.
 */
function panelUVs(positions) {
  const triCount = positions.length / 9
  const key = (i) =>
    `${Math.round(positions[i * 3] * 200)},${Math.round(positions[i * 3 + 1] * 200)},${Math.round(positions[i * 3 + 2] * 200)}`
  const parent = Array.from({ length: triCount }, (_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const owner = new Map()
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const id = key(t * 3 + k)
      if (owner.has(id)) parent[find(t)] = find(owner.get(id))
      else owner.set(id, t)
    }
  }
  const groups = new Map()
  for (let t = 0; t < triCount; t++) {
    const root = find(t)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(t)
  }

  const uvs = new Float32Array(triCount * 6)
  const a = V(0, 0, 0)
  const b = V(0, 0, 0)
  const c = V(0, 0, 0)
  for (const tris of groups.values()) {
    // The panel's facing: its largest triangle's normal, flattened.
    const normal = V(0, 0, 0)
    for (const t of tris) {
      a.fromArray(positions, t * 9)
      b.fromArray(positions, t * 9 + 3)
      c.fromArray(positions, t * 9 + 6)
      normal.add(b.clone().sub(a).cross(c.clone().sub(a)))
    }
    normal.y = 0
    if (normal.lengthSq() < 1e-9) normal.set(0, 0, 1)
    normal.normalize()
    const across = V(0, 1, 0).cross(normal).normalize()

    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        a.fromArray(positions, (t * 3 + k) * 3)
        const u = a.dot(across)
        minU = Math.min(minU, u)
        maxU = Math.max(maxU, u)
        minV = Math.min(minV, a.y)
        maxV = Math.max(maxV, a.y)
      }
    }
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        a.fromArray(positions, (t * 3 + k) * 3)
        uvs[(t * 3 + k) * 2] = (a.dot(across) - minU) / (maxU - minU || 1)
        uvs[(t * 3 + k) * 2 + 1] = (a.y - minV) / (maxV - minV || 1)
      }
    }
  }
  return uvs
}

// Collect triangles into (bucket, material) batches, in world space.
const batches = new Map()
function batch(bucket, kind) {
  const id = `${bucket}|${kind}`
  if (!batches.has(id)) batches.set(id, { bucket, kind, positions: [], normals: [], uvs: [] })
  return batches.get(id)
}

let sourceTris = 0
sourceScene.traverse((node) => {
  const mesh = node.getMesh()
  if (!mesh) return
  const kinds = KIND[mesh.getName()]
  if (!kinds) throw new Error(`unexpected mesh ${mesh.getName()} — update KIND`)
  const world = new THREE.Matrix4().fromArray(node.getWorldMatrix())

  mesh.listPrimitives().forEach((prim, index) => {
    const kind = kinds[index]
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(prim.getAttribute('POSITION').getArray().slice(), 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(prim.getAttribute('NORMAL').getArray().slice(), 3))
    geo.setIndex(new THREE.BufferAttribute(prim.getIndices().getArray().slice(), 1))
    geo.applyMatrix4(world)
    const flat = geo.toNonIndexed()
    const pos = flat.attributes.position.array
    const nor = flat.attributes.normal.array
    const panel = kind.startsWith('interior_') ? panelUVs(pos) : null
    const tris = pos.length / 9
    sourceTris += tris

    const p = V(0, 0, 0)
    const faceNormal = V(0, 0, 0)
    for (let t = 0; t < tris; t++) {
      const ys = [pos[t * 9 + 1], pos[t * 9 + 4], pos[t * 9 + 7]]
      const bucket = bucketOf(Math.min(...ys), Math.max(...ys))
      const out = batch(bucket, kind)
      faceNormal.set(nor[t * 9], nor[t * 9 + 1], nor[t * 9 + 2])
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k
        p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
        out.positions.push(p.x, p.y, p.z)
        out.normals.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2])
        if (panel) out.uvs.push(panel[i * 2], panel[i * 2 + 1])
        else out.uvs.push(...planarUV(p, faceNormal))
      }
    }
  })
})

// ---------------------------------------------------------- the tower --

const TILE = { glass: 3, travertine: 2.5 }
function meshFor(name, { kind, positions, normals, uvs }) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  const scale = kind.startsWith('interior_') ? 1 : 1 / (TILE[kind] ?? 1)
  return s.geometry(`${name}_${kind}`, kind, geo, new THREE.Matrix4(), { uvScale: [scale, scale] })
}

const groups = new Map()
for (const b of batches.values()) {
  const key = String(b.bucket)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(b)
}

const towerChildren = []
for (const special of ['podium', 'frame', 'crown']) {
  const parts = groups.get(special) ?? []
  const name = `${NAME}_${special[0].toUpperCase()}${special.slice(1)}`
  towerChildren.push(s.group(name, parts.map((b) => meshFor(name, b))))
}
for (let floor = 1; floor <= FLOORS; floor++) {
  const nn = String(floor).padStart(2, '0')
  const name = `${NAME}_Floor_${nn}`
  const parts = groups.get(String(floor)) ?? []
  towerChildren.push(s.group(name, parts.map((b) => meshFor(name, b))))
}
const tower = s.group(NAME, towerChildren)

// ----------------------------------------------------------- the site --

/** Any three.js geometry, placed by position / Euler rotation / scale. */
function place(name, mat, geo, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    V(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    V(...scale),
  )
  return s.geometry(name, mat, geo, m)
}
function cyl(name, mat, a, b, radius, segments = 10) {
  const A = V(...a)
  const B = V(...b)
  const geo = new THREE.CylinderGeometry(radius, radius, A.distanceTo(B), segments)
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), B.clone().sub(A).normalize())
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, V(1, 1, 1))
  return s.geometry(name, mat, geo, m)
}

const site = []
const add = (...items) => site.push(...items.flat())

// Plot: x −46…46, z −50…56; the entrance faces +z onto the main road.
const FOUNTAIN = { x: 0, z: 44, r: 7 }
const DRIVE = [[-26, 36, 26, 41]] // drop-off lane along the podium front

// Streets: a main road along the front, a side road along +x.
add(
  s.slab('Road_Main', 'asphalt', { outer: [-110, 63, 110, 77], y: 0 }),
  s.slab('Road_Side', 'asphalt', { outer: [53, -110, 67, 63], y: 0 }),
  s.slab('Road_Junction', 'asphalt', { outer: [53, 77, 67, 110], y: 0 }),
)
for (let x = -106; x < 106; x += 6) add(s.box(`Lane_Main_${x}`, 'marking', [x, 0.005, 69.9], [x + 3, 0.012, 70.1]))
for (let z = -106; z < 60; z += 6) add(s.box(`Lane_Side_${z}`, 'marking', [59.9, 0.005, z], [60.1, 0.012, z + 3]))
// Zebra crossing at the entrance.
for (let x = -4; x < 4; x += 1) add(s.box(`Zebra_${x}`, 'marking', [x, 0.005, 64], [x + 0.55, 0.012, 76]))

// Footpaths with kerbs, raised 15 cm.
add(
  s.slab('Walk_Footpath_Front', 'footpath', { outer: [-110, 56, 53, 63], y: 0.15, thickness: 0.15 }),
  s.slab('Walk_Footpath_Side', 'footpath', { outer: [46, -110, 53, 56], y: 0.15, thickness: 0.15 }),
  s.slab('Walk_Footpath_Far', 'footpath', { outer: [-110, 77, 53, 84], y: 0.15, thickness: 0.15 }),
)

// Forecourt paving round the fountain garden, with the drop-off lane and the
// two driveways cut out as asphalt.
add(
  s.slab('Forecourt', 'paving', {
    outer: [-46, 32, 46, 56],
    holes: [...DRIVE, [-26, 41, -20, 56], [20, 41, 26, 56]],
    circles: [FOUNTAIN],
    y: 0.15,
    thickness: 0.15,
  }),
  s.slab('Driveway_Loop', 'asphalt', { outer: DRIVE[0], y: 0.1, thickness: 0.1 }),
  s.slab('Driveway_In', 'asphalt', { outer: [-26, 41, -20, 63], y: 0.1, thickness: 0.1 }),
  s.slab('Driveway_Out', 'asphalt', { outer: [20, 41, 26, 63], y: 0.1, thickness: 0.1 }),
)
// Fountain garden: a lawn ring, a granite basin and water.
add(
  place('Fountain_Lawn', 'grass', new THREE.CylinderGeometry(FOUNTAIN.r, FOUNTAIN.r, 0.3, 48), [FOUNTAIN.x, 0.15, FOUNTAIN.z]),
  place('Fountain_Basin', 'granite', new THREE.CylinderGeometry(3.4, 3.5, 0.6, 48), [FOUNTAIN.x, 0.6, FOUNTAIN.z]),
  place('Water_Fountain', 'water', new THREE.CylinderGeometry(3.1, 3.1, 0.04, 48), [FOUNTAIN.x, 0.86, FOUNTAIN.z]),
  place('Fountain_Jet', 'granite', new THREE.CylinderGeometry(0.25, 0.35, 1.6, 20), [FOUNTAIN.x, 1.4, FOUNTAIN.z]),
)

// Lawns wrapping the podium on three sides.
add(
  s.slab('Lawn_West', 'grass', { outer: [-46, -50, -30.5, 32], y: 0.12, thickness: 0.12 }),
  s.slab('Lawn_East', 'grass', { outer: [30.5, -50, 46, 32], y: 0.12, thickness: 0.12 }),
  s.slab('Lawn_North', 'grass', { outer: [-30.5, -50, 30.5, -33], y: 0.12, thickness: 0.12 }),
  s.slab('Podium_Apron', 'paving', { outer: [-30.5, -33, 30.5, 32], y: 0.13, thickness: 0.13 }),
)
// Plot boundary: a low granite plinth with a gap for each driveway.
for (const [x0, x1] of [[-46, -26], [-20, 20], [26, 46]]) {
  add(s.box(`Boundary_Front_${x0}`, 'granite', [x0, 0, 55.6], [x1, 0.6, 56]))
}
add(
  s.box('Boundary_West', 'granite', [-46.4, 0, -50], [-46, 0.6, 56]),
  s.box('Boundary_East', 'granite', [46, 0, -50], [46.4, 0.6, 56]),
  s.box('Boundary_North', 'granite', [-46.4, 0, -50.4], [46.4, 0.6, -50]),
)

// Trees.
const tree = s.prefab('Garden_Tree', () => [
  cyl('Tree_Trunk', 'bark', [0, 0, 0], [0, 2.8, 0], 0.16, 8),
  place('Tree_Canopy_A', 'foliage', new THREE.IcosahedronGeometry(1.7, 1), [0, 3.7, 0]),
  place('Tree_Canopy_B', 'foliage', new THREE.IcosahedronGeometry(1.2, 1), [0.7, 4.5, 0.3]),
  place('Tree_Canopy_C', 'foliage', new THREE.IcosahedronGeometry(1.1, 1), [-0.6, 4.2, -0.4]),
])
let t = 0
const plant = (x, z, y = 0.15) => add(tree([x, y, z], (t * 53) % 360, 0.9 + ((t++ % 3) * 0.12)))
for (let x = -104; x <= 50; x += 10) if (Math.abs(x) > 8) plant(x, 59.5) // street trees, front
for (let z = -104; z <= 50; z += 10) plant(49.5, z) // street trees, side
for (let z = -44; z <= 26; z += 10) {
  plant(-40, z, 0.12)
  plant(40, z, 0.12)
}
for (let x = -24; x <= 24; x += 12) plant(x, -44, 0.12)
for (const x of [-36, -30, 30, 36]) plant(x, 48)

// Lamps along the footpath and forecourt; benches on the lawns.
const furniture = []
const F = async (id, options) => furniture.push(await s.model(id, options))
for (let x = -100; x <= 45; x += 20) if (Math.abs(x) > 8) await F('street_lamp_01', { position: [x, 0.15, 61.8], simplifyRatio: 0.4 })
for (const x of [-16, -8, 8, 16]) await F('street_lamp_01', { position: [x, 0.15, 50], simplifyRatio: 0.4 })
for (const z of [-30, -10, 10]) {
  await F('painted_wooden_bench', { position: [-34, 0.12, z], rotation: 90 })
  await F('painted_wooden_bench', { position: [34, 0.12, z], rotation: -90 })
}
for (const x of [-12, 12]) await F('modular_street_seating', { position: [x, 0.15, 53], rotation: 180, simplifyRatio: 0.4 })
for (const x of [-40, -34, 34, 40]) await F('planter_box_02', { position: [x, 0.15, 36], simplifyRatio: 0.5 })

// Neighbouring blocks across both roads — massing only, for scale.
// Mid-rise, so the tower stays the landmark and the site stays visible.
const blocks = [
  [-100, -100, -62, -66, 28], [-50, -100, -12, -66, 21], [0, -100, 40, -66, 35],
  [75, -100, 105, -62, 42], [75, -42, 105, -2, 24], [75, 14, 105, 54, 31],
  [-100, 90, -62, 108, 18], [-42, 90, -4, 108, 25], [10, 90, 45, 108, 21], [75, 90, 105, 108, 14],
  [-100, -44, -62, -4, 28], [-100, 10, -62, 50, 21],
]
blocks.forEach(([x0, z0, x1, z1, h], i) => add(s.box(`Context_Block_${i + 1}`, 'context', [x0, 0, z0], [x1, h, z1])))

// Podium roof garden: lawn round the tower, a lap pool on the entrance side.
const TOWER = [-18.4, -27.4, 27.5, 11.7] // tower footprint at the podium roof
const ROOF = PODIUM_ROOF + 0.18
const POOL = [-8, 16, 14, 27]
add(
  s.slab('Podium_Roof_Garden', 'grass', {
    outer: [-28.8, -31.2, 28.8, 31.2],
    holes: [TOWER, [POOL[0] - 1.5, POOL[1] - 1.5, POOL[2] + 1.5, POOL[3] + 1.5]],
    y: ROOF,
    thickness: 0.08,
  }),
  s.slab('Podium_Pool_Deck', 'paving', {
    outer: [POOL[0] - 1.5, POOL[1] - 1.5, POOL[2] + 1.5, POOL[3] + 1.5],
    y: ROOF,
    thickness: 0.08,
  }),
  // A raised pool: the podium slab is solid, so the basin sits on it.
  s.box('Podium_Pool_Tiles', 'poolTile', [POOL[0], ROOF, POOL[1]], [POOL[2], ROOF + 0.4, POOL[3]]),
  s.box('Water_Podium_Pool', 'water', [POOL[0], ROOF + 0.4, POOL[1]], [POOL[2], ROOF + 0.46, POOL[3]]),
  s.box('Podium_Pool_Coping_S', 'granite', [POOL[0] - 0.3, ROOF, POOL[3]], [POOL[2] + 0.3, ROOF + 0.55, POOL[3] + 0.3]),
  s.box('Podium_Pool_Coping_N', 'granite', [POOL[0] - 0.3, ROOF, POOL[1] - 0.3], [POOL[2] + 0.3, ROOF + 0.55, POOL[1]]),
  s.box('Podium_Pool_Coping_W', 'granite', [POOL[0] - 0.3, ROOF, POOL[1]], [POOL[0], ROOF + 0.55, POOL[3]]),
  s.box('Podium_Pool_Coping_E', 'granite', [POOL[2], ROOF, POOL[1]], [POOL[2] + 0.3, ROOF + 0.55, POOL[3]]),
)
for (const [x, z] of [[-24, 20], [-24, 6], [-24, -8], [-24, -22], [22, 20], [22, 28], [-2, -30]]) plant(x, z, ROOF)

// Ground beyond everything.
add(s.slab('Ground_City', 'kerb', { outer: [-115, -115, 115, 115], y: -0.12, thickness: 0.1 }))

// ------------------------------------------------------------- write --

s.add(tower, s.group('Site', site), s.group('Street_Furniture', furniture))
const { out, stats } = await s.write(OUT, { instancing: true })
console.log(`wrote ${out}`)
console.log(
  `  ${(statSync(out).size / 1048576).toFixed(2)} MB · tower ${sourceTris.toLocaleString()} triangles in ` +
    `${FLOORS} floors + podium/frame/crown · ${stats.meshes} meshes`,
)
