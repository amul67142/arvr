import { useCallback, useMemo, useState } from 'react'

const FAVOURITES_KEY = 'showcase:favourites'

/** The compass part of a facing filters; the rest only describes. */
const facingOf = (unit) => unit.facing?.split('·')[0].trim() ?? null

function readFavourites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVOURITES_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

/**
 * The inventory filters Panom offers — BHK, area range, facing, floor,
 * availability — plus a shortlist. Filters dim flats on the render rather
 * than hide them, so the buyer never loses their bearings.
 */
export function useInventoryFilters(units) {
  const bounds = useMemo(() => {
    const areas = units.map((u) => u.sbua).filter(Number.isFinite)
    return { min: Math.min(...areas, 0), max: Math.max(...areas, 0) }
  }, [units])

  const [bhk, setBhk] = useState(() => new Set())
  const [facing, setFacing] = useState(() => new Set())
  const [floor, setFloor] = useState(null)
  const [maxArea, setMaxArea] = useState(null)
  const [availableOnly, setAvailableOnly] = useState(false)
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  const [favourites, setFavourites] = useState(readFavourites)

  const toggle = (setter) => (value) =>
    setter((current) => {
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })

  const toggleFavourite = useCallback((id) => {
    setFavourites((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...next]))
      } catch {
        // A private window: the shortlist lasts for this visit only.
      }
      return next
    })
  }, [])

  const matches = useCallback(
    (unit) =>
      (bhk.size === 0 || bhk.has(unit.bhk)) &&
      (facing.size === 0 || facing.has(facingOf(unit))) &&
      (floor === null || unit.floor === floor) &&
      (maxArea === null || !Number.isFinite(unit.sbua) || unit.sbua <= maxArea) &&
      (!availableOnly || unit.status === 'Available') &&
      (!favouritesOnly || favourites.has(unit.id)),
    [availableOnly, bhk, facing, favourites, favouritesOnly, floor, maxArea],
  )

  const options = useMemo(
    () => ({
      bhk: [...new Set(units.map((u) => u.bhk).filter(Boolean))].sort(),
      facing: [...new Set(units.map(facingOf).filter(Boolean))].sort(),
      floors: [...new Set(units.map((u) => u.floor))].sort((a, b) => a - b),
    }),
    [units],
  )

  const reset = () => {
    setBhk(new Set())
    setFacing(new Set())
    setFloor(null)
    setMaxArea(null)
    setAvailableOnly(false)
    setFavouritesOnly(false)
  }

  return {
    bounds,
    options,
    bhk,
    toggleBhk: toggle(setBhk),
    facing,
    toggleFacing: toggle(setFacing),
    floor,
    setFloor,
    maxArea: maxArea ?? bounds.max,
    setMaxArea,
    availableOnly,
    setAvailableOnly,
    favouritesOnly,
    setFavouritesOnly,
    favourites,
    toggleFavourite,
    matches,
    reset,
  }
}
