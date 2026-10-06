/**
 * How a home's details read, whatever of them are known. A studio project
 * arrives with a full price list; a flat drawn on an uploaded video may have
 * only its number and floor until the builder's list is added.
 */
export const priceText = (unit) => (Number.isFinite(unit?.price) ? `₹${unit.price.toFixed(2)} Cr` : 'Price on request')

export const areaText = (value) => (Number.isFinite(value) ? `${value.toLocaleString('en-IN')} sq ft` : '—')

export const bhkText = (unit) => (unit?.bhk ? `${unit.bhk} BHK` : null)

/**
 * "3 BHK · 1,840 sq ft · North-West", leaving out whatever is missing.
 * `facing`: 'short' (compass only), 'full', or 'none'.
 */
export function unitSummary(unit, { facing = 'short' } = {}) {
  const facingText =
    !unit?.facing || facing === 'none' ? null : facing === 'short' ? unit.facing.split('·')[0].trim() : unit.facing
  return [bhkText(unit), Number.isFinite(unit?.sbua) ? areaText(unit.sbua) : null, facingText].filter(Boolean).join(' · ')
}
