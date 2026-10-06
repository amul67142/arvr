/**
 * Turns a raw interior GLB exported from 3ds Max into a walkthrough.
 *
 *   node scripts/prepare-interior.mjs <input.glb> <output.glb> [label]
 *
 * The export this was written for (a furnished master bedroom) arrived with:
 * - every object unnamed, so the walkthrough found no floor and no start point
 *   and the camera never entered the room;
 * - one grey default material — 3ds Max's glTF exporter drops V-Ray/Corona
 *   materials;
 * - a 25 × 25 m ground plane around a closed box, so from outside it read as
 *   a grey block;
 * - 3.2 M triangles, most of them in the bed linen, pillows and sofa.
 *
 * So this script sorts meshes by what their size and position say they are,
 * names them by the walkthrough contract, gives each class a real material,
 * and simplifies the heaviest meshes. Classification is geometric — it knows
 * "a flat mesh on the floor", not "the Eames chair" — so it suits interiors
 * shaped like this one; check the result and adjust the rules if not.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, simplifyPrimitive, textureCompress, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const [input, output, label = 'Master Bedroom'] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: node scripts/prepare-interior.mjs <input.glb> <output.glb> [label]')
  process.exit(1)
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})
const doc = await io.read(resolve(input))
const root = doc.getRoot()
const scene = root.getDefaultScene() ?? root.listScenes()[0]
root.setDefaultScene(scene)

// ------------------------------------------------------------- measuring --

/** World-space bounds of one node's mesh (rotation/scale included). */
function worldBounds(node) {
  const mesh = node.getMesh()
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const m = node.getWorldMatrix()
  let tris = 0
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    const idx = prim.getIndices()
    tris += (idx ? idx.getCount() : pos.getCount()) / 3
    const pmin = pos.getMin([])
    const pmax = pos.getMax([])
    for (let c = 0; c < 8; c++) {
      const p = [c & 1 ? pmax[0] : pmin[0], c & 2 ? pmax[1] : pmin[1], c & 4 ? pmax[2] : pmin[2]]
      const w = [0, 1, 2].map((r) => m[r] * p[0] + m[r + 4] * p[1] + m[r + 8] * p[2] + m[r + 12])
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], w[a])
        max[a] = Math.max(max[a], w[a])
      }
    }
  }
  const size = max.map((v, a) => v - min[a])
  return { min, max, size, tris, area: size[0] * size[2] }
}

const items = []
scene.traverse((node) => {
  if (node.getMesh()) items.push({ node, ...worldBounds(node) })
})

// ----------------------------------------------------------- classifying --

const ground = items.filter((it) => it.area > 300 && it.size[1] < 0.5)
const rest = items.filter((it) => !ground.includes(it))

// The room: the extent of everything taller than 2.5 m (walls, curtains).
const floorish = rest.filter((it) => it.size[1] < 0.25 && it.max[1] < 0.3 && it.area > 1.5)
const floorTop = Math.max(...floorish.map((it) => it.max[1]))

// The bed: the largest dense, low mesh. Anything dense resting on its
// footprint is bedding — flat layers are the throw, the rest pillows.
const dense = (it) => it.tris > 30000 && it.max[1] < floorTop + 1.3
const bed = rest.filter((it) => dense(it) && it.size[1] > 0.4).sort((a, b) => b.area - a.area)[0]
const onBed = (it) =>
  bed && it !== bed &&
  it.min[0] > bed.min[0] - 0.2 && it.max[0] < bed.max[0] + 0.2 &&
  it.min[2] > bed.min[2] - 0.2 && it.max[2] < bed.max[2] + 0.2

function classify(it) {
  const [sx, sy, sz] = it.size
  const thin = Math.min(sx, sz)
  if (it.min[1] > floorTop + 2.6) return 'ceiling'
  if (floorish.includes(it)) return it.tris > 1000 ? 'rug' : 'floor'
  if (it.min[1] < -0.1 && sy < 0.5) return 'slab'
  if (sy > 2.5 && it.tris > 20000 && Math.max(sx, sz) < 1.2) return 'curtain'
  if (sy > 2.4 && (thin < 0.4 || it.area > 20)) return 'wall'
  if (it === bed) return 'bed'
  if (onBed(it) && dense(it)) return sy < 0.35 && it.area > 1.5 ? 'linen' : 'bed'
  if (dense(it) && sy > 0.4) return 'fabric'
  return 'furniture'
}

// ------------------------------------------------------------- materials --

const here = dirname(fileURLToPath(import.meta.url))
const CACHE = resolve(here, '../.cache/polyhaven/textures')
function texture(id, map) {
  try {
    return doc.createTexture(`${id}/${map}`).setImage(readFileSync(join(CACHE, id, `${map}.jpg`))).setMimeType('image/jpeg')
  } catch {
    return null
  }
}

function material(name, { color, roughness = 0.8, metallic = 0, opacity = 1, tex, doubleSided = false }) {
  const m = doc.createMaterial(name).setBaseColorFactor([...color, opacity]).setRoughnessFactor(roughness).setMetallicFactor(metallic)
  if (opacity < 1) m.setAlphaMode('BLEND')
  if (doubleSided || opacity < 1) m.setDoubleSided(true)
  if (tex) {
    const diff = texture(tex, 'diff')
    const nor = texture(tex, 'nor_gl')
    const arm = texture(tex, 'arm')
    if (diff) m.setBaseColorTexture(diff)
    if (nor) m.setNormalTexture(nor)
    if (arm) m.setMetallicRoughnessTexture(arm).setOcclusionTexture(arm).setRoughnessFactor(1).setMetallicFactor(1)
  }
  return m
}

const MATERIALS = {
  floor: material('Floor_Wood', { color: [1, 1, 1], tex: 'herringbone_parquet' }),
  rug: material('Rug', { color: [0.62, 0.58, 0.53], roughness: 1 }),
  wall: material('Wall_Paint', { color: [0.93, 0.91, 0.87], roughness: 0.92 }),
  ceiling: material('Ceiling', { color: [0.97, 0.97, 0.96], roughness: 0.95 }),
  slab: material('Slab', { color: [0.6, 0.6, 0.6], roughness: 1 }),
  curtain: material('Curtain_Sheer', { color: [0.95, 0.93, 0.89], roughness: 1, opacity: 0.82 }),
  bed: material('Bed_Linen', { color: [0.92, 0.9, 0.86], roughness: 1 }),
  linen: material('Throw', { color: [0.66, 0.6, 0.53], roughness: 1 }),
  fabric: material('Upholstery', { color: [0.55, 0.53, 0.5], roughness: 1 }),
  furniture: material('Furniture', { color: [0.74, 0.67, 0.58], roughness: 0.55 }),
}

// ------------------------------------------------------------- applying --

const counts = {}
const floors = []
let seq = 0
for (const it of items) {
  if (ground.includes(it)) {
    it.node.dispose()
    continue
  }
  const kind = classify(it)
  counts[kind] = (counts[kind] ?? 0) + 1
  seq += 1
  const name = kind === 'ceiling' ? `Ceiling_${seq}` : kind === 'rug' ? `Rug_${seq}` : `${kind[0].toUpperCase()}${kind.slice(1)}_${seq}`
  it.node.setName(name)
  // Meshes are shared between nodes in some exports; copy before recolouring.
  const mesh = it.node.getMesh().clone()
  it.node.setMesh(mesh)
  for (const prim of mesh.listPrimitives()) prim.setMaterial(MATERIALS[kind])
  if (kind === 'floor') floors.push(it)
}

// Walkable floor: the finished floor meshes, grouped as one room.
const bounds = floors.reduce(
  (b, it) => ({
    minX: Math.min(b.minX, it.min[0]), maxX: Math.max(b.maxX, it.max[0]),
    minZ: Math.min(b.minZ, it.min[2]), maxZ: Math.max(b.maxZ, it.max[2]),
  }),
  { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
)
const area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ)
const roomName = `Room_${label.replace(/\W+/g, '_')}`
const room = doc.createNode(roomName).setExtras({
  label,
  order: 0,
  area: Math.round(area),
})
for (const it of floors) {
  // Re-parent keeping the world transform.
  const world = it.node.getWorldMatrix()
  for (const parent of it.node.listParents()) {
    if (parent.propertyType === 'Node' || parent.propertyType === 'Scene') parent.removeChild(it.node)
  }
  it.node.setMatrix(world)
  room.addChild(it.node)
}
scene.addChild(room)

// ------------------------------------------------------------ lightening --

await doc.transform(weld())

// Simplify each heavy mesh down to a budget; silhouettes of linen and
// cushions survive well, and walking collisions get much cheaper.
const BUDGET = 25000
const before = items.reduce((sum, it) => sum + it.tris, 0)
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const count = (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3
    if (count > BUDGET) {
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: BUDGET / count, error: 0.004, lockBorder: false })
    }
  }
}

await doc.transform(
  weld(),
  dedup(),
  prune({ keepExtras: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
)

const after = root.listMeshes()
  .flatMap((mesh) => mesh.listPrimitives())
  .reduce((sum, prim) => sum + (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3, 0)

await io.write(resolve(output), doc)
console.log(`wrote ${resolve(output)}`)
console.log(`  ${(statSync(resolve(output)).size / 1024 / 1024).toFixed(2)} MB · ${Math.round(before).toLocaleString()} → ${Math.round(after).toLocaleString()} triangles`)
console.log('  classes:', JSON.stringify(counts))
console.log(`  room "${label}": x ${bounds.minX.toFixed(2)}…${bounds.maxX.toFixed(2)}, z ${bounds.minZ.toFixed(2)}…${bounds.maxZ.toFixed(2)}, floor at y ${floorTop.toFixed(2)}`)
