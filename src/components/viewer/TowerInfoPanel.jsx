import { useState } from 'react'

import { getFloorUnits, getTowerMetadata } from '../../data/towerMetadata'
import { MODES, useExperience } from '../../experience/experienceStore'
import { useViewer } from '../../state/viewerStore'
import { ArrowIcon, CloseIcon } from '../common/Icons'

const STATUS_STYLE = {
  Available: 'text-emerald-300/85',
  Booked: 'text-amber-200/80',
  Sold: 'text-white/30',
}

/** Every floor of the building as a grid, top floor first — it reads like the tower. */
function FloorPicker({ floors, onPick, onPreview }) {
  const ordered = [...floors].reverse()
  return (
    <div className="mt-10 border-t border-white/10 pt-8">
      <div className="flex items-baseline justify-between">
        <p className="label text-white/35">Select a Floor</p>
        <p className="text-[11px] text-white/25">{floors.length} floors</p>
      </div>
      <div className="mt-5 grid grid-cols-6 gap-1.5" onMouseLeave={() => onPreview(null)}>
        {ordered.map((floor) => (
          <button
            key={floor.id}
            type="button"
            onClick={() => onPick(floor)}
            onMouseEnter={() => onPreview(floor.id)}
            onFocus={() => onPreview(floor.id)}
            className="border border-white/10 py-2 text-[12px] tabular-nums text-white/60 transition-colors duration-300 hover:border-white/60 hover:bg-white hover:text-neutral-950 focus-visible:border-white/60 focus-visible:outline-none"
          >
            {floor.number}
          </button>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-white/30">
        Or click a floor directly on the tower.
      </p>
    </div>
  )
}

/** The units on one floor, each with a way inside. */
function FloorUnits({ towerName, towerLabel, floor, onWalk }) {
  const { resolveUnitTypeTarget, views, mode } = useExperience()
  const units = getFloorUnits(towerName, floor.number)

  if (units.length === 0) {
    return (
      <p className="mt-8 text-sm leading-relaxed text-white/45">
        No unit plans are recorded for this floor yet.
      </p>
    )
  }

  return (
    <ul className="mt-8 space-y-3">
      {units.map((unit) => {
        const targetId = resolveUnitTypeTarget(unit.type)
        const target = targetId ? views.find((view) => view.id === targetId) : null
        return (
          <li key={unit.id} className="border border-white/10 px-5 py-4">
            <div className="flex items-baseline justify-between">
              <p className="display text-2xl text-white">{unit.code}</p>
              <p className={`label ${STATUS_STYLE[unit.status] ?? 'text-white/40'}`}>{unit.status}</p>
            </div>
            <p className="mt-2 text-[13px] font-light text-white/75">
              {unit.typeLabel}
              {unit.superArea ? <span className="text-white/35"> · {unit.superArea}</span> : null}
            </p>
            <p className="mt-1 text-[12px] text-white/40">{unit.facing}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[15px] text-white/90">{unit.price ?? '—'}</p>
              <button
                type="button"
                disabled={!target}
                onClick={() =>
                  target &&
                  onWalk(target.id, {
                    title: `Unit ${unit.code} · ${unit.typeLabel}`,
                    subtitle: `${towerLabel} · Floor ${floor.number}`,
                  })
                }
                title={target ? `Opens ${target.name}` : 'No walkthrough for this unit type yet'}
                className="label flex items-center gap-2 border px-4 py-2.5 transition-colors duration-500 enabled:border-white enabled:bg-white enabled:text-neutral-950 enabled:hover:bg-white/85 disabled:cursor-not-allowed disabled:border-white/15 disabled:text-white/35"
              >
                Walkthrough
                <ArrowIcon size={13} />
              </button>
            </div>
          </li>
        )
      })}
      {mode === MODES.EDITOR && units.some((unit) => !resolveUnitTypeTarget(unit.type)) ? (
        <li className="pt-2 text-[11px] leading-relaxed text-white/25">
          Link a walkthrough to a unit type in the editor to enable its button.
        </li>
      ) : null}
    </ul>
  )
}

/**
 * Right-hand sales panel: the building, then — once a floor is chosen — the
 * homes on that floor. Content is kept mounted through the exit transition so
 * the panel slides out with its text intact instead of blanking first.
 */
export default function TowerInfoPanel() {
  const { selection, clearSelection, selectTower, selectFloor, model, floorPreviewRef } =
    useViewer()
  const { resolveTowerTarget, navigateToView, views, mode } = useExperience()
  const [rendered, setRendered] = useState(selection)

  // Keep the last selection on screen through the exit transition.
  if (selection && selection !== rendered) setRendered(selection)

  const isOpen = Boolean(selection)
  const meta = rendered ? getTowerMetadata(rendered.name) : null
  const entry = rendered ? model?.towers.find((tower) => tower.id === rendered.id) : null
  const floors = entry?.floors ?? []
  const floor = rendered?.level === 'floor' ? rendered.floor : null

  // Where EXPLORE leads, if anywhere. Resolution (editor override, then the
  // metadata default, and only if that view has its file) lives in the
  // experience layer — this panel never names a specific tower.
  const targetViewId = rendered ? resolveTowerTarget(rendered.name) : null
  const targetView = targetViewId ? views.find((view) => view.id === targetViewId) : null
  const isEditor = mode === MODES.EDITOR
  const isAmenity = Boolean(meta && !meta.isPlaceholder && !meta.price)

  const preview = (floorId) => floorPreviewRef.current?.(floorId)

  const rows = meta
    ? [
        ['Configuration', meta.configuration],
        ['Floors', meta.floors],
        ['Orientation', meta.facing],
        ['Handover', meta.possession],
      ].filter(([, value]) => Boolean(value))
    : []

  return (
    <aside
      data-open={isOpen}
      aria-hidden={!isOpen}
      className="glass pointer-events-none absolute top-0 right-0 z-30 flex h-full w-full max-w-[400px] translate-x-full flex-col border-l transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[open=true]:pointer-events-auto data-[open=true]:translate-x-0 md:w-[400px]"
    >
      {meta ? (
        <>
          <header className="flex items-start justify-between px-9 pt-9 pb-7">
            <div>
              {floor ? (
                <button
                  type="button"
                  onClick={() => entry && selectTower(entry)}
                  className="label flex items-center gap-2 text-white/45 transition-colors duration-300 hover:text-white"
                >
                  <span className="rotate-180">
                    <ArrowIcon size={12} />
                  </span>
                  All floors
                </button>
              ) : (
                <p className="label text-white/40">
                  {meta.isPlaceholder
                    ? 'Model Object'
                    : isAmenity
                      ? 'Project Amenity'
                      : 'Residential Tower'}
                </p>
              )}
              <h2 className="display mt-4 text-4xl text-white">
                {floor ? `Floor ${floor.number}` : meta.displayName}
              </h2>
              <p className="mt-3 text-sm font-light text-white/45">
                {floor ? meta.displayName : meta.tagline}
              </p>
              {!floor && meta.location ? (
                <p className="mt-2 text-xs leading-relaxed text-white/30">{meta.location}</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={clearSelection}
              aria-label="Close tower details"
              className="ctrl -mt-1 -mr-3 px-3"
            >
              <CloseIcon size={16} />
            </button>
          </header>

          <div className="hairline mx-9 h-px" />

          <div className="scroll-thin flex-1 overflow-y-auto px-9 py-8">
            {floor ? (
              <>
                <p className="label text-white/35">Homes on this floor</p>
                <FloorUnits
                  towerName={rendered.name}
                  towerLabel={meta.displayName}
                  floor={floor}
                  onWalk={navigateToView}
                />
              </>
            ) : meta.isPlaceholder ? (
              <p className="text-sm leading-relaxed text-white/45">
                No sales information is mapped to this object yet. Name it
                <span className="mx-1 text-white/70">Tower_</span>,
                <span className="mx-1 text-white/70">Building_</span> or
                <span className="mx-1 text-white/70">Block_</span>
                in your 3D file to attach details.
              </p>
            ) : (
              <>
                <dl className="space-y-7">
                  {rows.map(([label, value]) => (
                    <div key={label}>
                      <dt className="label text-white/35">{label}</dt>
                      <dd className="mt-2.5 text-base font-light text-white/90">{value}</dd>
                    </div>
                  ))}
                </dl>

                {meta.price ? (
                  <div className="mt-10 border-t border-white/10 pt-8">
                    <p className="label text-white/35">Pricing</p>
                    <p className="display mt-3 text-3xl text-white">{meta.price}</p>
                    <p className="mt-3 text-xs text-white/30">
                      Indicative. Excludes registration and other charges.
                    </p>
                  </div>
                ) : null}

                {floors.length > 0 && entry ? (
                  <FloorPicker
                    floors={floors}
                    onPick={(picked) => selectFloor(entry, picked)}
                    onPreview={preview}
                  />
                ) : null}
              </>
            )}
          </div>

          {!floor ? (
            <footer className="px-9 pt-2 pb-9">
              <button
                type="button"
                disabled={!targetView}
                onClick={() => targetView && navigateToView(targetView.id)}
                className="label flex w-full items-center justify-between border px-6 py-4 transition-colors duration-500 enabled:border-white enabled:bg-white enabled:text-neutral-950 enabled:hover:bg-white/85 disabled:cursor-not-allowed disabled:border-white/15 disabled:text-white/45"
              >
                {isAmenity ? 'Explore Amenities' : 'Explore Tower'}
                <ArrowIcon size={15} />
              </button>

              {targetView ? (
                <p className="mt-4 text-center text-[11px] tracking-wider text-white/40">
                  Opens {targetView.name}
                </p>
              ) : isEditor ? (
                <p className="mt-4 text-center text-[11px] tracking-wider text-white/25">
                  Link a view to this building in the editor to enable
                </p>
              ) : null}
            </footer>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}
