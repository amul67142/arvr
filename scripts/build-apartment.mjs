/**
 * Builds the demo 3BHK unit for the walkthrough view.
 *
 *   node scripts/fetch-polyhaven.mjs   (once)
 *   node scripts/build-apartment.mjs
 *
 * Writes public/demo/unit-3bhk.glb — a Gurugram-style 3BHK corner unit
 * (≈ 1,950 sq ft super area): living & dining opening onto a 14 m² balcony,
 * three bedrooms, a master suite with walk-in wardrobe, bath and its own
 * balcony, kitchen with utility, and a foyer you enter from the lift lobby.
 *
 * Architecture is generated; furniture, decor and every surface texture are
 * real CC0 assets from Poly Haven. It is a representative unit, not the plan of
 * any real development.
 *
 * Coordinates are metres. Front facade on z = 0 (balconies at z < 0),
 * entrance on the back at z = 11. Floor level y = 0, ceiling at 2.9 m.
 */
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createScene } from './lib/scene.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../public/demo/unit-3bhk.glb')

const CEILING = 2.9
const EXT = 0.22 // exterior wall
const INT = 0.12 // interior wall
const DOOR_H = 2.1

const s = await createScene('Unit_3BHK')
const { THREE } = s
const M = s.materials.define

// ------------------------------------------------------------ materials --

M('marble', { texture: 'marble_01', tile: 2.4, roughness: 0.18, normalScale: 0.3 })
M('oak', { texture: 'oak_wood_planks', tile: 2.2 })
M('parquet', { texture: 'herringbone_parquet', tile: 1.2 })
M('kitchenTile', { texture: 'large_grey_tiles', tile: 1.2 })
M('bathFloor', { texture: 'anti_skid_tiles', tile: 0.8 })
M('bathWall', { texture: 'long_white_tiles', tile: 0.9 })
M('deck', { texture: 'wood_floor_deck', tile: 2.2 })
M('granite', { texture: 'granite_tile', tile: 1.0, roughness: 0.3 })
// Smooth emulsion paint: a textured plaster read as grimy concrete once lit.
M('wall', { color: [0.94, 0.92, 0.88], roughness: 0.92 })
M('ceiling', { color: [0.95, 0.94, 0.91], roughness: 0.95 })
M('slabEdge', { color: [0.82, 0.8, 0.76], roughness: 0.9 })
M('glass', { color: [0.78, 0.86, 0.9], opacity: 0.16, roughness: 0.04, metallic: 0 })
M('frame', { color: [0.18, 0.18, 0.19], roughness: 0.35, metallic: 0.7 })
M('walnut', { color: [0.33, 0.21, 0.13], roughness: 0.55 })
M('lacquer', { color: [0.86, 0.84, 0.8], roughness: 0.4 })
M('lacquerDark', { color: [0.24, 0.25, 0.26], roughness: 0.4 })
M('fabricWarm', { color: [0.72, 0.64, 0.55], roughness: 0.95 })
M('fabricLinen', { color: [0.93, 0.91, 0.87], roughness: 0.95 })
M('fabricSage', { color: [0.55, 0.6, 0.52], roughness: 0.95 })
M('rug', { color: [0.66, 0.58, 0.5], roughness: 1 })
M('screen', { color: [0.02, 0.02, 0.03], roughness: 0.15, metallic: 0.2 })
M('porcelain', { color: [0.96, 0.96, 0.95], roughness: 0.15 })
M('chrome', { color: [0.85, 0.86, 0.88], roughness: 0.12, metallic: 1 })
M('mirror', { color: [0.9, 0.93, 0.95], roughness: 0.02, metallic: 1 })
M('steel', { color: [0.7, 0.71, 0.72], roughness: 0.3, metallic: 0.9 })
M('ground', { texture: 'leafy_grass', tile: 6 })

// ---------------------------------------------------------------- rooms --

/**
 * Each room is its floor: walkable, named, and carrying the label and a good
 * viewpoint for "jump to room". Floors meet at wall centrelines so the floor is
 * continuous under every doorway.
 */
const ROOMS = [
  { id: 'Foyer', label: 'Foyer', mat: 'marble', rect: [9, 7, 12, 11], view: [10.6, 10.5, 8.5, 2.5] },
  { id: 'Living_Dining', label: 'Living & Dining', mat: 'marble', rect: [5, 0, 12, 7], view: [11.2, 6.6, 6.0, 0.8] },
  { id: 'Balcony', label: 'Balcony', mat: 'deck', rect: [5, -2, 12, 0], y: -0.04, view: [11.3, -0.4, 5.5, -1.6] },
  { id: 'Kitchen', label: 'Kitchen', mat: 'kitchenTile', rect: [5, 7, 9, 11], view: [8.5, 7.5, 5.3, 10.6] },
  { id: 'Utility', label: 'Utility', mat: 'deck', rect: [5, 11, 9, 12.2], y: -0.04, view: [8.6, 11.3, 5.3, 11.9] },
  { id: 'Master_Bedroom', label: 'Master Bedroom', mat: 'parquet', rect: [12, 0, 17, 5], view: [12.8, 0.7, 16.2, 4.4] },
  { id: 'Master_Balcony', label: 'Master Balcony', mat: 'deck', rect: [12, -1.6, 17, 0], y: -0.04, view: [12.5, -0.3, 16.8, -1.3] },
  { id: 'Walk_In_Wardrobe', label: 'Walk-in Wardrobe', mat: 'oak', rect: [12, 5, 14, 8], view: [13.4, 5.3, 12.6, 7.8] },
  { id: 'Master_Bath', label: 'Master Bath', mat: 'bathFloor', rect: [14, 5, 17, 8], view: [14.5, 5.4, 16.8, 6.4] },
  { id: 'Bedroom_2', label: 'Bedroom 2', mat: 'oak', rect: [0, 0, 5, 4.5], view: [4.2, 4.0, 0.5, 1.2] },
  { id: 'Hall', label: 'Bedroom Hall', mat: 'marble', rect: [2.6, 4.5, 5, 6.5], view: [4.7, 5.5, 2.8, 5.5] },
  { id: 'Common_Bath', label: 'Common Bath', mat: 'bathFloor', rect: [0, 4.5, 2.6, 6.5], view: [2.2, 5.9, 0.3, 5.3] },
  { id: 'Bedroom_3', label: 'Bedroom 3', mat: 'oak', rect: [0, 6.5, 5, 11], view: [4.3, 6.9, 0.8, 10.2] },
]

/**
 * Camera yaw in degrees, matching three.js: 0 looks down -Z, positive turns
 * toward -X. Views are authored as "stand here, look there" so no angle is
 * ever guessed by hand.
 */
const yawTo = (x, z, lookX, lookZ) =>
  Math.round((Math.atan2(-(lookX - x), -(lookZ - z)) * 180) / Math.PI)

const area = ([x0, z0, x1, z1]) => Math.round((x1 - x0) * (z1 - z0) * 10) / 10

const floors = ROOMS.map((room, order) => {
  const [x0, z0, x1, z1] = room.rect
  const y = room.y ?? 0
  return s.box(`Room_${room.id}`, room.mat, [x0, y - 0.1, z0], [x1, y, z1], {
    label: room.label,
    order,
    area: area(room.rect),
    view: { x: room.view[0], z: room.view[1], yaw: yawTo(...room.view) },
  })
})

// Ceilings over the interior and the balcony soffits (the slab above).
const ceilings = ROOMS.map((room) => {
  const [x0, z0, x1, z1] = room.rect
  return s.box(`Ceiling_${room.id}`, 'ceiling', [x0, CEILING, z0], [x1, CEILING + 0.15, z1])
})

// --------------------------------------------------------------- walls --

const walls = []
const rotY = (degrees) => new THREE.Matrix4().makeRotationY((degrees * Math.PI) / 180)
const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z)

/** Wall running along +X at z, from x0 to x1. */
function wallX(name, z, x0, x1, thickness, openings = [], material = 'wall', height = CEILING) {
  walls.push(
    s.wall(name, material, { length: x1 - x0, height, thickness, openings }, at(x0, 0, z)),
  )
}

/** Wall running along +Z at x, from z0 to z1. */
function wallZ(name, x, z0, z1, thickness, openings = [], material = 'wall', height = CEILING) {
  walls.push(
    s.wall(
      name,
      material,
      { length: z1 - z0, height, thickness, openings },
      at(x, 0, z0).multiply(rotY(-90)),
    ),
  )
}

// Opening helpers, measured along the wall from its start.
const door = (from, width = 0.9, height = DOOR_H) => ({ x: from, y: 0, w: width, h: height })
const window_ = (from, width, sill = 0.9, height = 1.5) => ({ x: from, y: sill, w: width, h: height })

// Exterior envelope.
wallX('Wall_Front', 0, 0, 17, EXT, [
  window_(1.0, 3.0), // bedroom 2
  door(5.5, 6.0, 2.45), // living → balcony sliding doors
  door(12.6, 1.8, 2.3), // master → master balcony
  window_(14.8, 1.7), // master
])
wallZ('Wall_Right', 17, 0, 8, EXT, [window_(1.0, 3.0), window_(5.9, 1.2, 1.6, 0.6)])
wallX('Wall_Back_Master', 8, 12, 17, EXT)
wallZ('Wall_Foyer_Side', 12, 8, 11, EXT)
wallX('Wall_Entrance', 11, 9, 12, EXT, [door(1.0, 1.2, 2.2)])
wallZ('Wall_Utility_Right', 9, 11, 12.2, EXT)
wallX('Wall_Utility_Parapet', 12.2, 5, 9, EXT, [], 'wall', 1.1)
wallZ('Wall_Utility_Left', 5, 11, 12.2, EXT)
wallX('Wall_Back_Bed3', 11, 0, 5, EXT, [window_(1.2, 2.6, 0.9, 1.4)])
wallZ('Wall_Left', 0, 0, 11, EXT, [window_(5.0, 1.0, 1.6, 0.6), window_(7.5, 2.5, 0.9, 1.4)])

// Interior partitions.
wallZ('Wall_Bed2_Living', 5, 0, 4.5, INT)
wallZ('Wall_Bed3_Kitchen', 5, 6.5, 11, INT)
wallX('Wall_Bed2_Hall', 4.5, 0, 5, INT, [door(3.1, 0.95)])
wallX('Wall_Bed3_Hall', 6.5, 0, 5, INT, [door(3.1, 0.95)])
wallZ('Wall_Bath_Hall', 2.6, 4.5, 6.5, INT, [door(0.55, 0.8)])
wallX('Wall_Living_Kitchen', 7, 5, 9, INT, [door(1.0, 1.6)])
wallZ('Wall_Kitchen_Foyer', 9, 7, 11, INT)
wallX('Wall_Kitchen_Utility', 11, 5, 9, INT, [window_(0.6, 1.8, 1.0, 1.2), door(2.8, 0.9)])
wallZ('Wall_Living_Master', 12, 0, 8, INT, [door(3.7, 1.0)])
wallX('Wall_Master_WalkIn', 5, 12, 14, INT, [door(0.4, 1.2, 2.2)])
wallX('Wall_Master_Bath', 5, 14, 17, INT)
wallZ('Wall_WalkIn_Bath', 14, 5, 8, INT, [door(1.0, 0.8)])

// Bathroom wall tiling (a thin skin over the plaster, to 2.1 m).
function tileSkin(name, rect, height = 2.1) {
  const [x0, z0, x1, z1] = rect
  const t = 0.012
  return [
    s.box(`${name}_N`, 'bathWall', [x0, 0, z0], [x1, height, z0 + t]),
    s.box(`${name}_S`, 'bathWall', [x0, 0, z1 - t], [x1, height, z1]),
    s.box(`${name}_W`, 'bathWall', [x0, 0, z0], [x0 + t, height, z1]),
    s.box(`${name}_E`, 'bathWall', [x1 - t, 0, z0], [x1, height, z1]),
  ]
}

// ------------------------------------------------------ glazing & rails --

const glazing = []

/** A glazed opening: frame + glass, set into a wall along X. */
function glazeX(name, z, x0, x1, y0, y1) {
  glazing.push(
    s.box(`${name}_Glass`, 'glass', [x0, y0, z - 0.012], [x1, y1, z + 0.012]),
    s.box(`${name}_Frame_T`, 'frame', [x0, y1 - 0.05, z - 0.04], [x1, y1, z + 0.04]),
    s.box(`${name}_Frame_B`, 'frame', [x0, y0, z - 0.04], [x1, y0 + 0.05, z + 0.04]),
    s.box(`${name}_Frame_L`, 'frame', [x0, y0, z - 0.04], [x0 + 0.05, y1, z + 0.04]),
    s.box(`${name}_Frame_R`, 'frame', [x1 - 0.05, y0, z - 0.04], [x1, y1, z + 0.04]),
  )
}

function glazeZ(name, x, z0, z1, y0, y1) {
  glazing.push(
    s.box(`${name}_Glass`, 'glass', [x - 0.012, y0, z0], [x + 0.012, y1, z1]),
    s.box(`${name}_Frame_T`, 'frame', [x - 0.04, y1 - 0.05, z0], [x + 0.04, y1, z1]),
    s.box(`${name}_Frame_B`, 'frame', [x - 0.04, y0, z0], [x + 0.04, y0 + 0.05, z1]),
    s.box(`${name}_Frame_L`, 'frame', [x - 0.04, y0, z0], [x + 0.04, y1, z0 + 0.05]),
    s.box(`${name}_Frame_R`, 'frame', [x - 0.04, y0, z1 - 0.05], [x + 0.04, y1, z1]),
  )
}

glazeX('Window_Bed2', 0, 1.0, 4.0, 0.9, 2.4)
glazeX('Window_Master', 0, 14.8, 16.5, 0.9, 2.4)
glazeZ('Window_Master_Side', 17, 1.0, 4.0, 0.9, 2.4)
glazeZ('Window_MasterBath', 17, 5.9, 7.1, 1.6, 2.2)
glazeX('Window_Bed3', 11, 1.2, 3.8, 0.9, 2.3)
glazeZ('Window_Bed3_Side', 0, 7.5, 10.0, 0.9, 2.3)
glazeZ('Window_CommonBath', 0, 5.0, 6.0, 1.6, 2.2)
glazeX('Window_Kitchen', 11, 5.6, 7.4, 1.0, 2.2)

// Living-room sliders: two fixed side panels, the middle pair slid open so
// the balcony is reachable — a closed glass wall would block the walkthrough.
glazeX('Slider_Left', 0, 5.5, 7.0, 0.0, 2.45)
glazeX('Slider_Right', 0, 10.0, 11.5, 0.0, 2.45)
glazing.push(
  s.box('Slider_Parked_L', 'glass', [7.0, 0, -0.07], [8.5, 2.45, -0.05]),
  s.box('Slider_Parked_R', 'glass', [8.5, 0, 0.05], [10.0, 2.45, 0.07]),
)

// Glass balustrades with a steel handrail.
function railX(name, z, x0, x1) {
  return [
    s.box(`${name}_Glass`, 'glass', [x0, 0, z - 0.01], [x1, 1.1, z + 0.01]),
    s.box(`${name}_Rail`, 'steel', [x0, 1.08, z - 0.03], [x1, 1.13, z + 0.03]),
  ]
}
function railZ(name, x, z0, z1) {
  return [
    s.box(`${name}_Glass`, 'glass', [x - 0.01, 0, z0], [x + 0.01, 1.1, z1]),
    s.box(`${name}_Rail`, 'steel', [x - 0.03, 1.08, z0], [x + 0.03, 1.13, z1]),
  ]
}
const rails = [
  ...railX('Rail_Balcony_Front', -2, 5, 12),
  ...railZ('Rail_Balcony_Left', 5, -2, 0),
  ...railX('Rail_MasterBalcony_Front', -1.6, 12, 17),
  ...railZ('Rail_MasterBalcony_Right', 17, -1.6, 0),
  ...railX('Rail_Utility', 12.2, 5, 9).map((node) => node), // over the parapet
]
// Privacy fin between the two balconies.
rails.push(s.box('Balcony_Divider', 'wall', [11.93, 0, -2], [12.07, CEILING, 0]))
// Slab edges read as the floor plate from outside.
rails.push(
  s.box('Slab_Balcony', 'slabEdge', [5, -0.35, -2.05], [12, -0.1, 0]),
  s.box('Slab_MasterBalcony', 'slabEdge', [12, -0.35, -1.65], [17, -0.1, 0]),
)

// ----------------------------------------------------------- joinery --

const joinery = []
const J = (...nodes) => joinery.push(...nodes)

// Living: wall-mounted TV over a floating walnut console.
J(
  s.box('TV_Console', 'walnut', [5.06, 0.22, 1.1], [5.5, 0.62, 3.4]),
  s.box('TV_Panel', 'screen', [5.06, 1.05, 1.52], [5.11, 1.88, 2.98]),
  s.box('TV_Bezel', 'lacquerDark', [5.06, 1.03, 1.5], [5.09, 1.9, 3.0]),
)
// Living: rug under the seating group, thin enough never to block a step.
J(s.box('Rug_Living', 'rug', [6.6, 0.0, 0.9], [10.1, 0.012, 3.5]))
// Dining: sideboard against the wardrobe wall.
J(s.box('Sideboard', 'walnut', [11.45, 0, 5.2], [11.94, 0.82, 6.9]))
// Foyer: shoe cabinet + mirror.
J(
  s.box('Shoe_Cabinet', 'lacquer', [11.45, 0, 8.2], [11.89, 1.0, 10.3]),
  s.box('Foyer_Mirror', 'mirror', [11.87, 1.2, 8.6], [11.89, 2.2, 9.9]),
)

// Kitchen: L-shaped counter with upper cabinets, hob and chimney.
J(
  s.box('Counter_Base_Long', 'lacquerDark', [5.06, 0, 7.1], [5.66, 0.86, 10.94]),
  s.box('Counter_Top_Long', 'granite', [5.04, 0.86, 7.08], [5.7, 0.9, 10.94]),
  s.box('Counter_Base_Back', 'lacquerDark', [5.66, 0, 10.34], [7.6, 0.86, 10.94]),
  s.box('Counter_Top_Back', 'granite', [5.66, 0.86, 10.3], [7.6, 0.9, 10.94]),
  s.box('Upper_Cabinets', 'lacquer', [5.06, 1.5, 7.1], [5.42, 2.25, 9.6]),
  s.box('Hob', 'screen', [5.12, 0.9, 8.2], [5.62, 0.915, 8.9]),
  s.box('Chimney_Hood', 'steel', [5.06, 1.62, 8.15], [5.55, 1.72, 8.95]),
  s.box('Chimney_Duct', 'steel', [5.06, 1.72, 8.4], [5.3, CEILING, 8.7]),
  s.box('Sink', 'steel', [5.72 + 0.4, 0.84, 10.4], [6.9, 0.9, 10.86]),
  s.box('Fridge', 'steel', [8.25, 0, 7.1], [8.94, 1.85, 7.8]),
)
// Utility: washing machine.
J(s.box('Washer', 'porcelain', [8.2, -0.04, 11.2], [8.8, 0.82, 11.8]))

/** A modern upholstered bed: plinth, mattress, duvet, headboard, pillows. */
function bed(name, { x0, z0, x1, z1, head }) {
  // `head` is the side the headboard sits on: 'x0' | 'x1' | 'z0' | 'z1'.
  const nodes = [
    s.box(`${name}_Plinth`, 'walnut', [x0, 0.08, z0], [x1, 0.32, z1]),
    s.box(`${name}_Mattress`, 'fabricLinen', [x0 + 0.03, 0.32, z0 + 0.03], [x1 - 0.03, 0.55, z1 - 0.03]),
  ]
  const duvet = { x0: x0 + 0.02, z0: z0 + 0.02, x1: x1 - 0.02, z1: z1 - 0.02 }
  const pillow = []
  if (head === 'x0') {
    duvet.x0 += 0.55
    nodes.push(s.box(`${name}_Headboard`, 'fabricWarm', [x0 - 0.1, 0.08, z0 - 0.05], [x0, 1.25, z1 + 0.05]))
    const mid = (z0 + z1) / 2
    pillow.push([x0 + 0.08, mid - 0.72, x0 + 0.5, mid - 0.06], [x0 + 0.08, mid + 0.06, x0 + 0.5, mid + 0.72])
  }
  if (head === 'x1') {
    duvet.x1 -= 0.55
    nodes.push(s.box(`${name}_Headboard`, 'fabricWarm', [x1, 0.08, z0 - 0.05], [x1 + 0.1, 1.25, z1 + 0.05]))
    const mid = (z0 + z1) / 2
    pillow.push([x1 - 0.5, mid - 0.72, x1 - 0.08, mid - 0.06], [x1 - 0.5, mid + 0.06, x1 - 0.08, mid + 0.72])
  }
  if (head === 'z1') {
    duvet.z1 -= 0.55
    nodes.push(s.box(`${name}_Headboard`, 'fabricWarm', [x0 - 0.05, 0.08, z1], [x1 + 0.05, 1.3, z1 + 0.1]))
    const mid = (x0 + x1) / 2
    pillow.push([mid - 0.82, z1 - 0.5, mid - 0.06, z1 - 0.08], [mid + 0.06, z1 - 0.5, mid + 0.82, z1 - 0.08])
  }
  nodes.push(
    s.box(`${name}_Duvet`, 'fabricSage', [duvet.x0, 0.55, duvet.z0], [duvet.x1, 0.62, duvet.z1]),
  )
  pillow.forEach(([a, b, c, d], index) =>
    nodes.push(s.box(`${name}_Pillow_${index + 1}`, 'fabricLinen', [a, 0.55, b], [c, 0.72, d])),
  )
  return nodes
}

J(...bed('Bed_Master', { x0: 14.6, z0: 2.9, x1: 16.4, z1: 4.88, head: 'z1' }))
J(...bed('Bed_2', { x0: 0.12, z0: 1.4, x1: 2.12, z1: 3.0, head: 'x0' }))
J(...bed('Bed_3', { x0: 2.85, z0: 8.1, x1: 4.84, z1: 9.6, head: 'x1' }))

// Wardrobes.
J(
  s.box('Wardrobe_Bed2', 'lacquer', [4.36, 0, 0.35], [4.93, 2.4, 2.9]),
  s.box('Wardrobe_Bed3', 'lacquer', [0.12, 0, 9.3], [2.2, 2.4, 10.88]),
  s.box('Wardrobe_WalkIn_A', 'walnut', [12.07, 0, 5.4], [12.62, 2.4, 7.93]),
  s.box('Wardrobe_WalkIn_B', 'walnut', [12.62, 0, 7.38], [13.94, 2.4, 7.93]),
)
// Bedroom 3 study desk under the side window.
J(s.box('Study_Desk', 'walnut', [0.12, 0.72, 7.6], [0.72, 0.76, 9.1]))
J(s.box('Study_Desk_Leg', 'lacquerDark', [0.12, 0, 7.62], [0.7, 0.72, 7.68]))

/** Vanity with basin, mirror, WC and a glass shower screen. */
function bathroom(name, { vanity, mirror, wc, shower }) {
  return [
    s.box(`${name}_Vanity`, 'walnut', vanity.min, vanity.max),
    s.box(`${name}_Basin`, 'porcelain', vanity.basinMin, vanity.basinMax),
    s.box(`${name}_Mirror`, 'mirror', mirror.min, mirror.max),
    s.box(`${name}_WC`, 'porcelain', wc.min, wc.max),
    s.box(`${name}_WC_Cistern`, 'porcelain', wc.cisternMin, wc.cisternMax),
    s.box(`${name}_Shower_Screen`, 'glass', shower.min, shower.max),
    s.box(`${name}_Shower_Head`, 'chrome', shower.headMin, shower.headMax),
  ]
}

J(
  ...bathroom('MasterBath', {
    vanity: { min: [16.4, 0.45, 5.3], max: [16.94, 0.86, 6.9], basinMin: [16.5, 0.86, 5.8], basinMax: [16.85, 0.93, 6.4] },
    mirror: { min: [16.92, 1.15, 5.4], max: [16.94, 2.05, 6.8] },
    wc: { min: [16.35, 0, 7.25], max: [16.9, 0.42, 7.7], cisternMin: [16.78, 0.42, 7.25], cisternMax: [16.92, 0.8, 7.7] },
    shower: { min: [14.9, 0, 6.96], max: [14.92, 2.0, 7.93], headMin: [14.3, 2.0, 7.7], headMax: [14.5, 2.03, 7.9] },
  }),
  ...tileSkin('MasterBath_Tiles', [14.07, 5.07, 16.93, 7.93]),
  ...bathroom('CommonBath', {
    vanity: { min: [0.12, 0.45, 5.05], max: [0.62, 0.86, 6.0], basinMin: [0.2, 0.86, 5.3], basinMax: [0.55, 0.93, 5.8] },
    mirror: { min: [0.12, 1.15, 5.1], max: [0.14, 2.0, 5.95] },
    wc: { min: [1.6, 0, 4.58], max: [2.05, 0.42, 5.1], cisternMin: [1.6, 0.42, 4.58], cisternMax: [2.05, 0.8, 4.7] },
    shower: { min: [0.12, 0, 6.0], max: [1.2, 2.0, 6.02], headMin: [0.2, 2.0, 6.15], headMax: [0.4, 2.03, 6.4] },
  }),
  ...tileSkin('CommonBath_Tiles', [0.07, 4.57, 2.53, 6.43]),
)

// ------------------------------------------------------- furniture --

const furniture = []
const F = async (id, options) => furniture.push(await s.model(id, options))

// Living.
await F('sofa_02', { position: [10.35, 0, 2.2], rotation: -90 })
await F('throw_pillows_01', { position: [10.4, 0.44, 2.2], rotation: -90 })
await F('modern_arm_chair_01', { position: [7.3, 0, 0.95], rotation: 35 })
await F('modern_coffee_table_01', { position: [8.35, 0, 2.2], rotation: 90 })
await F('side_table_01', { position: [10.45, 0, 0.75], rotation: -90 })
await F('ceramic_vase_02', { position: [10.45, 0.55, 0.75] })
await F('potted_plant_02', { position: [11.5, 0, 0.55], simplifyRatio: 0.25 })
await F('brass_diya_lantern', { position: [5.3, 0.62, 3.1], simplifyRatio: 0.4 })
await F('standing_picture_frame_01', { position: [5.3, 0.62, 1.35], rotation: 90 })
// Poly Haven's wall frames face -Z by default, unlike its furniture.
await F('hanging_picture_frame_02', { position: [11.93, 1.35, 1.9], rotation: 90 })
await F('ceiling_fan', { position: [8.35, CEILING - 0.52, 2.2], simplifyRatio: 0.4 })

// Dining.
await F('dining_table', { position: [8.5, 0, 5.3] })
for (const x of [7.75, 8.5, 9.25]) {
  await F('dining_chair_02', { position: [x, 0, 4.5], simplifyRatio: 0.35 })
  await F('dining_chair_02', { position: [x, 0, 6.1], rotation: 180, simplifyRatio: 0.35 })
}
await F('modern_ceiling_lamp_01', { position: [8.0, CEILING - 0.95, 5.3] })
await F('modern_ceiling_lamp_01', { position: [9.0, CEILING - 0.95, 5.3] })
await F('ceramic_vase_02', { position: [11.7, 0.82, 6.4] })

// Foyer.
await F('potted_plant_02', { position: [9.45, 0, 10.5], simplifyRatio: 0.25 })
await F('brass_diya_lantern', { position: [11.65, 1.0, 9.9], simplifyRatio: 0.4 })

// Balcony — the reason people buy the flat.
await F('outdoor_table_chair_set_01', { position: [7.0, -0.04, -1.0], rotation: 90 })
await F('planter_box_01', { position: [10.4, -0.04, -1.72], simplifyRatio: 0.5 })
await F('planter_box_01', { position: [11.4, -0.04, -1.0], rotation: 90, simplifyRatio: 0.5 })
await F('potted_plant_04', { position: [5.4, -0.04, -1.7] })

// Master bedroom.
await F('side_table_tall_01', { position: [14.25, 0, 4.55] })
await F('side_table_tall_01', { position: [16.72, 0, 4.55] })
await F('mid_century_lounge_chair', { position: [13.1, 0, 1.2], rotation: 140 })
await F('hanging_picture_frame_01', { position: [15.5, 1.45, 4.92] })
await F('ceiling_fan', { position: [15.2, CEILING - 0.52, 2.6], simplifyRatio: 0.4 })

// Master balcony, with the split-AC unit every Gurugram balcony has.
await F('exterior_aircon_unit', { position: [16.45, -0.04, -0.45], rotation: -90, scale: 0.55, simplifyRatio: 0.4 })
await F('planter_box_01', { position: [13.2, -0.04, -1.35], simplifyRatio: 0.5 })

// Bedroom 2.
await F('side_table_01', { position: [0.4, 0, 0.8] })
await F('side_table_01', { position: [0.4, 0, 3.6] })
await F('potted_plant_04', { position: [0.4, 0.55, 0.8] })
await F('ceiling_fan', { position: [2.5, CEILING - 0.52, 2.25], simplifyRatio: 0.4 })

// Bedroom 3.
await F('side_table_tall_01', { position: [4.6, 0, 9.95] })
await F('dining_chair_02', { position: [1.05, 0, 8.35], rotation: -90, simplifyRatio: 0.35 })
await F('desk_lamp_arm_01', { position: [0.35, 0.76, 7.85], rotation: 90, simplifyRatio: 0.3 })
await F('ceiling_fan', { position: [2.5, CEILING - 0.52, 8.7], simplifyRatio: 0.4 })

// Utility.
await F('exterior_aircon_unit', { position: [6.1, -0.04, 11.75], scale: 0.55, simplifyRatio: 0.4 })

// ------------------------------------------------------- surroundings --

// The unit sits on floor 18, ~56 m up. A ground far below keeps the windows
// from looking out onto nothing.
const outside = s.box('Ground_Far', 'ground', [-600, -56.2, -600], [600, -56, 600])

s.add(
  s.group('Floors', floors),
  s.group('Ceilings', ceilings),
  s.group('Walls', walls),
  s.group('Glazing', glazing),
  s.group('Balconies', rails),
  s.group('Joinery', joinery),
  s.group('Furniture', furniture),
  outside,
  // Enter from the lift lobby, looking into the living room.
  s.empty('Spawn', [10.6, 0, 10.5], { yaw: yawTo(10.6, 10.5, 8.5, 2.5) }),
)

mkdirSync(dirname(OUT), { recursive: true })
const { out, stats } = await s.write(OUT)
const { statSync } = await import('node:fs')
console.log(
  `wrote ${out}\n  ${(statSync(out).size / 1048576).toFixed(2)} MB · ${stats.boxes} boxes · ` +
    `${Object.values(stats.models).reduce((a, b) => a + b, 0)} furniture pieces from ` +
    `${Object.keys(stats.models).length} Poly Haven models · ${ROOMS.length} rooms`,
)
