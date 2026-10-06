import { useEffect, useRef } from 'react'

import { CloseIcon } from '../common/Icons'
import { areaText, priceText } from './unitText'

const STATUS_STYLE = {
  Available: 'text-emerald-300/85',
  Booked: 'text-amber-200/80',
  Sold: 'text-white/30',
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="label border border-white/12 px-3 py-1.5 text-white/60 transition-colors duration-300 hover:border-white/40 data-[active=true]:border-white data-[active=true]:bg-white data-[active=true]:text-neutral-950"
    >
      {children}
    </button>
  )
}

/**
 * The inventory beside the render, as Panom shows it: filters on top, one card
 * per flat below. Hovering a card lights the flat on the render; the flat
 * hovered on the render scrolls its card into view.
 */
export default function InventoryPanel({ units, filters, hoveredId, selectedId, onHover, onSelect, onClose, colorFor }) {
  const listRef = useRef(null)
  const shown = units.filter(filters.matches)

  useEffect(() => {
    if (!hoveredId) return
    listRef.current
      ?.querySelector(`[data-unit="${hoveredId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [hoveredId])

  const f = filters
  const activeCount =
    f.bhk.size +
    f.facing.size +
    Number(f.floor !== null) +
    Number(f.maxArea < f.bounds.max) +
    Number(f.availableOnly) +
    Number(f.favouritesOnly)

  return (
    <aside className="glass z-30 flex h-full w-[360px] shrink-0 flex-col border-l">
      <header className="flex items-center justify-between px-6 pt-24 pb-4">
        <div>
          <p className="label text-white/40">Inventory</p>
          <p className="display mt-1 text-2xl text-white">
            {shown.length} <span className="text-white/35">of {units.length} flats</span>
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close inventory" className="ctrl px-3">
          <CloseIcon size={15} />
        </button>
      </header>

      <div className="space-y-4 border-y border-white/10 px-6 py-5">
        <div className="flex flex-wrap gap-1.5">
          {f.options.bhk.map((n) => (
            <Chip key={n} active={f.bhk.has(n)} onClick={() => f.toggleBhk(n)}>
              {n} BHK
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {f.options.facing.map((dir) => (
            <Chip key={dir} active={f.facing.has(dir)} onClick={() => f.toggleFacing(dir)}>
              {dir}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={f.floor === null} onClick={() => f.setFloor(null)}>
            All floors
          </Chip>
          {f.options.floors.map((n) => (
            <Chip key={n} active={f.floor === n} onClick={() => f.setFloor(f.floor === n ? null : n)}>
              {n === 0 ? 'G' : n}
            </Chip>
          ))}
        </div>
        <label className="block">
          <span className="label flex justify-between text-white/40">
            <span>Max area</span>
            <span className="text-white/70">{f.maxArea.toLocaleString('en-IN')} sq ft</span>
          </span>
          <input
            type="range"
            min={f.bounds.min}
            max={f.bounds.max}
            step={10}
            value={f.maxArea}
            onChange={(event) => f.setMaxArea(Number(event.target.value))}
            className="mt-2 w-full accent-white"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={f.availableOnly} onClick={() => f.setAvailableOnly(!f.availableOnly)}>
            Available only
          </Chip>
          <Chip active={f.favouritesOnly} onClick={() => f.setFavouritesOnly(!f.favouritesOnly)}>
            ♥ Shortlist ({f.favourites.size})
          </Chip>
          {activeCount ? (
            <button type="button" onClick={f.reset} className="label ml-auto text-white/40 hover:text-white">
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <ul
        ref={listRef}
        className="scroll-thin flex-1 space-y-2 overflow-y-auto px-4 py-4"
        onPointerLeave={() => onHover(null)}
      >
        {shown.map((unit) => (
          <li key={unit.id}>
            <button
              type="button"
              data-unit={unit.id}
              data-active={hoveredId === unit.id || selectedId === unit.id}
              onPointerEnter={() => onHover(unit.id)}
              onClick={() => onSelect(unit.id)}
              className="w-full border border-l-4 border-white/10 px-4 py-3 text-left transition-colors duration-200 hover:bg-white/[0.05] data-[active=true]:border-white/40 data-[active=true]:bg-white/[0.07]"
              style={{ borderLeftColor: colorFor(unit) }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="display text-lg text-white">{unit.flatNo}</p>
                <p className={`label ${STATUS_STYLE[unit.status] ?? 'text-white/40'}`}>{unit.status}</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <span className="text-white/40">BHK</span>
                <span className="text-white/80">{unit.bhk ?? '—'}</span>
                <span className="text-white/40">Super area</span>
                <span className="text-white/80">{areaText(unit.sbua)}</span>
                <span className="text-white/40">Carpet</span>
                <span className="text-white/80">{areaText(unit.carpet)}</span>
                <span className="text-white/40">Facing</span>
                <span className="text-white/80">{unit.facing ?? '—'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[14px] text-white/90">{priceText(unit)}</span>
                {f.favourites.has(unit.id) ? <span className="text-rose-300">♥</span> : null}
              </div>
            </button>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-2 py-8 text-center text-sm text-white/40">No flats match these filters.</li>
        ) : null}
      </ul>
    </aside>
  )
}
