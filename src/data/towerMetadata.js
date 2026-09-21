/**
 * Placeholder sales data for the demo masterplan.
 *
 * Phase 1 is deliberately backend-free, so this file is the single seam where a
 * CMS or CRM feed will eventually plug in — the shape below is what the panel
 * renders, nothing else reads the raw object.
 *
 * The project, its pricing and its handover dates are illustrative and belong
 * to no real development. Only the locality is real, and it is here so the demo
 * reads correctly to a Gurugram audience. Replace this file with the client's
 * own inventory before showing it as theirs.
 */
/*
 * targetViewId — optional. The id of the view EXPLORE TOWER opens. View ids are
 * slugs of view names, so a view named "Tower D Exterior" has the id
 * "tower-d-exterior". This is a default only: the editor can link or unlink
 * any tower at runtime, and that choice wins. A target is only used if the view
 * exists and has its file attached; otherwise the button stays disabled.
 */

export const project = {
  name: 'Aravali Vista',
  location: 'Sector 65 · Golf Course Extension Road, Gurugram',
  developer: 'Demo data — not a real development',
}

export const towerMetadata = {
  Tower_A: {
    displayName: 'Tower A',
    tagline: 'Golf Course Facing Residences',
    location: 'Sector 65 · Golf Course Extension Road',
    floors: 'G + 34 Floors',
    configuration: '3 & 4 BHK',
    price: 'Starting ₹4.95 Cr',
    facing: 'East · Golf course views',
    possession: 'Possession Dec 2028',

    rate: 25400, // ₹ per sq ft of super area, before floor rise
    units: [
      { code: 'A', type: '3BHK', facing: 'East · Golf course' },
      { code: 'B', type: '3BHK', facing: 'North · Central green' },
      { code: 'C', type: '4BHK', facing: 'South · Podium garden' },
      { code: 'D', type: '4BHK', facing: 'West · Aravalli ridge' },
    ],
  },
  Tower_B: {
    displayName: 'Tower B',
    tagline: 'Central Green Residences',
    location: 'Sector 65 · Golf Course Extension Road',
    floors: 'G + 30 Floors',
    configuration: '3 BHK',
    price: 'Starting ₹4.20 Cr',
    facing: 'North · Central green facing',
    possession: 'Possession Jun 2028',

    rate: 21500, // ₹ per sq ft of super area, before floor rise
    units: [
      { code: 'A', type: '3BHK', facing: 'North · Central green' },
      { code: 'B', type: '3BHK', facing: 'East · Clubhouse' },
      { code: 'C', type: '3BHK', facing: 'South · Pool' },
      { code: 'D', type: '3BHK', facing: 'West · Tennis court' },
    ],
  },
  Tower_C: {
    displayName: 'Tower C',
    tagline: 'Signature Sky Residences',
    location: 'Sector 65 · Golf Course Extension Road',
    floors: 'G + 38 Floors',
    configuration: '4 & 5 BHK',
    price: 'Starting ₹7.40 Cr',
    facing: 'West · Aravalli ridge views',
    possession: 'Possession Mar 2029',

    rate: 27900, // ₹ per sq ft of super area, before floor rise
    units: [
      { code: 'A', type: '4BHK', facing: 'West · Aravalli ridge' },
      { code: 'B', type: '4BHK', facing: 'North · Skyline' },
      { code: 'C', type: '5BHK', facing: 'South · Podium garden' },
      { code: 'D', type: '5BHK', facing: 'East · Golf course' },
    ],
  },
  Tower_D: {
    displayName: 'Tower D',
    tagline: 'Podium Garden Residences',
    location: 'Sector 65 · Golf Course Extension Road',
    floors: 'G + 28 Floors',
    configuration: '3 BHK',
    price: 'Starting ₹3.95 Cr',
    facing: 'South · Podium garden facing',
    possession: 'Possession Sep 2028',
    targetViewId: 'tower-d-exterior',
    rate: 20250, // ₹ per sq ft of super area, before floor rise
    units: [
      { code: 'A', type: '3BHK', facing: 'South · Podium garden' },
      { code: 'B', type: '3BHK', facing: 'East · Pool deck' },
      { code: 'C', type: '3BHK', facing: 'North · Central green' },
      { code: 'D', type: '3BHK', facing: 'West · Kids play area' },
    ],
  },
  Block_Clubhouse: {
    displayName: 'The Clubhouse',
    tagline: '42,000 sq ft of Amenities',
    location: 'Central spine, adjoining the pool deck',
    floors: 'G + 1 Floors',
    configuration: 'Gym · Spa · Banquet · Lounge',
    price: null,
    facing: 'Overlooking the central green',
    possession: 'Ready with Phase 1',
    targetViewId: 'amenities-walkthrough',
  },
}

/**
 * Unit typologies. `targetViewId` is the walkthrough a unit of this type
 * opens — every 3BHK shares one plan, so they share one walkthrough. Like
 * tower targets this is a default the editor can override.
 */
export const unitTypes = {
  '3BHK': {
    label: '3 BHK',
    carpet: '1,420 sq ft',
    superArea: '1,950 sq ft',
    superSqft: 1950,
    targetViewId: '3bhk-walkthrough',
  },
  '4BHK': { label: '4 BHK', carpet: '1,980 sq ft', superArea: '2,650 sq ft', superSqft: 2650, targetViewId: null },
  '5BHK': { label: '5 BHK', carpet: '2,760 sq ft', superArea: '3,600 sq ft', superSqft: 3600, targetViewId: null },
}

// Illustrative commercial terms: a preferential location charge per floor
// above the 4th, in ₹ per sq ft — how Gurugram towers price height.
const FLOOR_RISE = 40
const STATUS = ['Available', 'Available', 'Available', 'Available', 'Available', 'Available', 'Booked', 'Booked', 'Sold', 'Sold']

/** Stable pseudo-random availability, so a floor looks the same every visit. */
function statusFor(key) {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return STATUS[hash % STATUS.length]
}

/**
 * The units on one floor of one tower, with price including floor rise. Never
 * throws: a building without unit data simply has no units.
 */
export function getFloorUnits(towerName, floorNumber) {
  const meta = towerName ? lookup.get(towerName.toLowerCase()) : null
  if (!meta?.units) return []
  const rate = meta.rate ? meta.rate + Math.max(0, floorNumber - 4) * FLOOR_RISE : null
  return meta.units.map((unit) => {
    const type = unitTypes[unit.type] ?? { label: unit.type }
    const crore = rate && type.superSqft ? (rate * type.superSqft) / 1e7 : null
    return {
      id: `${towerName}-${floorNumber}${unit.code}`,
      code: `${floorNumber}${unit.code}`,
      type: unit.type,
      typeLabel: type.label,
      carpet: type.carpet,
      superArea: type.superArea,
      facing: unit.facing,
      price: crore ? `₹${crore.toFixed(2)} Cr` : null,
      status: statusFor(`${towerName}-${floorNumber}-${unit.code}`),
    }
  })
}

const lookup = new Map(
  Object.entries(towerMetadata).map(([key, value]) => [key.toLowerCase(), value]),
)

/**
 * Never throws and never returns undefined — an unnamed or unknown building
 * still deserves a panel, just a plainer one.
 */
export function getTowerMetadata(name) {
  const match = name ? lookup.get(name.toLowerCase()) : null
  if (match) return { ...match, isPlaceholder: false, sourceName: name }

  return {
    displayName: 'Selected Building',
    tagline: name ?? 'Unnamed object',
    location: null,
    floors: null,
    configuration: null,
    price: null,
    facing: null,
    possession: null,
    targetViewId: null,
    isPlaceholder: true,
    sourceName: name,
  }
}
