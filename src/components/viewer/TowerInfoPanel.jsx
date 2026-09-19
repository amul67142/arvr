import { useState } from 'react'

import { getTowerMetadata } from '../../data/towerMetadata'
import { useViewer } from '../../state/viewerStore'
import { ArrowIcon, CloseIcon } from '../common/Icons'

/**
 * Right-hand sales panel. Content is kept mounted through the exit transition
 * so the panel slides out with its text intact instead of blanking first.
 */
export default function TowerInfoPanel() {
  const { selection, clearSelection } = useViewer()
  const [rendered, setRendered] = useState(selection)

  // Keep the last selection on screen through the exit transition.
  if (selection && selection !== rendered) setRendered(selection)

  const isOpen = Boolean(selection)
  const meta = rendered ? getTowerMetadata(rendered.name) : null

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
              <p className="label text-white/40">
                {meta.isPlaceholder
                  ? 'Model Object'
                  : meta.price
                    ? 'Residential Tower'
                    : 'Project Amenity'}
              </p>
              <h2 className="display mt-4 text-4xl text-white">{meta.displayName}</h2>
              <p className="mt-3 text-sm font-light text-white/45">{meta.tagline}</p>
              {meta.location ? (
                <p className="mt-2 text-xs leading-relaxed text-white/30">
                  {meta.location}
                </p>
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
            {meta.isPlaceholder ? (
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
                      <dd className="mt-2.5 text-base font-light text-white/90">
                        {value}
                      </dd>
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
              </>
            )}
          </div>

          <footer className="px-9 pt-2 pb-9">
            {/* Phase 2 entry point: this becomes Tower -> Floor -> Unit. */}
            <button
              type="button"
              disabled
              title="Floor and unit selection arrives in the next phase"
              className="label flex w-full items-center justify-between border border-white/15 px-6 py-4 text-white/45 transition-colors duration-500 disabled:cursor-not-allowed"
            >
              Explore Tower
              <ArrowIcon size={15} />
            </button>
            <p className="mt-4 text-center text-[11px] tracking-wider text-white/25">
              Floor plans available in the next release
            </p>
          </footer>
        </>
      ) : null}
    </aside>
  )
}
