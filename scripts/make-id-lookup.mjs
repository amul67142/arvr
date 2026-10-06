/**
 * Builds the two lookup images the ID material reads, and the palette to match.
 *
 *   node scripts/make-id-lookup.mjs
 *
 * The old ID pass coloured stand-in boxes, so every hotspot came out a
 * rectangle on a building that is not rectangular. These images let the colour
 * be carried by the tower's own geometry instead: the material asks "where in
 * the plan is this pixel, and how high up is it", looks both up here, and
 * multiplies them.
 *
 *   plan.png    which home, by position around the tower  -> (letter, 255, 255)
 *   floors.png  which storey, by height                   -> (255, floor, blue)
 *
 * Multiplied, that is exactly one palette colour. Outside the residential band
 * the floor strip is black, so the product is black and those pixels read as
 * background rather than as somebody's living room.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

import { readFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Lookup'
// 'tower' (default): the curved tower, homes by angle about its centre.
// 'highrise': the 21-storey slab, homes by balcony stack along each long face,
// fitted to the building.json hr1_setup.py writes - nobody measures anything.
const PRESET = process.argv[3] ?? 'tower'

let CENTRE, PLATE, BASE_Z, PITCH, FLOORS, SECTORS, LETTERS, homeAt
if (PRESET === 'highrise') {
  const b = JSON.parse(readFileSync(join(OUT, 'building.json'), 'utf8'))
  CENTRE = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]
  PLATE = [b.min[0] - 300, b.min[1] - 300, b.max[0] + 300, b.max[1] + 300]
  BASE_Z = b.min[2]
  PITCH = 200 * b.scale // a storey is 200 units in the model
  FLOORS = 21
  SECTORS = 8
  LETTERS = 'ABCDEFGH'
  // Four balcony stacks on each long face, measured off the model (units x scale):
  // stacks centre on +-1462 and +-400, so the homes split at +-925 and 0.
  const split = 925 * b.scale
  const longX = b.max[0] - b.min[0] >= b.max[1] - b.min[1]
  homeAt = (x, y) => {
    const along = longX ? x - CENTRE[0] : y - CENTRE[1]
    const across = longX ? y - CENTRE[1] : x - CENTRE[0]
    const column = along < -split ? 0 : along < 0 ? 1 : along < split ? 2 : 3
    // One face reads A-D, the other E-H, both going the same way round.
    return across >= 0 ? column : 7 - column
  }
} else {
  // The tower, as measured off the imported mesh (centimetres).
  CENTRE = [-1564, -90]
  PLATE = [-4224, -1700, 1096, 1520] // plate plus a metre of margin
  BASE_Z = 1483
  PITCH = 330
  FLOORS = 25
  SECTORS = 6
  LETTERS = 'ABCDEF'
  homeAt = (x, y) => {
    const angle = Math.atan2(y - CENTRE[1], x - CENTRE[0])
    return Math.min(SECTORS - 1, Math.floor(((angle + Math.PI) / (2 * Math.PI)) * SECTORS))
  }
}

// The strip covers a floor either side of the tower so the edges clamp to black.
const Z_MIN = BASE_Z - PITCH
const Z_RANGE = PITCH * (FLOORS + 2)

const PLAN_SIZE = 1024
const FLOOR_ROWS = 2048

// The renderer's tone curve squeezes the top of the range hard - 190 and 230
// came back as 240 and 249 - so twenty-five floors cannot be told apart in one
// channel. The storey is split across two instead: five widely spaced levels
// each, which multiply out to the twenty-five the tower has.
const letterByte = (sector) => 30 + sector * (SECTORS > 6 ? 30 : 40) // eight homes still fit under 255
const floorLowByte = (floor) => 30 + ((floor - 1) % 5) * 45
const floorHighByte = (floor) => 30 + Math.floor((floor - 1) / 5) * 45

mkdirSync(OUT, { recursive: true })

// -- plan: which home, by where in the footprint ------------------------------ --
const plan = Buffer.alloc(PLAN_SIZE * PLAN_SIZE * 3)
for (let py = 0; py < PLAN_SIZE; py++) {
  for (let px = 0; px < PLAN_SIZE; px++) {
    const x = PLATE[0] + ((px + 0.5) / PLAN_SIZE) * (PLATE[2] - PLATE[0])
    const y = PLATE[1] + ((py + 0.5) / PLAN_SIZE) * (PLATE[3] - PLATE[1])
    const sector = homeAt(x, y)
    const at = (py * PLAN_SIZE + px) * 3
    plan[at] = letterByte(sector)
    plan[at + 1] = 255
    plan[at + 2] = 255
  }
}
await sharp(plan, { raw: { width: PLAN_SIZE, height: PLAN_SIZE, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, 'plan.png'))

// -- floors: which storey, by height ---------------------------------------- --
const WIDE = 4
const strip = Buffer.alloc(WIDE * FLOOR_ROWS * 3)
let lit = 0
for (let row = 0; row < FLOOR_ROWS; row++) {
  const z = Z_MIN + ((row + 0.5) / FLOOR_ROWS) * Z_RANGE
  const floor = Math.floor((z - BASE_Z) / PITCH) + 1
  const valid = floor >= 1 && floor <= FLOORS
  if (valid) lit++
  for (let column = 0; column < WIDE; column++) {
    const at = (row * WIDE + column) * 3
    strip[at] = valid ? 255 : 0
    strip[at + 1] = valid ? floorLowByte(floor) : 0
    strip[at + 2] = valid ? floorHighByte(floor) : 0
  }
}
await sharp(strip, { raw: { width: WIDE, height: FLOOR_ROWS, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, 'floors.png'))

// -- the palette these two produce when multiplied -------------------------- --
const rows = []
for (let floor = 1; floor <= FLOORS; floor++) {
  for (let sector = 0; sector < SECTORS; sector++) {
    rows.push(`${letterByte(sector)},${floorLowByte(floor)},${floorHighByte(floor)},T1_F${String(floor).padStart(2, '0')}_${LETTERS[sector]}`)
  }
}
writeFileSync(join(OUT, 'colors.csv'), `r,g,b,name\n${rows.join('\n')}\n`)

writeFileSync(
  join(OUT, 'mapping.json'),
  JSON.stringify({ CENTRE, PLATE, BASE_Z, PITCH, FLOORS, SECTORS, Z_MIN, Z_RANGE }, null, 2),
)

console.log(`plan.png   ${PLAN_SIZE}x${PLAN_SIZE}  ${SECTORS} sectors`)
console.log(`floors.png ${WIDE}x${FLOOR_ROWS}  ${FLOORS} storeys · ${lit}/${FLOOR_ROWS} rows lit`)
console.log(`colors.csv ${rows.length} homes`)
console.log(`z maps ${Z_MIN}..${Z_MIN + Z_RANGE} over v 0..1`)
console.log(`wrote ${OUT}`)
