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
  },
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
    isPlaceholder: true,
    sourceName: name,
  }
}
