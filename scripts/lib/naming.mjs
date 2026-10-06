/**
 * The naming convention a studio's objects follow, in one place.
 *
 *   T1_F12_A        a home            T1_F12_A_BAL   one of its rooms
 *   T1_F12_SLAB     a floor band      T1_CORE        part of the tower
 *   AMEN_POOL       an amenity
 *
 * Both producers — the projector (camera + proxy) and the tracer (Object-ID
 * passes) — read names through here, so a delivery that satisfies one
 * satisfies the other, and the render brief has a single spec to quote.
 */

const ROOMS = {
  BAL: 'balcony',
  LIV: 'living',
  DIN: 'dining',
  KIT: 'kitchen',
  BED: 'bedroom',
  BATH: 'bathroom',
  UTIL: 'utility',
}

/** What a proxy or mask object name means, or null when it means nothing. */
export function targetFor(name) {
  if (!name) return null

  const room = name.match(/^(T\d+)_F(\d+)_([A-Z]+)_([A-Z]+)$/)
  if (room) {
    return {
      kind: 'room',
      tower: room[1],
      floor: Number(room[2]),
      unit: `${Number(room[2])}${room[3]}`,
      room: ROOMS[room[4]] ?? room[4].toLowerCase(),
    }
  }

  const slab = name.match(/^(T\d+)_F(\d+)_SLAB$/)
  if (slab) return { kind: 'floor', tower: slab[1], floor: Number(slab[2]) }

  const unit = name.match(/^(T\d+)_F(\d+)_([A-Z]+)$/)
  if (unit) {
    return { kind: 'unit', tower: unit[1], floor: Number(unit[2]), unit: `${Number(unit[2])}${unit[3]}` }
  }

  if (/^AMEN_/i.test(name)) return { kind: 'amenity', amenity: name.replace(/^AMEN_/i, '').toLowerCase() }

  const tower = name.match(/^(T\d+)(_|$)/)
  if (tower) return { kind: 'tower', tower: tower[1] }

  return null
}

/** The id a floor's own hotspot gets, when it is built from its homes. */
export const floorIdFor = (target) => `${target.tower}_F${target.floor}`
