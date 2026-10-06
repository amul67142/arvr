/**
 * Writes samples/bignonia-tower-b.glb — Central Park Bignonia Towers, Tower B,
 * modelled from a single front render (samples/bignonia-tower-b.jpg).
 *
 *   node scripts/build-bignonia.mjs
 *
 * What the render gives, measured from its pixels:
 * - The centre spine's floors are 34.8 px apart, the wings' 27.6 px. Both
 *   parts share the same levels — their crowns, roof terraces and refuge-floor
 *   screens line up once the hidden ground line (y ≈ 1672, behind the gate) is
 *   solved for — so the spine is not taller, it stands ~18 m nearer the camera.
 * - 37 residential floors, a roof terrace at level 38, a 7 m perforated crown.
 * - A refuge floor with a full-height perforated screen at level 19, the same
 *   screen on the top floor.
 * - Spine 12 m wide with rounded balconies whose white parapets dip into a
 *   glass rail mid-span; wings 35.4 m end to end with straight slab bands.
 *
 * What it cannot give: the sides and back. They repeat the front's language.
 *
 * Naming follows the viewer: the building is `Tower_Bignonia_B`, each storey a
 * `Tower_Bignonia_B_Floor_NN` group, so floors can be picked in the viewer.
 */
import sharp from 'sharp'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { createScene } from './lib/scene.mjs'

const s = await createScene('Bignonia Tower B')
const { THREE } = s
const M = s.materials.define

// ------------------------------------------------------------ dimensions --

const FH = 3.2 // floor to floor
const FLOORS = 37
const REFUGE = new Set([19])
const SLAB = 0.3

const SPINE = { half: 6.0, body: 5.4, front: 18, facade: 16.9, r: 1.6, sideBack: 14.8 }
const WING = { inner: 6.0, outer: 17.7, front: 0, facade: -1.1, back: -20, r: 1.5, sideBack: -4 }
const BODY_OUT = WING.outer - (WING.front - WING.facade) // 16.2 — wing side wall

// -------------------------------------------------------------- materials --

/** The perforated screen: a white lattice with square holes, as a PNG. */
async function screenPattern(size = 512) {
  const data = Buffer.alloc(size * size * 4)
  const module = size / 4
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = x % module
      const my = y % module
      const cell = module / 4
      const cx = mx % cell
      const cy = my % cell
      // Solid frame around each module, square holes inside, a few closed
      // cells in a diagonal rhythm so it reads as a pattern, not a grid.
      const frame = mx < 6 || my < 6
      const ix = Math.floor(mx / cell)
      const iy = Math.floor(my / cell)
      const closed = (ix + iy) % 4 === 0
      const hole = !frame && !closed && cx > 5 && cy > 5
      const i = (y * size + x) * 4
      data[i] = 246
      data[i + 1] = 246
      data[i + 2] = 244
      data[i + 3] = hole ? 0 : 255
    }
  }
  return sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
}

M('white', { color: [0.93, 0.93, 0.91], roughness: 0.5 })
M('facade', { color: [0.74, 0.75, 0.76], roughness: 0.85 })
M('railGlass', { color: [0.55, 0.72, 0.74], opacity: 0.38, roughness: 0.05 })
M('darkGlass', { color: [0.07, 0.1, 0.12], roughness: 0.08, metallic: 0.5 })
M('panel', { color: [0.42, 0.4, 0.37], roughness: 0.7 })
M('screen', { image: await screenPattern(), alphaBlend: true, tile: 2.4, roughness: 0.55 })
M('plant', { color: [0.2, 0.42, 0.15], roughness: 0.9 })
M('pot', { color: [0.8, 0.8, 0.78], roughness: 0.7 })
M('ground', { texture: 'hexagonal_concrete_paving', tile: 2.5, color: [0.78, 0.8, 0.86] })
M('lawn', { texture: 'leafy_grass', maps: ['nor_gl'], tile: 3, color: [0.3, 0.48, 0.2], roughness: 0.95 })

// ------------------------------------------------------------- geometry --

/** Points along a plan path of straight runs and quarter-circle corners. */
function planPath(steps) {
  const points = []
  const push = (x, z) => {
    const last = points.at(-1)
    if (last && Math.hypot(last[0] - x, last[1] - z) < 1e-6) return
    points.push([x, z])
  }
  for (const step of steps) {
    if (step.arc) {
      const [cx, cz, r, a0, a1] = step.arc
      const n = 10
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n
        push(cx + r * Math.cos(a), cz + r * Math.sin(a))
      }
    } else {
      push(step[0], step[1])
    }
  }
  // Arc length along the path, for UVs and height profiles.
  let run = 0
  return points.map((p, i) => {
    if (i > 0) run += Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1])
    return { x: p[0], z: p[1], s: run }
  })
}

const mirrorPath = (path) => {
  const flipped = path.map((p) => ({ x: -p.x, z: p.z })).reverse()
  let run = 0
  return flipped.map((p, i) => {
    if (i > 0) run += Math.hypot(p.x - flipped[i - 1].x, p.z - flipped[i - 1].z)
    return { ...p, s: run }
  })
}

// The spine's balcony edge: back along the left side, round the front, back.
const spinePath = planPath([
  [-SPINE.half, SPINE.sideBack],
  [-SPINE.half, SPINE.front - SPINE.r],
  { arc: [-SPINE.half + SPINE.r, SPINE.front - SPINE.r, SPINE.r, Math.PI, Math.PI / 2] },
  [SPINE.half - SPINE.r, SPINE.front],
  { arc: [SPINE.half - SPINE.r, SPINE.front - SPINE.r, SPINE.r, Math.PI / 2, 0] },
  [SPINE.half, SPINE.sideBack],
])

// A wing's slab edge: from the spine, along the front, round the outer corner.
const wingPathR = planPath([
  [WING.inner, WING.front],
  [WING.outer - WING.r, WING.front],
  { arc: [WING.outer - WING.r, WING.front - WING.r, WING.r, Math.PI / 2, 0] },
  [WING.outer, WING.sideBack],
])
const wingPathL = mirrorPath(wingPathR)

/**
 * A wall swept along a plan path — parapets, glass rails, screens. `bottom`
 * and `top` give its height at each point, so a parapet can dip mid-span.
 * The path is the outer face; thickness goes inward. UVs are in metres.
 */
function sweep(path, { thickness, bottom, top }) {
  const positions = []
  const normals = []
  const uvs = []
  const quad = (a, b, c, d, expected, uv) => {
    const ab = new THREE.Vector3().subVectors(b, a)
    const ac = new THREE.Vector3().subVectors(c, a)
    const n = new THREE.Vector3().crossVectors(ab, ac)
    const ordered = n.dot(expected) >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]
    const uvOrdered = n.dot(expected) >= 0
      ? [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]]
      : [uv[0], uv[2], uv[1], uv[0], uv[3], uv[2]]
    const unit = expected.clone().normalize()
    ordered.forEach((v, i) => {
      positions.push(v.x, v.y, v.z)
      normals.push(unit.x, unit.y, unit.z)
      uvs.push(...uvOrdered[i])
    })
  }

  const outward = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)]
    const b = path[Math.min(path.length - 1, i + 1)]
    const tx = b.x - a.x
    const tz = b.z - a.z
    const len = Math.hypot(tx, tz) || 1
    return { x: -tz / len, z: tx / len }
  })

  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i]
    const q = path[i + 1]
    const np = outward[i]
    const nq = outward[i + 1]
    const pb = bottom(p)
    const pt = top(p)
    const qb = bottom(q)
    const qt = top(q)
    const pi = { x: p.x - np.x * thickness, z: p.z - np.z * thickness }
    const qi = { x: q.x - nq.x * thickness, z: q.z - nq.z * thickness }
    const n = new THREE.Vector3((np.x + nq.x) / 2, 0, (np.z + nq.z) / 2)

    quad(V(p.x, pb, p.z), V(q.x, qb, q.z), V(q.x, qt, q.z), V(p.x, pt, p.z), n,
      [[p.s, pb], [q.s, qb], [q.s, qt], [p.s, pt]])
    quad(V(pi.x, pb, pi.z), V(qi.x, qb, qi.z), V(qi.x, qt, qi.z), V(pi.x, pt, pi.z), n.clone().negate(),
      [[p.s, pb], [q.s, qb], [q.s, qt], [p.s, pt]])
    quad(V(p.x, pt, p.z), V(q.x, qt, q.z), V(qi.x, qt, qi.z), V(pi.x, pt, pi.z), V(0, 1, 0),
      [[p.s, 0], [q.s, 0], [q.s, thickness], [p.s, thickness]])
    quad(V(p.x, pb, p.z), V(q.x, qb, q.z), V(qi.x, qb, qi.z), V(pi.x, pb, pi.z), V(0, -1, 0),
      [[p.s, 0], [q.s, 0], [q.s, thickness], [p.s, thickness]])
  }
  // End caps.
  for (const [i, sign] of [[0, -1], [path.length - 1, 1]]) {
    const p = path[i]
    const n = outward[i]
    const j = sign < 0 ? 1 : path.length - 2
    const tangent = V(p.x - path[j].x, 0, p.z - path[j].z).normalize()
    const pi = { x: p.x - n.x * thickness, z: p.z - n.z * thickness }
    quad(V(p.x, bottom(p), p.z), V(pi.x, bottom(p), pi.z), V(pi.x, top(p), pi.z), V(p.x, top(p), p.z), tangent,
      [[0, 0], [1, 0], [1, 1], [0, 1]])
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  return geo
}

/** A floor plate from a plan outline (x, z points), top face at y = 0. */
function plate(points, thickness = SLAB) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, -thickness, 0)
  return geo
}

function roundedRect(x0, z0, x1, z1, { frontLeft = 0, frontRight = 0 } = {}) {
  const pts = [[x0, z0], [x1, z0]]
  const corner = (cx, cz, r, a0, a1) => {
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)])
    }
  }
  if (frontRight) corner(x1 - frontRight, z1 - frontRight, frontRight, 0, Math.PI / 2)
  else pts.push([x1, z1])
  if (frontLeft) corner(x0 + frontLeft, z1 - frontLeft, frontLeft, Math.PI / 2, Math.PI)
  else pts.push([x0, z1])
  return pts
}

/** A wall in its own XY plane with rectangular openings, then placed. */
function wallGeo(length, height, openings, thickness = 0.25) {
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0), new THREE.Vector2(length, 0),
    new THREE.Vector2(length, height), new THREE.Vector2(0, height),
  ])
  for (const { x, y, w, h } of openings) {
    shape.holes.push(new THREE.Path([
      new THREE.Vector2(x, y), new THREE.Vector2(x, y + h),
      new THREE.Vector2(x + w, y + h), new THREE.Vector2(x + w, y),
    ]))
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
  geo.translate(0, 0, -thickness)
  return geo
}

/** Glass or panel infills for a wall's openings, set back into the reveal. */
function infills(openings, kindOf, depth = 0.12) {
  const byKind = {}
  for (const o of openings) {
    const g = new THREE.BoxGeometry(o.w, o.h, 0.04)
    g.translate(o.x + o.w / 2, o.y + o.h / 2, -depth)
    ;(byKind[kindOf(o)] ??= []).push(g)
  }
  return byKind
}

const at = (geo, { x = 0, y = 0, z = 0, ry = 0 } = {}) => {
  const m = new THREE.Matrix4().makeRotationY(ry)
  m.setPosition(x, y, z)
  return geo.applyMatrix4(m)
}

const smooth = (t) => {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

// ------------------------------------------------------------ one storey --

/** The parapet top on the spine: full height at the ends, dipping mid-span. */
const spineParapetTop = (p) =>
  p.z < SPINE.front - 0.01 ? 1.1 : 0.28 + 0.82 * smooth((Math.abs(p.x) - 1.4) / (SPINE.half - SPINE.r - 1.4))

function plantsAt(spots) {
  const out = { plant: [], pot: [] }
  for (const [x, z, k] of spots) {
    out.pot.push(at(new THREE.CylinderGeometry(0.28, 0.22, 0.55, 12), { x, y: 0.28, z }))
    for (const [dx, dy, dz, r] of [[0, 1.0, 0, 0.42], [0.2, 1.35, 0.1, 0.3], [-0.18, 1.25, -0.1, 0.32]]) {
      out.plant.push(at(new THREE.IcosahedronGeometry(r * k, 1), { x: x + dx, y: dy * k, z: z + dz }))
    }
  }
  return out
}

/**
 * Everything on one storey, grouped by material. `variant` picks which
 * balconies have plants; `screen` swaps parapets and rails for the
 * perforated screen (refuge and top floors).
 */
function storey({ variant = 0, screen = false } = {}) {
  const parts = {}
  const put = (kind, ...geos) => (parts[kind] ??= []).push(...geos)
  const H = FH - SLAB

  // Floor plates.
  put('white', plate(roundedRect(-SPINE.half, WING.back, SPINE.half, SPINE.front, {
    frontLeft: SPINE.r, frontRight: SPINE.r,
  })))
  put('white', plate(roundedRect(WING.inner, WING.back, WING.outer, WING.front, { frontRight: WING.r })))
  put('white', plate(roundedRect(-WING.outer, WING.back, -WING.inner, WING.front, { frontLeft: WING.r })))

  // Edges: parapet + glass, or the screen.
  if (screen) {
    for (const path of [spinePath, wingPathR, wingPathL]) {
      put('screen', sweep(path, { thickness: 0.06, bottom: () => -1.0, top: () => 2.5 }))
      put('white', sweep(path, { thickness: 0.14, bottom: () => -SLAB, top: () => 0.12 }))
    }
  } else {
    put('white', sweep(spinePath, { thickness: 0.18, bottom: () => -SLAB - 0.05, top: spineParapetTop }))
    const glassRun = planPath([[-SPINE.half + SPINE.r, SPINE.front - 0.1], [SPINE.half - SPINE.r, SPINE.front - 0.1]])
    put('railGlass', sweep(glassRun, { thickness: 0.02, bottom: () => 0.2, top: () => 1.08 }))
    for (const path of [wingPathR, wingPathL]) {
      put('white', sweep(path, { thickness: 0.16, bottom: () => -SLAB - 0.05, top: () => 0.32 }))
      put('railGlass', sweep(path, { thickness: 0.02, bottom: () => 0.32, top: () => 1.05 }))
    }
  }

  // Spine facade: a slatted grey door panel, glass doors, windows.
  const spineOpenings = [
    { x: 4.6, y: 0, w: 2.1, h: 2.6, kind: 'panel' },
    { x: 3.2, y: 0, w: 1.2, h: 2.5, kind: 'darkGlass' },
    { x: 6.9, y: 0, w: 1.2, h: 2.5, kind: 'darkGlass' },
    { x: 0.8, y: 0.5, w: 2.0, h: 2.0, kind: 'darkGlass' },
    { x: 8.4, y: 0.5, w: 2.0, h: 2.0, kind: 'darkGlass' },
  ]
  const facadeAt = { x: -SPINE.body, z: SPINE.facade }
  put('facade', at(wallGeo(SPINE.body * 2, H, spineOpenings), facadeAt))
  for (const [kind, geos] of Object.entries(infills(spineOpenings, (o) => o.kind))) {
    put(kind, ...geos.map((g) => at(g, facadeAt)))
  }
  // Spine side walls, each with one window.
  const sideOpen = [{ x: 3, y: 0.9, w: 1.6, h: 1.5 }, { x: 9, y: 0.9, w: 1.6, h: 1.5 }]
  put('facade', at(wallGeo(SPINE.facade, H, sideOpen), { x: -SPINE.body, z: 0, ry: -Math.PI / 2 }))
  put('facade', at(wallGeo(SPINE.facade, H, sideOpen), { x: SPINE.body, z: SPINE.facade, ry: Math.PI / 2 }))
  put('darkGlass',
    ...infills(sideOpen, () => 'g').g.map((g) => at(g, { x: -SPINE.body, z: 0, ry: -Math.PI / 2 })),
    ...infills(sideOpen, () => 'g').g.map((g) => at(g, { x: SPINE.body, z: SPINE.facade, ry: Math.PI / 2 })))

  // Wing facades, mirrored: windows, a grey door panel, glass doors.
  const wingOpenings = [
    { x: 0.6, y: 0.6, w: 2.2, h: 1.9, kind: 'darkGlass' },
    { x: 3.2, y: 0.6, w: 1.8, h: 1.9, kind: 'darkGlass' },
    { x: 5.3, y: 0, w: 0.8, h: 2.4, kind: 'darkGlass' },
    { x: 6.2, y: 0, w: 1.8, h: 2.6, kind: 'panel' },
    { x: 8.1, y: 0, w: 0.8, h: 2.4, kind: 'darkGlass' },
  ]
  const wingLen = BODY_OUT - SPINE.body
  for (const side of [1, -1]) {
    const place = side > 0
      ? { x: SPINE.body, z: WING.facade }
      : { x: -BODY_OUT, z: WING.facade }
    const openings = side > 0
      ? wingOpenings
      : wingOpenings.map((o) => ({ ...o, x: wingLen - o.x - o.w }))
    put('facade', at(wallGeo(wingLen, H, openings), place))
    for (const [kind, geos] of Object.entries(infills(openings, (o) => o.kind))) {
      put(kind, ...geos.map((g) => at(g, place)))
    }
    // Outer side wall and back wall.
    const sideLen = WING.facade - WING.back
    const sideWin = [{ x: 2, y: 0.9, w: 2, h: 1.5 }, { x: 8, y: 0.9, w: 2, h: 1.5 }, { x: 13.5, y: 0.9, w: 2, h: 1.5 }]
    const sidePlace = side > 0
      ? { x: BODY_OUT, z: WING.facade, ry: Math.PI / 2 }
      : { x: -BODY_OUT, z: WING.back, ry: -Math.PI / 2 }
    put('facade', at(wallGeo(sideLen, H, sideWin), sidePlace))
    put('darkGlass', ...infills(sideWin, () => 'g').g.map((g) => at(g, sidePlace)))
  }
  const backLen = BODY_OUT * 2
  const backWin = Array.from({ length: 8 }, (_, i) => ({ x: 1.2 + i * 4, y: 0.9, w: 2, h: 1.5 }))
  const backPlace = { x: BODY_OUT, z: WING.back, ry: Math.PI }
  put('facade', at(wallGeo(backLen, H, backWin), backPlace))
  put('darkGlass', ...infills(backWin, () => 'g').g.map((g) => at(g, backPlace)))

  // Plants on some balconies — the render has them scattered, not repeated.
  if (!screen) {
    const layouts = [
      [[-3.3, 17.1, 1], [3.7, 17.1, 0.9]],
      [[3.2, 17.1, 1.1], [12.4, -0.7, 0.8]],
      [[-2.6, 17.1, 0.9], [-9.5, -0.7, 0.8]],
    ]
    const { plant, pot } = plantsAt(layouts[variant % layouts.length])
    put('plant', ...plant)
    put('pot', ...pot)
  }

  return parts
}

/** Lobby: glass between columns, tucked under the first floor. */
function lobby() {
  const parts = { darkGlass: [], white: [] }
  const H = FH
  parts.white.push(plate(roundedRect(-BODY_OUT, WING.back, BODY_OUT, SPINE.facade), 0.2))
  parts.white[0].translate(0, 0.2, 0)
  parts.darkGlass.push(
    new THREE.BoxGeometry(SPINE.body * 2, H, 0.1).translate(0, H / 2, SPINE.facade - 0.6),
    new THREE.BoxGeometry(BODY_OUT - SPINE.body, H, 0.1).translate((BODY_OUT + SPINE.body) / 2, H / 2, WING.facade - 0.6),
    new THREE.BoxGeometry(BODY_OUT - SPINE.body, H, 0.1).translate(-(BODY_OUT + SPINE.body) / 2, H / 2, WING.facade - 0.6),
  )
  for (const x of [-15, -10, -5.4, 5.4, 10, 15]) {
    parts.white.push(new THREE.BoxGeometry(0.6, H, 0.6).translate(x, H / 2, x === 5.4 || x === -5.4 ? SPINE.facade - 0.3 : WING.facade - 0.3))
  }
  return parts
}

/** Roof terrace with the perforated crown on the spine and both wings. */
function crown() {
  const parts = {}
  const put = (kind, ...geos) => (parts[kind] ??= []).push(...geos)
  put('white', plate(roundedRect(-SPINE.half, WING.back, SPINE.half, SPINE.front, { frontLeft: SPINE.r, frontRight: SPINE.r })))
  put('white', plate(roundedRect(WING.inner, WING.back, WING.outer, WING.front, { frontRight: WING.r })))
  put('white', plate(roundedRect(-WING.outer, WING.back, -WING.inner, WING.front, { frontLeft: WING.r })))
  const HEIGHT = 7.0
  for (const path of [spinePath, wingPathR, wingPathL]) {
    put('white', sweep(path, { thickness: 0.16, bottom: () => -SLAB - 0.05, top: () => 0.3 }))
    put('railGlass', sweep(path, { thickness: 0.02, bottom: () => 0.3, top: () => 1.1 }))
    // The spine's crown is level; the wings' dip mid-span and rise at the ends.
    const total = path.at(-1).s
    const topAt = path === spinePath
      ? () => HEIGHT
      : (p) => HEIGHT - 0.9 * Math.sin(Math.PI * Math.min(1, p.s / (total * 0.8)))
    put('screen', sweep(path, { thickness: 0.05, bottom: () => 1.9, top: (p) => topAt(p) - 0.12 }))
    // White frame: top and bottom of the screen, and posts.
    put('white', sweep(path, { thickness: 0.14, bottom: (p) => topAt(p) - 0.14, top: (p) => topAt(p) + 0.06 }))
    put('white', sweep(path, { thickness: 0.1, bottom: () => 1.8, top: () => 1.92 }))
    const count = Math.max(2, Math.round(total / 3))
    for (let i = 0; i <= count; i++) {
      const target = (total * i) / count
      const p = path.reduce((best, q) => (Math.abs(q.s - target) < Math.abs(best.s - target) ? q : best))
      put('white', new THREE.BoxGeometry(0.1, topAt(p), 0.1).translate(p.x, topAt(p) / 2, p.z))
    }
  }
  return parts
}

// ---------------------------------------------------------- assemble --

/** Merge a storey's parts into one mesh per material; reusable across floors. */
function bake(prefix, parts) {
  return Object.entries(parts).map(([kind, geos]) => {
    const clean = geos.map((g) => {
      const flat = g.index ? g.toNonIndexed() : g
      for (const key of Object.keys(flat.attributes)) {
        if (!['position', 'normal', 'uv'].includes(key)) flat.deleteAttribute(key)
      }
      if (!flat.attributes.normal) flat.computeVertexNormals()
      if (!flat.attributes.uv) {
        flat.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2))
      }
      return flat
    })
    const merged = mergeGeometries(clean, false)
    const tile = kind === 'screen' ? 1 / 2.4 : 1
    const node = s.geometry(`${prefix}_${kind}`, kind, merged, new THREE.Matrix4(), { uvScale: [tile, tile] })
    return { kind, mesh: node.getMesh() }
  })
}

const templates = {
  typical: [0, 1, 2].map((variant) => bake(`Storey_${variant}`, storey({ variant }))),
  screen: bake('Storey_Screen', storey({ screen: true })),
}

const NAME = 'Tower_Bignonia_B'
const LOBBY_H = FH
const tower = s.group(NAME)

const lobbyNode = s.group(`${NAME}_Lobby`)
for (const { kind, mesh } of bake('Lobby', lobby())) {
  lobbyNode.addChild(s.doc.createNode(`${NAME}_Lobby_${kind}`).setMesh(mesh))
}
tower.addChild(lobbyNode)

for (let floor = 1; floor <= FLOORS; floor++) {
  const screen = REFUGE.has(floor) || floor === FLOORS
  const baked = screen ? templates.screen : templates.typical[(floor * 7) % 3]
  const nn = String(floor).padStart(2, '0')
  const node = s.group(`${NAME}_Floor_${nn}`, [], [0, LOBBY_H + (floor - 1) * FH, 0])
  for (const { kind, mesh } of baked) {
    node.addChild(s.doc.createNode(`${NAME}_Floor_${nn}_${kind}`).setMesh(mesh))
  }
  tower.addChild(node)
}

const roofNode = s.group(`${NAME}_Roof`, [], [0, LOBBY_H + FLOORS * FH, 0])
for (const { kind, mesh } of bake('Crown', crown())) {
  roofNode.addChild(s.doc.createNode(`${NAME}_Roof_${kind}`).setMesh(mesh))
}
tower.addChild(roofNode)

s.add(tower)

// Ground: a paved forecourt and lawn around the tower.
s.add(s.slab('Ground_Lawn', 'lawn', { outer: [-80, -80, 80, 80], holes: [[-30, -30, 30, 40]], y: 0, thickness: 0.1 }))
s.add(s.slab('Ground_Forecourt', 'ground', { outer: [-30, -30, 30, 40], y: 0.02, thickness: 0.1 }))

const { out, stats } = await s.write('samples/bignonia-tower-b.glb', { textureSize: 512, instancing: false })
const { statSync } = await import('node:fs')
console.log(`wrote ${out}`)
console.log(`  ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB · ${stats.meshes} meshes · ${FLOORS} floors · height ${(LOBBY_H + FLOORS * FH + 7).toFixed(1)} m`)
