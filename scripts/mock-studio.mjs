/**
 * A synthetic studio delivery, so the hotspot pipeline can be proved before a
 * client spends anything on renders.
 *
 *   node scripts/mock-studio.mjs
 *
 * Writes into public/demo/mock exactly what a rendering studio would send:
 *
 *   beauty/0001.jpg …   the shaded orbit frames ("the render")
 *   id/0001.png …       a flat-colour Object-ID pass for the same frames
 *   colors.csv          which colour in the ID pass is which object
 *   camera.json         the camera for every frame
 *   proxy.glb           one named box per sellable thing
 *   truth.json          the boxes in plain numbers — ground truth for tests,
 *                       which a real delivery will not include
 *
 * Nothing here is the product. It exists so that scripts/build-hotspots.mjs
 * (the projector) and scripts/trace-masks.mjs (the tracer) can be checked
 * against an answer we already know, on this machine, today.
 *
 * The renderer is a small z-buffered triangle rasteriser — no GPU, no browser,
 * no headless WebGL. Boxes are all it has to draw.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { Matrix4, Vector3 } from 'three'
import { Document, NodeIO } from '@gltf-transform/core'

// -- what we are pretending to render ------------------------------------- --

const argv = process.argv.slice(2)
const OUT = argv.find((a) => !a.startsWith('-')) ?? 'public/demo/mock'
// --notched builds every home as two piers either side of a recessed balcony,
// so each flat is non-convex: the shape a convex hull gets wrong.
const NOTCHED = argv.includes('--notched')
const W = 1280
const H = 720
const FRAMES = 24
const FLOORS = 24

const FLOOR_H = 3.2
const PLATE = 28 // square floor plate, metres
const SLAB = 0.25
const BALCONY = { depth: 2.0, width: 4.6, height: 2.6 }

const CAMERA = {
  fovY: 38, // degrees
  radius: 152,
  height: 58,
  target: [0, 44, 0],
  near: 0.5,
  far: 900,
}

const pad = (n, width = 4) => String(n).padStart(width, '0')

/** A quarter of the plate, per home: A north-east, B north-west, C south-west, D south-east. */
const QUADRANTS = [
  { code: 'A', sx: 1, sz: 1, face: 'x+' },
  { code: 'B', sx: -1, sz: 1, face: 'z+' },
  { code: 'C', sx: -1, sz: -1, face: 'x-' },
  { code: 'D', sx: 1, sz: -1, face: 'z-' },
]

/**
 * The tower as the studio's 3D scene would have it: one box per thing a buyer
 * can click. Names follow the convention in the render brief —
 * T1_F12_A, T1_F12_A_BAL, T1_F12_SLAB, T1_CORE, T1_PODIUM.
 */
function buildTower() {
  const boxes = []
  const half = PLATE / 4 // centre of a quadrant
  const quarter = PLATE / 2 - 0.4 // its width, minus a reveal

  boxes.push({
    name: 'T1_PODIUM',
    kind: 'amenity',
    center: [0, 3, 0],
    size: [PLATE + 14, 6, PLATE + 14],
    tone: [176, 172, 165],
  })
  boxes.push({
    name: 'T1_CORE',
    kind: 'tower',
    center: [0, 6 + (FLOORS * FLOOR_H) / 2, 0],
    size: [9, FLOORS * FLOOR_H, 9],
    tone: [120, 122, 128],
  })

  for (let floor = 1; floor <= FLOORS; floor++) {
    const base = 6 + (floor - 1) * FLOOR_H

    boxes.push({
      name: `T1_F${floor}_SLAB`,
      kind: 'floor',
      floor,
      center: [0, base + SLAB / 2, 0],
      size: [PLATE + 1.6, SLAB, PLATE + 1.6],
      tone: [226, 224, 219],
    })

    for (const q of QUADRANTS) {
      const unit = `${floor}${q.code}`
      const cx = q.sx * half
      const cz = q.sz * half
      const cy = base + SLAB + (FLOOR_H - SLAB) / 2

      const glass = [96 + (floor % 3) * 5, 118 + (floor % 3) * 5, 134 + (floor % 3) * 5]
      const onFacadeX = q.face.startsWith('x')
      if (NOTCHED) {
        // Two piers with a recess between them: one home, two boxes, and a
        // silhouette a convex hull would fill straight across.
        const pier = quarter * 0.36
        const offset = quarter / 2 - pier / 2
        for (const side of [-1, 1]) {
          boxes.push({
            name: `T1_F${floor}_${q.code}`,
            kind: 'unit',
            floor,
            unit,
            center: [onFacadeX ? cx : cx + side * offset, cy, onFacadeX ? cz + side * offset : cz],
            size: onFacadeX ? [quarter, FLOOR_H - SLAB, pier] : [pier, FLOOR_H - SLAB, quarter],
            tone: glass,
          })
        }
      } else {
        boxes.push({
          name: `T1_F${floor}_${q.code}`,
          kind: 'unit',
          floor,
          unit,
          center: [cx, cy, cz],
          size: [quarter, FLOOR_H - SLAB, quarter],
          // Glass, faintly banded floor to floor so the beauty pass reads as a building.
          tone: glass,
        })
      }

      // The balcony hangs off the facade this home faces.
      const outward = NOTCHED ? PLATE / 2 - BALCONY.depth / 2 : PLATE / 2 + BALCONY.depth / 2
      const onX = q.face.startsWith('x')
      boxes.push({
        name: `T1_F${floor}_${q.code}_BAL`,
        kind: 'room',
        floor,
        unit,
        room: 'balcony',
        center: [
          onX ? Math.sign(q.sx) * outward : cx,
          base + SLAB + BALCONY.height / 2,
          onX ? cz : Math.sign(q.sz) * outward,
        ],
        size: onX
          ? [BALCONY.depth, BALCONY.height, BALCONY.width]
          : [BALCONY.width, BALCONY.height, BALCONY.depth],
        tone: [236, 233, 226],
      })
    }
  }

  return boxes
}

// -- geometry -------------------------------------------------------------- --

/** Unit cube faces, outward-facing, as quads of corner indices. */
const CUBE = [-0.5, 0.5]
const CORNERS = []
for (const x of CUBE) for (const y of CUBE) for (const z of CUBE) CORNERS.push([x, y, z])
const index = (x, y, z) => CORNERS.findIndex((c) => c[0] === x && c[1] === y && c[2] === z)
const FACES = [
  { n: [1, 0, 0], q: [index(0.5, -0.5, 0.5), index(0.5, -0.5, -0.5), index(0.5, 0.5, -0.5), index(0.5, 0.5, 0.5)] },
  { n: [-1, 0, 0], q: [index(-0.5, -0.5, -0.5), index(-0.5, -0.5, 0.5), index(-0.5, 0.5, 0.5), index(-0.5, 0.5, -0.5)] },
  { n: [0, 1, 0], q: [index(-0.5, 0.5, 0.5), index(0.5, 0.5, 0.5), index(0.5, 0.5, -0.5), index(-0.5, 0.5, -0.5)] },
  { n: [0, -1, 0], q: [index(-0.5, -0.5, -0.5), index(0.5, -0.5, -0.5), index(0.5, -0.5, 0.5), index(-0.5, -0.5, 0.5)] },
  { n: [0, 0, 1], q: [index(-0.5, -0.5, 0.5), index(0.5, -0.5, 0.5), index(0.5, 0.5, 0.5), index(-0.5, 0.5, 0.5)] },
  { n: [0, 0, -1], q: [index(0.5, -0.5, -0.5), index(-0.5, -0.5, -0.5), index(-0.5, 0.5, -0.5), index(0.5, 0.5, -0.5)] },
]

/** World-space corners of a box, in the fixed CORNERS order. */
function cornersOf(box) {
  return CORNERS.map(([x, y, z]) => [
    box.center[0] + x * box.size[0],
    box.center[1] + y * box.size[1],
    box.center[2] + z * box.size[2],
  ])
}

/** Boxes sharing a name are one object: one ID colour, one proxy node. */
function groupBoxes(boxes) {
  const groups = new Map()
  for (const box of boxes) {
    if (!groups.has(box.name)) groups.set(box.name, { name: box.name, kind: box.kind, boxes: [] })
    groups.get(box.name).boxes.push(box)
  }
  const objects = [...groups.values()]
  objects.forEach((object, index) => {
    for (const box of object.boxes) box.objectIndex = index
  })
  return objects
}

/** Every triangle in the scene, with the object it belongs to and its normal. */
function triangles(boxes) {
  const list = []
  boxes.forEach((box) => {
    const objectIndex = box.objectIndex
    const corners = cornersOf(box)
    for (const face of FACES) {
      const [a, b, c, d] = face.q.map((i) => corners[i])
      list.push({ objectIndex, n: face.n, v: [a, b, c] })
      list.push({ objectIndex, n: face.n, v: [a, c, d] })
    }
  })
  return list
}

// -- camera ---------------------------------------------------------------- --

function cameraForFrame(frame) {
  const angle = (frame / FRAMES) * Math.PI * 2
  return {
    frame,
    eye: [
      Math.sin(angle) * CAMERA.radius,
      CAMERA.height,
      Math.cos(angle) * CAMERA.radius,
    ],
    target: CAMERA.target,
  }
}

/** View matrix and the projection constants, for one frame. */
function viewFor({ eye, target }) {
  const world = new Matrix4().lookAt(
    new Vector3(...eye),
    new Vector3(...target),
    new Vector3(0, 1, 0),
  )
  world.setPosition(new Vector3(...eye))
  return world.invert()
}

const FOCAL = 1 / Math.tan(((CAMERA.fovY * Math.PI) / 180) / 2)
const ASPECT = W / H

/** World point -> { x, y (pixels), depth (metres in front of the camera) }. */
function project(point, view, scratch = new Vector3()) {
  scratch.set(point[0], point[1], point[2]).applyMatrix4(view)
  const depth = -scratch.z
  if (depth <= CAMERA.near) return null
  const ndcX = ((FOCAL / ASPECT) * scratch.x) / depth
  const ndcY = (FOCAL * scratch.y) / depth
  return {
    x: (ndcX * 0.5 + 0.5) * W,
    y: (1 - (ndcY * 0.5 + 0.5)) * H,
    depth,
  }
}

// -- rasteriser ------------------------------------------------------------ --

let BOX_TONES = []

const LIGHT = (() => {
  const v = new Vector3(0.45, 0.78, 0.44)
  v.normalize()
  return [v.x, v.y, v.z]
})()

function skyBackground() {
  const pixels = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++) {
    const t = y / H
    const r = Math.round(214 + (243 - 214) * t)
    const g = Math.round(226 + (240 - 226) * t)
    const b = Math.round(240 + (234 - 240) * t)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      pixels[i] = r
      pixels[i + 1] = g
      pixels[i + 2] = b
    }
  }
  return pixels
}

/** The ground, so the beauty pass is not a tower floating in a void. */
function groundTriangles() {
  const S = 400
  const a = [-S, 0, -S]
  const b = [S, 0, -S]
  const c = [S, 0, S]
  const d = [-S, 0, S]
  return [
    { objectIndex: -1, n: [0, 1, 0], v: [a, b, c], tone: [196, 192, 182] },
    { objectIndex: -1, n: [0, 1, 0], v: [a, c, d], tone: [196, 192, 182] },
  ]
}

function drawTriangle(pixels, depths, p0, p1, p2, rgb) {
  const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)))
  const maxX = Math.min(W - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)))
  const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)))
  const maxY = Math.min(H - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)))
  if (minX > maxX || minY > maxY) return

  const den = (p1.y - p2.y) * (p0.x - p2.x) + (p2.x - p1.x) * (p0.y - p2.y)
  if (Math.abs(den) < 1e-9) return

  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      const l0 = ((p1.y - p2.y) * (px - p2.x) + (p2.x - p1.x) * (py - p2.y)) / den
      if (l0 < 0) continue
      const l1 = ((p2.y - p0.y) * (px - p2.x) + (p0.x - p2.x) * (py - p2.y)) / den
      if (l1 < 0) continue
      const l2 = 1 - l0 - l1
      if (l2 < 0) continue

      const depth = l0 * p0.depth + l1 * p1.depth + l2 * p2.depth
      const at = y * W + x
      if (depth >= depths[at]) continue
      depths[at] = depth
      const i = at * 3
      pixels[i] = rgb[0]
      pixels[i + 1] = rgb[1]
      pixels[i + 2] = rgb[2]
    }
  }
}

/**
 * Object index -> the exact colour it gets in the ID pass.
 *
 * Spread around the wheel rather than packed into the low bits, so the pass is
 * legible to a person as well as to the tracer. Collisions step the blue
 * channel until the colour is free; colors.csv is the authority either way.
 */
const ID_COLOURS = new Map()
const ID_TAKEN = new Set()
function idColour(objectIndex) {
  if (ID_COLOURS.has(objectIndex)) return ID_COLOURS.get(objectIndex)
  let r = 24 + ((objectIndex * 97) % 216)
  let g = 24 + ((objectIndex * 53) % 216)
  let b = 24 + ((objectIndex * 151) % 216)
  while (ID_TAKEN.has((r << 16) | (g << 8) | b) || (r === 0 && g === 0 && b === 0)) {
    b = 24 + ((b + 7) % 216)
  }
  ID_TAKEN.add((r << 16) | (g << 8) | b)
  const colour = [r, g, b]
  ID_COLOURS.set(objectIndex, colour)
  return colour
}

function renderFrame(tris, camera, { pass }) {
  const view = viewFor(camera)
  const pixels = pass === 'id' ? new Uint8Array(W * H * 3) : skyBackground()
  const depths = new Float64Array(W * H).fill(Infinity)
  const scratch = new Vector3()

  const all = pass === 'id' ? tris : [...groundTriangles(), ...tris]
  for (const tri of all) {
    const p = tri.v.map((point) => project(point, view, scratch))
    if (p.some((q) => q === null)) continue

    let rgb
    if (pass === 'id') {
      rgb = idColour(tri.objectIndex)
    } else {
      const tone = tri.tone ?? BOX_TONES[tri.objectIndex]
      const lambert = Math.max(0, tri.n[0] * LIGHT[0] + tri.n[1] * LIGHT[1] + tri.n[2] * LIGHT[2])
      const shade = 0.42 + 0.58 * lambert
      rgb = tone.map((c) => Math.min(255, Math.round(c * shade)))
    }
    drawTriangle(pixels, depths, p[0], p[1], p[2], rgb)
  }

  return Buffer.from(pixels)
}

// -- the delivery ---------------------------------------------------------- --

async function writeProxyGlb(objects, path) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const scene = doc.createScene('Proxy')

  for (const object of objects) {
    // A home made of two piers is one node with both boxes in its mesh, which
    // is how a studio hands over a non-convex flat.
    const positions = []
    const indices = []
    for (const box of object.boxes) {
      const base = positions.length / 3
      for (const corner of cornersOf(box)) positions.push(...corner)
      for (const face of FACES) {
        const [a, b, c, d] = face.q
        indices.push(base + a, base + b, base + c, base + a, base + c, base + d)
      }
    }
    const position = doc
      .createAccessor(`${object.name}_POSITION`)
      .setType('VEC3')
      .setArray(new Float32Array(positions))
      .setBuffer(buffer)
    const index = doc
      .createAccessor(`${object.name}_INDEX`)
      .setType('SCALAR')
      .setArray(new Uint16Array(indices))
      .setBuffer(buffer)
    const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(index)
    scene.addChild(doc.createNode(object.name).setMesh(doc.createMesh(object.name).addPrimitive(prim)))
  }

  await new NodeIO().write(path, doc)
}

async function main() {
  const boxes = buildTower()
  const objects = groupBoxes(boxes)
  const tris = triangles(boxes)

  BOX_TONES = objects.map((object) => object.boxes[0].tone)
  for (const dir of ['', 'beauty', 'id']) mkdirSync(join(OUT, dir), { recursive: true })

  const cameras = []
  for (let frame = 0; frame < FRAMES; frame++) {
    const camera = cameraForFrame(frame)
    cameras.push(camera)

    const beauty = renderFrame(tris, camera, { pass: 'beauty' })
    await sharp(beauty, { raw: { width: W, height: H, channels: 3 } })
      .jpeg({ quality: 88 })
      .toFile(join(OUT, 'beauty', `${pad(frame + 1)}.jpg`))

    // Lossless, so every ID colour survives exactly.
    const ids = renderFrame(tris, camera, { pass: 'id' })
    await sharp(ids, { raw: { width: W, height: H, channels: 3 } })
      .png({ compressionLevel: 9 })
      .toFile(join(OUT, 'id', `${pad(frame + 1)}.png`))

    process.stdout.write(`\r  frame ${frame + 1}/${FRAMES}`)
  }
  process.stdout.write('\n')

  writeFileSync(
    join(OUT, 'camera.json'),
    JSON.stringify(
      {
        note: 'Synthetic delivery from scripts/mock-studio.mjs — not a real project.',
        width: W,
        height: H,
        fovY: CAMERA.fovY,
        aspect: ASPECT,
        near: CAMERA.near,
        far: CAMERA.far,
        up: [0, 1, 0],
        frameCount: FRAMES,
        frames: cameras,
      },
      null,
      2,
    ),
  )

  writeFileSync(
    join(OUT, 'colors.csv'),
    ['r,g,b,name', ...objects.map((object, i) => [...idColour(i), object.name].join(','))].join('\n') + '\n',
  )

  writeFileSync(
    join(OUT, 'truth.json'),
    JSON.stringify(
      {
        note: 'Ground truth for testing the pipeline. A real studio delivery has no such file.',
        objects: objects.map((object, i) => ({
          name: object.name,
          kind: object.kind,
          idColour: idColour(i),
          boxes: object.boxes.map(({ center, size }) => ({ center, size })),
        })),
      },
      null,
      2,
    ),
  )

  await writeProxyGlb(objects, join(OUT, 'proxy.glb'))

  const units = objects.filter((o) => o.kind === 'unit').length
  console.log(
    `wrote ${OUT} · ${FRAMES} frames ${W}x${H} · ${objects.length} named objects${NOTCHED ? ' (notched homes)' : ''} ` +
      `(${units} homes, ${FLOORS} floors) · beauty + id + camera.json + colors.csv + proxy.glb`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
