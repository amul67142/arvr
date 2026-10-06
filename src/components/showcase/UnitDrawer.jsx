import { ArrowIcon, CloseIcon } from '../common/Icons'
import UnitPlan from './UnitPlan'
import { areaText, bhkText, priceText, unitSummary } from './unitText'

/**
 * One flat, in full: its details, price, the interior renders of its type,
 * and the shortlist heart.
 */
/**
 * `plan` (optional) is the home type's floor plan. `experiences` (optional)
 * lists the ways into this home — [{ label, onOpen }], e.g. a 360° tour and a
 * 3D walkthrough. An empty list says none exists yet for this home type.
 */
export default function UnitDrawer({ unit, manifest, favourite, onFavourite, onImage, onClose, plan, experiences }) {
  const interiors = (unit.interiors ?? []).map((id) => manifest.interiors[id]).filter(Boolean)
  const rows = [
    ['Floor', unit.floorLabel ? `${unit.floorLabel} floor` : null],
    ['Configuration', bhkText(unit)],
    ['Super built-up area', Number.isFinite(unit.sbua) ? areaText(unit.sbua) : null],
    ['Carpet area', Number.isFinite(unit.carpet) ? areaText(unit.carpet) : null],
    ['Facing', unit.facing],
    ['Status', unit.status],
  ].filter(([, value]) => value)

  return (
    <aside className="glass view-enter absolute top-0 right-0 z-40 flex h-full w-full max-w-[400px] flex-col border-l">
      <header className="flex items-start justify-between px-8 pt-24 pb-6">
        <div>
          <p className="label text-white/40">{manifest.building?.label}</p>
          <h2 className="display mt-3 text-4xl text-white">{unit.flatNo}</h2>
          <p className="mt-2 text-sm text-white/50">
            {unitSummary(unit, { facing: 'none' }) || 'Details on request'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close flat" className="ctrl -mr-2 px-3">
          <CloseIcon size={16} />
        </button>
      </header>
      <div className="hairline mx-8 h-px" />

      <div className="scroll-thin flex-1 overflow-y-auto px-8 py-6">
        <dl className="space-y-4">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="label text-white/35">{label}</dt>
              <dd className="text-right text-sm text-white/85">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 border-t border-white/10 pt-6">
          <p className="label text-white/35">Price</p>
          <p className="display mt-2 text-3xl text-white">{priceText(unit)}</p>
          <p className="mt-2 text-xs text-white/30">
            Indicative, including floor rise. Excludes registration and other charges.
          </p>
        </div>

        {plan ? (
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="label text-white/35">Floor plan{unit.bhk ? ` · ${unit.bhk} BHK` : ''}</p>
            <div className="mt-4 border border-white/10 bg-black/20 p-3">
              <UnitPlan plan={plan} />
            </div>
          </div>
        ) : null}

        {interiors.length ? (
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="label text-white/35">Interior renders</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {interiors.map((item) => (
                <button key={item.label} type="button" onClick={() => onImage(item)} className="group text-left">
                  <img
                    src={manifest.base + item.image}
                    alt={item.label}
                    className="aspect-[4/3] w-full object-cover opacity-85 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <p className="mt-1.5 text-[12px] text-white/60">{item.label}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="flex flex-col gap-2 px-8 pt-2 pb-8">
        {experiences?.map((item, index) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onOpen}
            className={`label flex items-center justify-between px-5 py-4 transition-colors duration-300 ${
              index === 0
                ? 'bg-white text-neutral-950 hover:bg-white/85'
                : 'border border-white/30 text-white/85 hover:bg-white/10'
            }`}
          >
            {item.label}
            <ArrowIcon size={15} />
          </button>
        ))}
        {experiences && experiences.length === 0 ? (
          <p className="border border-white/10 px-5 py-3.5 text-center text-[12px] text-white/40">
            {unit.bhk ? `A tour of ${unit.bhk} BHK homes is coming soon` : 'A tour of this home is coming soon'}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onFavourite}
          className="label flex-1 border border-white/25 px-4 py-3.5 text-white/85 transition-colors duration-300 hover:bg-white/10"
        >
          {favourite ? '♥ Shortlisted' : '♡ Shortlist'}
        </button>
      </footer>
    </aside>
  )
}
