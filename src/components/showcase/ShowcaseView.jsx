import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { assetBase } from '../../experience/assetSources'
import { ArrowIcon, CloseIcon } from '../common/Icons'
import InventoryPanel from './InventoryPanel'
import { useInventoryFilters } from './useInventoryFilters'
import UnitDrawer from './UnitDrawer'

const MODES = [
  { id: 'building', label: 'Building' },
  { id: 'floors', label: 'Floors' },
  { id: 'units', label: 'Flats' },
  { id: 'amenities', label: 'Amenities' },
]

const points = (shape) => shape.points.map(([x, y]) => `${x},${y}`).join(' ')

/**
 * Panom's technique on our own terms: real renders, fixed "stop" views, and
 * a clickable layer traced onto each one — the building, every floor, every
 * flat, amenity pins. Nothing here draws architecture; it only outlines it.
 *
 * The inventory panel and the render are two views of one list: hovering a
 * card lights the flat on the render, hovering the render lights the card.
 */
export default function ShowcaseView({ asset }) {
  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)
  const [stopIndex, setStopIndex] = useState(0)
  const [mode, setMode] = useState('units')
  const [hovered, setHovered] = useState(null) // { id, kind, x, y }
  const [selectedId, setSelectedId] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [overlays, setOverlays] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [view, setView] = useState(null) // current viewBox [x, y, w, h]
  const wrapRef = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch(asset.url)
      .then((response) => response.json())
      .then((data) => !cancelled && setManifest({ ...data, base: assetBase(asset) }))
      .catch((reason) => !cancelled && setError(String(reason?.message ?? reason)))
    return () => {
      cancelled = true
    }
  }, [asset])

  const units = useMemo(() => manifest?.units ?? [], [manifest])
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])
  const filters = useInventoryFilters(units)

  // Each stop opens framed on its building; the render beyond still shows.
  const stopFocus = useCallback(
    (index) => {
      const stop = manifest?.stops[index]
      if (!stop) return null
      const [x0, y0, x1, y1] = stop.focus ?? [0, 0, stop.width, stop.height]
      return [x0, y0, x1 - x0, y1 - y0]
    },
    [manifest],
  )
  const goToStop = (index) => {
    setStopIndex(index)
    setView(stopFocus(index))
  }

  // Wheel zooms around the pointer; drag pans. The SVG's viewBox is the camera.
  const onWheel = (event) => {
    const svg = event.currentTarget
    const current = view ?? stopFocus(stopIndex)
    const box = svg.getBoundingClientRect()
    const scale = Math.min(box.width / current[2], box.height / current[3])
    const offsetX = (box.width - current[2] * scale) / 2
    const offsetY = (box.height - current[3] * scale) / 2
    const px = current[0] + (event.clientX - box.left - offsetX) / scale
    const py = current[1] + (event.clientY - box.top - offsetY) / scale
    const factor = Math.exp(event.deltaY * 0.0015)
    const base = stopFocus(stopIndex)
    const w = Math.min(base[2] * 1.6, Math.max(base[2] / 4, current[2] * factor))
    const h = (w / current[2]) * current[3]
    setView([px - ((px - current[0]) * w) / current[2], py - ((py - current[1]) * h) / current[3], w, h])
  }
  const onPointerDown = (event) => {
    drag.current = { x: event.clientX, y: event.clientY, view: view ?? stopFocus(stopIndex), moved: false }
  }
  const onPointerMove = (event) => {
    const d = drag.current
    if (!d || event.buttons !== 1) return
    const box = event.currentTarget.getBoundingClientRect()
    const scale = Math.min(box.width / d.view[2], box.height / d.view[3])
    const dx = (event.clientX - d.x) / scale
    const dy = (event.clientY - d.y) / scale
    if (Math.abs(dx) + Math.abs(dy) > 4 / scale) d.moved = true
    if (d.moved) setView([d.view[0] - dx, d.view[1] - dy, d.view[2], d.view[3]])
  }

  // Preload every stop so switching views is instant.
  useEffect(() => {
    manifest?.stops.forEach((stop) => {
      const image = new Image()
      image.src = manifest.base + stop.image
    })
  }, [manifest])

  if (error) return <div className="grid h-full place-items-center text-sm text-white/50">{error}</div>
  if (!manifest) {
    return (
      <div className="grid h-full place-items-center">
        <p className="label text-white/45">Loading renders…</p>
      </div>
    )
  }

  const stop = manifest.stops[stopIndex]
  const src = manifest.base + stop.image
  const viewBox = view ?? stopFocus(stopIndex)
  const shapes = stop.shapes.filter((shape) =>
    mode === 'building' ? shape.kind === 'building' : mode === 'floors' ? shape.kind === 'floor' : mode === 'units' ? shape.kind === 'unit' : false,
  )
  // Wide shots have no flat or floor outlines: fall back to the building.
  const shown = shapes.length || mode === 'amenities' ? shapes : stop.shapes.filter((s) => s.kind === 'building')
  const pins = mode === 'amenities' || mode === 'building' ? stop.pins : []

  const colorFor = (unit) =>
    unit.status === 'Sold' ? '#8a8a8a' : manifest.typeColors[unit.type] ?? '#ffffff'

  const trackPointer = (event, shape) => {
    const box = wrapRef.current?.getBoundingClientRect()
    if (!box) return
    setHovered({ id: shape.id, kind: shape.kind, x: event.clientX - box.left, y: event.clientY - box.top, width: box.width })
  }

  const clickShape = (shape) => {
    if (drag.current?.moved) return
    if (shape.kind === 'unit') setSelectedId(shape.id)
    if (shape.kind === 'floor') {
      filters.setFloor(shape.floor)
      setMode('units')
    }
    if (shape.kind === 'building') {
      // Flats are traced on the elevation; take the buyer there.
      const withUnits = manifest.stops.findIndex((s) => s.shapes.some((sh) => sh.kind === 'unit'))
      if (withUnits >= 0) goToStop(withUnits)
      setMode('units')
    }
  }

  const floorStats = (floor) => {
    const onFloor = units.filter((u) => u.floor === floor)
    return `${onFloor.filter((u) => u.status === 'Available').length} of ${onFloor.length} available`
  }

  const hoveredUnit = hovered?.kind === 'unit' ? unitById.get(hovered.id) : null
  const selected = selectedId ? unitById.get(selectedId) : null

  return (
    <div className="absolute inset-0 flex bg-neutral-950">
      <div ref={wrapRef} className="relative min-w-0 flex-1 overflow-hidden">
        {/* The render fills the frame; a blurred copy fills any letterbox. */}
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-60 blur-2xl"
          style={{ backgroundImage: `url(${src})` }}
        />
        <svg
          key={stop.id}
          viewBox={viewBox.join(' ')}
          preserveAspectRatio="xMidYMid meet"
          className="view-enter absolute inset-0 h-full w-full cursor-grab touch-none overflow-visible active:cursor-grabbing"
          onPointerLeave={() => setHovered(null)}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setTimeout(() => (drag.current = null))}
          onDoubleClick={() => setView(stopFocus(stopIndex))}
        >
          <defs>
            <filter id="showcase-glow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <image href={src} width={stop.width} height={stop.height} />

          {overlays
            ? shown.map((shape) => {
                const unit = shape.kind === 'unit' ? unitById.get(shape.id) : null
                const matches = !unit || filters.matches(unit)
                const isHover = hovered?.id === shape.id
                const isSelected = selectedId === shape.id
                const color = unit ? colorFor(unit) : '#ffffff'
                const base = unit ? (matches ? 0.28 : 0.04) : shape.kind === 'floor' ? 0.06 : 0
                const fillOpacity = isHover || isSelected ? Math.max(base, 0.1) + 0.32 : base
                return (
                  <polygon
                    key={shape.id}
                    points={points(shape)}
                    fill={shape.kind === 'floor' && isHover ? '#e0ad62' : color}
                    fillOpacity={fillOpacity}
                    stroke="white"
                    strokeOpacity={unit && !matches ? 0.15 : isHover || isSelected ? 1 : 0.7}
                    strokeWidth={isHover || isSelected ? 5 : shape.kind === 'building' ? 4 : 2}
                    strokeLinejoin="round"
                    filter={shape.kind === 'building' || isHover || isSelected ? 'url(#showcase-glow)' : undefined}
                    className="cursor-pointer transition-[fill-opacity,stroke-width] duration-200"
                    onPointerMove={(event) => trackPointer(event, shape)}
                    onClick={() => clickShape(shape)}
                  />
                )
              })
            : null}

          {overlays
            ? pins.map((pin) => (
                <g
                  key={pin.id}
                  transform={`translate(${pin.at[0]} ${pin.at[1]})`}
                  className="cursor-pointer"
                  onClick={() => setLightbox(manifest.amenities[pin.amenity])}
                >
                  <circle r="30" fill="rgba(10,10,10,0.85)" stroke="white" strokeWidth="5" />
                  <circle r="9" fill="white" />
                  <rect x="44" y="-30" width={pin.label.length * 24 + 40} height="60" rx="12" fill="rgba(10,10,10,0.85)" />
                  <text x="64" y="12" fill="white" fontSize="34" fontFamily="inherit">
                    {pin.label}
                  </text>
                </g>
              ))
            : null}

          {overlays && mode === 'building'
            ? stop.shapes
                .filter((s) => s.kind === 'building' && s.pin)
                .map((s) => (
                  <g key={`label-${s.id}`} transform={`translate(${s.pin[0]} ${s.pin[1]})`} pointerEvents="none">
                    <line y2="-110" stroke="white" strokeWidth="3" />
                    <circle r="10" fill="white" />
                    <rect x="-150" y="-190" width="300" height="80" rx="16" fill="rgba(10,10,10,0.85)" />
                    <text y="-138" textAnchor="middle" fill="white" fontSize="40" fontFamily="inherit">
                      {s.label}
                    </text>
                  </g>
                ))
            : null}
        </svg>

        {/* Hover card, following the pointer. */}
        {hovered && overlays ? (
          <div
            className="glass pointer-events-none absolute z-20 min-w-[180px] px-4 py-3"
            style={{ left: Math.min(hovered.x + 18, (hovered.width ?? 0) - 220), top: hovered.y + 18 }}
          >
            {hoveredUnit ? (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="display text-xl text-white">{hoveredUnit.flatNo}</p>
                  <p className={`label ${hoveredUnit.status === 'Available' ? 'text-emerald-300/85' : 'text-white/40'}`}>
                    {hoveredUnit.status}
                  </p>
                </div>
                <p className="mt-1 text-[12px] text-white/70">
                  {hoveredUnit.bhk} BHK · {hoveredUnit.sbua.toLocaleString('en-IN')} sq ft
                </p>
                <p className="text-[12px] text-white/45">{hoveredUnit.floorLabel} floor · {hoveredUnit.facing}</p>
              </>
            ) : hovered.kind === 'floor' ? (
              <>
                <p className="display text-xl text-white">
                  {stop.shapes.find((s) => s.id === hovered.id)?.label}
                </p>
                <p className="mt-1 text-[12px] text-white/60">
                  {floorStats(stop.shapes.find((s) => s.id === hovered.id)?.floor)} · click to pick a flat
                </p>
              </>
            ) : (
              <>
                <p className="display text-xl text-white">{manifest.building.label}</p>
                <p className="mt-1 text-[12px] text-white/60">
                  {units.length} flats · {units.filter((u) => u.status === 'Available').length} available
                </p>
              </>
            )}
          </div>
        ) : null}

        {/* Bottom bar: views, modes, overlays. */}
        <div className="glass absolute bottom-6 left-1/2 z-20 flex max-w-[94%] -translate-x-1/2 items-center gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
          <button
            type="button"
            aria-label="Previous view"
            onClick={() => goToStop((stopIndex - 1 + manifest.stops.length) % manifest.stops.length)}
            className="ctrl px-3"
          >
            <span className="rotate-180">
              <ArrowIcon size={14} />
            </span>
          </button>
          <p className="label w-32 shrink-0 text-center text-white/70">{stop.label}</p>
          <button
            type="button"
            aria-label="Next view"
            onClick={() => goToStop((stopIndex + 1) % manifest.stops.length)}
            className="ctrl px-3"
          >
            <ArrowIcon size={14} />
          </button>
          <span className="mx-2 h-6 w-px shrink-0 bg-white/15" />
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              data-active={mode === m.id}
              onClick={() => setMode(m.id)}
              className="label shrink-0 px-3.5 py-2 text-white/55 transition-colors duration-300 hover:text-white data-[active=true]:bg-white data-[active=true]:text-neutral-950"
            >
              {m.label}
            </button>
          ))}
          <span className="mx-2 h-6 w-px shrink-0 bg-white/15" />
          <button type="button" onClick={() => setOverlays((v) => !v)} className="label shrink-0 px-3 py-2 text-white/55 hover:text-white">
            {overlays ? 'Hide outlines' : 'Show outlines'}
          </button>
          {!panelOpen ? (
            <button type="button" onClick={() => setPanelOpen(true)} className="label shrink-0 px-3 py-2 text-white/55 hover:text-white">
              Inventory
            </button>
          ) : null}
        </div>

        {mode === 'units' && overlays ? (
          <div className="glass pointer-events-none absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 gap-4 px-4 py-2.5">
            {Object.entries(manifest.typeColors).map(([type, color]) => (
              <span key={type} className="label flex items-center gap-2 text-white/70">
                <span className="h-2.5 w-2.5" style={{ background: color }} />
                {type.replace('BHK', ' BHK')}
              </span>
            ))}
            <span className="label flex items-center gap-2 text-white/40">
              <span className="h-2.5 w-2.5 bg-[#8a8a8a]" />
              Sold
            </span>
          </div>
        ) : null}

        <p className="pointer-events-none absolute bottom-1 left-3 z-10 text-[10px] text-white/35">
          Renders for demonstration · {manifest.source}
        </p>
      </div>

      {panelOpen ? (
        <InventoryPanel
          units={units}
          filters={filters}
          hoveredId={hoveredUnit?.id ?? null}
          selectedId={selectedId}
          onHover={(id) => setHovered(id ? { id, kind: 'unit', x: -9999, y: -9999 } : null)}
          onSelect={(id) => {
            setSelectedId(id)
            setMode('units')
            const withUnit = manifest.stops.findIndex((s) => s.shapes.some((sh) => sh.id === id))
            if (withUnit >= 0 && withUnit !== stopIndex) goToStop(withUnit)
          }}
          onClose={() => setPanelOpen(false)}
          colorFor={colorFor}
        />
      ) : null}

      {selected ? (
        <UnitDrawer
          unit={selected}
          manifest={manifest}
          favourite={filters.favourites.has(selected.id)}
          onFavourite={() => filters.toggleFavourite(selected.id)}
          onImage={setLightbox}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {lightbox ? (
        <div className="view-enter absolute inset-0 z-50 grid place-items-center bg-black/85 p-8" onClick={() => setLightbox(null)}>
          <figure className="relative max-h-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <img src={manifest.base + lightbox.image} alt={lightbox.label} className="max-h-[78vh] w-auto object-contain" />
            <figcaption className="mt-4 flex items-start justify-between gap-6">
              <div>
                <p className="display text-2xl text-white">{lightbox.label}</p>
                {lightbox.text ? <p className="mt-1 text-sm text-white/55">{lightbox.text}</p> : null}
              </div>
              <button type="button" onClick={() => setLightbox(null)} aria-label="Close" className="ctrl px-3">
                <CloseIcon size={16} />
              </button>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </div>
  )
}
