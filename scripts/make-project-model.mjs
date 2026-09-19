/**
 * Generates the demo masterplan GLB used to show the viewer.
 *
 *   node scripts/make-project-model.mjs
 *
 * Writes samples/gurugram-masterplan.glb — a Gurugram-style high-rise
 * condominium: four residential towers on a parking podium around a central
 * green, with a clubhouse, pool, courts, driveway and landscaping.
 *
 * It exists because no permissively-licensed 3D model of a real Gurugram
 * project is available to download, and because none of the public sample
 * models use the Tower_ / Building_ / Block_ naming the viewer keys off. This
 * is a representative massing model at masterplan scale, not a depiction of any
 * actual building.
 *
 * Everything is built from one unit box spanning x/z -0.5..0.5 and y 0..1, so a
 * node's translation is its base centre and its scale is its size in metres.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '../samples/gurugram-masterplan.glb')

// ---------------------------------------------------------------- geometry --

const FACES = [
  { normal: [0, 0, 1], corners: [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]] },
  { normal: [0, 0, -1], corners: [[0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]] },
  { normal: [1, 0, 0], corners: [[0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]] },
  { normal: [-1, 0, 0], corners: [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]] },
  { normal: [0, 1, 0], corners: [[-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]] },
  { normal: [0, -1, 0], corners: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]] },
]

const positions = []
const normals = []
const indices = []

FACES.forEach((face, faceIndex) => {
  face.corners.forEach((corner) => {
    positions.push(...corner)
    normals.push(...face.normal)
  })
  const base = faceIndex * 4
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
})

const positionBytes = Buffer.from(new Float32Array(positions).buffer)
const normalBytes = Buffer.from(new Float32Array(normals).buffer)
const indexBytes = Buffer.from(new Uint16Array(indices).buffer)

/** GLB chunks are 4-byte aligned: JSON pads with spaces, BIN pads with zeros. */
const pad4 = (buffer, fill = 0x00) => {
  const remainder = buffer.length % 4
  if (remainder === 0) return buffer
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)])
}

const binary = Buffer.concat([positionBytes, normalBytes, pad4(indexBytes)])

// --------------------------------------------------------------- materials --

const materials = [
  { name: 'Glass_Vision', color: [0.3, 0.41, 0.5, 1], roughness: 0.1, metallic: 0.6 },
  { name: 'Glass_Spandrel', color: [0.17, 0.22, 0.27, 1], roughness: 0.32, metallic: 0.35 },
  { name: 'Concrete_White', color: [0.89, 0.88, 0.85, 1], roughness: 0.72 },
  { name: 'Concrete_Warm', color: [0.76, 0.71, 0.63, 1], roughness: 0.82 },
  { name: 'Metal_Trim', color: [0.6, 0.61, 0.63, 1], roughness: 0.28, metallic: 0.85 },
  { name: 'Terracotta', color: [0.6, 0.35, 0.25, 1], roughness: 0.75 },
  { name: 'Water', color: [0.17, 0.42, 0.53, 1], roughness: 0.05, metallic: 0.15 },
  { name: 'Grass', color: [0.28, 0.41, 0.23, 1], roughness: 0.95 },
  { name: 'Foliage', color: [0.21, 0.33, 0.19, 1], roughness: 0.9 },
  { name: 'Bark', color: [0.28, 0.22, 0.16, 1], roughness: 0.9 },
  { name: 'Asphalt', color: [0.19, 0.19, 0.21, 1], roughness: 0.9 },
  { name: 'Paving', color: [0.65, 0.63, 0.59, 1], roughness: 0.85 },
  { name: 'Court_Clay', color: [0.45, 0.28, 0.21, 1], roughness: 0.92 },
]

const M = Object.fromEntries(materials.map((material, index) => [material.name, index]))

// One mesh per material, all sharing the same unit-box accessors.
const meshes = materials.map((material) => ({
  name: `Box_${material.name}`,
  primitives: [
    { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: M[material.name] },
  ],
}))

// ------------------------------------------------------------------- scene --

const nodes = []
const add = (node) => nodes.push(node) - 1

/** A box placed by base-centre and size in metres. */
const box = (name, material, [x, y, z], [sx, sy, sz]) =>
  add({ name, mesh: material, translation: [x, y, z], scale: [sx, sy, sz] })

const group = (name, children, translation = [0, 0, 0]) =>
  add({ name, translation, children })

const SITE = { width: 200, depth: 170 }
const PODIUM = { width: 156, depth: 74, height: 6.5, z: -40 }
const FLOOR_HEIGHT = 3.1

/**
 * One residential tower: a banded facade of slab edges and glazing, corner
 * fins running the full height, a setback crown and a podium-level entrance
 * lobby. Floors are individually named so a later phase can select them.
 */
function tower({ name, x, z, size, floors, accent }) {
  const children = []
  const base = PODIUM.height
  const half = size / 2

  children.push(
    box(`${name}_Lobby`, M.Concrete_White, [x, 0, z], [size + 6, base, size + 6]),
    box(`${name}_Lobby_Canopy`, M.Metal_Trim, [x, base - 0.6, z + half + 4], [size + 10, 0.5, 6]),
  )

  for (let floor = 0; floor < floors; floor += 1) {
    const y = base + floor * FLOOR_HEIGHT
    const label = String(floor + 1).padStart(2, '0')

    // Slab edge reads as the balcony band from a distance.
    children.push(
      box(`${name}_Floor_${label}`, M.Concrete_White, [x, y, z], [size + 1.4, 0.65, size + 1.4]),
    )

    // Glazing sits inboard of the slab so the band pattern stays legible.
    children.push(
      box(
        `${name}_Glazing_${label}`,
        floor % 6 === 5 ? M.Glass_Spandrel : M.Glass_Vision,
        [x, y + 0.65, z],
        [size - 0.6, FLOOR_HEIGHT - 0.65, size - 0.6],
      ),
    )
  }

  const top = base + floors * FLOOR_HEIGHT

  // Corner fins give the massing vertical emphasis.
  const finInset = half - 0.9
  const fins = [
    [-finInset, -finInset],
    [finInset, -finInset],
    [-finInset, finInset],
    [finInset, finInset],
  ]
  fins.forEach(([dx, dz], index) => {
    children.push(
      box(
        `${name}_Fin_${index + 1}`,
        accent ? M.Terracotta : M.Concrete_Warm,
        [x + dx, base, z + dz],
        [1.8, top - base, 1.8],
      ),
    )
  })

  children.push(
    box(`${name}_Parapet`, M.Concrete_White, [x, top, z], [size + 1.4, 1.6, size + 1.4]),
    box(`${name}_Crown`, M.Concrete_Warm, [x, top + 1.6, z], [size * 0.62, 4.2, size * 0.62]),
    box(`${name}_Mast`, M.Metal_Trim, [x, top + 5.8, z], [0.5, 7, 0.5]),
  )

  return group(name, children)
}

/** Trunk plus two foliage masses — enough to read as a tree at this scale. */
function tree(name, x, z, height, spread) {
  return group(name, [
    box(`${name}_Trunk`, M.Bark, [x, 0, z], [0.7, height * 0.42, 0.7]),
    box(`${name}_Canopy_Lower`, M.Foliage, [x, height * 0.36, z], [spread, height * 0.4, spread]),
    box(
      `${name}_Canopy_Upper`,
      M.Foliage,
      [x, height * 0.7, z],
      [spread * 0.68, height * 0.34, spread * 0.68],
    ),
  ])
}

const topLevel = []

// -- Site ---------------------------------------------------------------- --

topLevel.push(
  group('Site', [
    box('Ground', M.Grass, [0, -0.6, 0], [SITE.width, 0.6, SITE.depth]),
    box('Central_Green', M.Grass, [0, 0, 22], [120, 0.08, 56]),
    box('Driveway_Loop', M.Asphalt, [0, 0.02, 62], [170, 0.14, 13]),
    box('Driveway_West', M.Asphalt, [-83, 0.02, 20], [12, 0.14, 98]),
    box('Driveway_East', M.Asphalt, [83, 0.02, 20], [12, 0.14, 98]),
    box('Entrance_Plaza', M.Paving, [0, 0.03, 76], [46, 0.2, 14]),
    box('Entrance_Gate_West', M.Concrete_Warm, [-22, 0, 76], [3, 7, 3]),
    box('Entrance_Gate_East', M.Concrete_Warm, [22, 0, 76], [3, 7, 3]),
    box('Entrance_Lintel', M.Metal_Trim, [0, 6.4, 76], [47, 1.2, 2.2]),
    box('Boundary_Wall_North', M.Concrete_Warm, [0, 0, -84], [SITE.width, 2.6, 1]),
    box('Boundary_Wall_West', M.Concrete_Warm, [-99.5, 0, 0], [1, 2.6, SITE.depth]),
    box('Boundary_Wall_East', M.Concrete_Warm, [99.5, 0, 0], [1, 2.6, SITE.depth]),
  ]),
)

// -- Parking podium the towers stand on ---------------------------------- --

topLevel.push(
  group('Podium', [
    box('Podium_Deck', M.Concrete_Warm, [0, 0, PODIUM.z], [
      PODIUM.width,
      PODIUM.height,
      PODIUM.depth,
    ]),
    box('Podium_Coping', M.Concrete_White, [0, PODIUM.height, PODIUM.z], [
      PODIUM.width + 2,
      0.7,
      PODIUM.depth + 2,
    ]),
    box('Podium_Landscape', M.Grass, [0, PODIUM.height + 0.7, PODIUM.z], [
      PODIUM.width - 6,
      0.12,
      PODIUM.depth - 6,
    ]),
    box('Podium_Ramp', M.Asphalt, [-68, 0, 2], [11, 0.3, 24]),
  ]),
)

// -- Towers --------------------------------------------------------------- --

topLevel.push(tower({ name: 'Tower_A', x: -56, z: -44, size: 26, floors: 34, accent: true }))
topLevel.push(tower({ name: 'Tower_B', x: -19, z: -34, size: 24, floors: 30, accent: false }))
topLevel.push(tower({ name: 'Tower_C', x: 19, z: -44, size: 27, floors: 38, accent: true }))
topLevel.push(tower({ name: 'Tower_D', x: 56, z: -34, size: 24, floors: 28, accent: false }))

// -- Clubhouse, named Block_ so the second detection prefix is exercised -- --

topLevel.push(
  group('Block_Clubhouse', [
    box('Clubhouse_Base', M.Concrete_White, [-38, 0, 24], [40, 5.4, 22]),
    box('Clubhouse_Upper', M.Glass_Vision, [-38, 5.4, 24], [34, 4.6, 18]),
    box('Clubhouse_Roof', M.Concrete_White, [-38, 10, 24], [42, 1, 24]),
    box('Clubhouse_Canopy', M.Metal_Trim, [-38, 4.6, 37], [30, 0.4, 7]),
    box('Clubhouse_Column_West', M.Metal_Trim, [-50, 0, 37], [0.6, 4.6, 0.6]),
    box('Clubhouse_Column_East', M.Metal_Trim, [-26, 0, 37], [0.6, 4.6, 0.6]),
  ]),
)

// -- Amenities ------------------------------------------------------------ --

topLevel.push(
  group('Amenities', [
    box('Pool_Deck', M.Paving, [14, 0.05, 26], [46, 0.25, 26]),
    box('Swimming_Pool', M.Water, [14, 0.1, 26], [30, 0.5, 14]),
    box('Pool_Coping', M.Concrete_White, [14, 0.05, 26], [31.6, 0.35, 15.6]),
    box('Kids_Pool', M.Water, [36, 0.1, 26], [8, 0.4, 8]),
    box('Tennis_Court', M.Court_Clay, [62, 0.04, 24], [24, 0.2, 34]),
    box('Tennis_Net', M.Metal_Trim, [62, 0.2, 24], [22, 1.1, 0.2]),
    box('Kids_Play_Area', M.Terracotta, [-72, 0.04, 40], [22, 0.2, 18]),
  ]),
)

// -- Landscape ------------------------------------------------------------ --

const trees = []
for (let i = 0; i < 14; i += 1) {
  trees.push(tree(`Tree_Avenue_${String(i + 1).padStart(2, '0')}`, -91 + i * 14, 54, 9 + (i % 3) * 2, 6))
}
for (let i = 0; i < 8; i += 1) {
  trees.push(tree(`Tree_Green_${String(i + 1).padStart(2, '0')}`, -52 + i * 15, 6, 8 + (i % 2) * 3, 5.5))
}
for (let i = 0; i < 6; i += 1) {
  trees.push(tree(`Tree_Edge_${String(i + 1).padStart(2, '0')}`, -94, -10 + i * 16, 10, 6.5))
}

topLevel.push(group('Landscape', trees))

// --------------------------------------------------------------- assemble --

const gltf = {
  asset: {
    version: '2.0',
    generator: 'interactive-real-estate-viewer — Gurugram demo masterplan',
    copyright: 'Representative massing model. Not a depiction of any real project.',
  },
  scene: 0,
  scenes: [{ name: 'Gurugram_Masterplan', nodes: topLevel }],
  nodes,
  meshes,
  materials: materials.map((material) => ({
    name: material.name,
    pbrMetallicRoughness: {
      baseColorFactor: material.color,
      roughnessFactor: material.roughness,
      metallicFactor: material.metallic ?? 0,
    },
  })),
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: positions.length / 3,
      type: 'VEC3',
      min: [-0.5, 0, -0.5],
      max: [0.5, 1, 0.5],
    },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
    {
      buffer: 0,
      byteOffset: positionBytes.length,
      byteLength: normalBytes.length,
      target: 34962,
    },
    {
      buffer: 0,
      byteOffset: positionBytes.length + normalBytes.length,
      byteLength: indexBytes.length,
      target: 34963,
    },
  ],
  buffers: [{ byteLength: binary.length }],
}

const jsonChunk = pad4(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20)
const binChunk = pad4(binary)

const header = Buffer.alloc(12)
header.write('glTF', 0, 'ascii')
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)

const jsonHeader = Buffer.alloc(8)
jsonHeader.writeUInt32LE(jsonChunk.length, 0)
jsonHeader.writeUInt32LE(0x4e4f534a, 4) // 'JSON'

const binHeader = Buffer.alloc(8)
binHeader.writeUInt32LE(binChunk.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4) // 'BIN'

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]))

console.log(
  `wrote ${outPath}\n  ${nodes.length} nodes, ${topLevel.length} top-level objects, ` +
    `${materials.length} materials, ${(header.readUInt32LE(8) / 1024).toFixed(0)} KB`,
)
