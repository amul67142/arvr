import { useRef, useState } from 'react'

import { getTowerMetadata, unitTypes } from '../../data/towerMetadata'
import { pickMainFile } from '../../experience/assetSources'
import { MODES, useExperience } from '../../experience/experienceStore'
import { getViewType, isAcceptedFile, viewTypeLabel } from '../../experience/viewTypes'
import { formatBytes } from '../../utils/modelUtils'
import { AlertIcon, ArrowIcon, CloseIcon, CubeIcon } from '../common/Icons'

const pad = (index) => String(index + 1).padStart(2, '0')

/** Text that becomes an input on click, and commits on blur or Enter. */
function InlineEdit({ value, onCommit, className, inputClassName, label }) {
  const [draft, setDraft] = useState(null)

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(value)}
        title={`Rename ${label}`}
        className={`group block w-full text-left ${className}`}
      >
        {value}
        <span className="label ml-2 text-white/0 transition-colors duration-300 group-hover:text-white/35">
          Edit
        </span>
      </button>
    )
  }

  const commit = () => {
    onCommit(draft)
    setDraft(null)
  }

  return (
    <input
      autoFocus
      value={draft}
      aria-label={`Rename ${label}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') setDraft(null)
      }}
      className={`w-full border-b border-white/30 bg-transparent pb-1 outline-none ${inputClassName}`}
    />
  )
}

function ViewRow({ view, index, isCurrent, isStart, hasAsset, onSelect }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        data-current={isCurrent}
        className="group relative flex w-full items-start gap-4 px-7 py-4 text-left transition-colors duration-300 hover:bg-white/[0.04] data-[current=true]:bg-white/[0.07]"
      >
        <span
          aria-hidden
          className="absolute top-0 left-0 h-full w-px bg-white opacity-0 transition-opacity duration-300 group-data-[current=true]:opacity-100"
        />
        <span className="display pt-0.5 text-lg text-white/30 tabular-nums group-data-[current=true]:text-white/70">
          {pad(index)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-light text-white/80 group-data-[current=true]:text-white">
            {view.name}
          </span>
          <span className="label mt-1.5 flex items-center gap-2 text-white/35">
            {viewTypeLabel(view.type)}
            {isStart ? <span className="text-brass-300">· Start</span> : null}
            {!hasAsset ? (
              <span className="flex items-center gap-1 text-amber-200/70">
                · <AlertIcon size={11} /> No file
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  )
}

function TowerLinks({ view }) {
  const { views, viewTowers, towerTargets, assets, setTowerTarget } = useExperience()
  const towers = viewTowers[view.id] ?? []

  if (towers.length === 0) {
    return (
      <p className="px-7 text-xs leading-relaxed text-white/30">
        No named towers detected in this model. Name objects Tower_, Building_ or
        Block_ to link them to other views.
      </p>
    )
  }

  const targets = views.filter((candidate) => candidate.id !== view.id)

  return (
    <ul className="space-y-4 px-7">
      {towers.map((tower) => {
        const meta = getTowerMetadata(tower)
        const explicit = Object.prototype.hasOwnProperty.call(towerTargets, tower)
        const fallback = targets.some((target) => target.id === meta.targetViewId)
          ? meta.targetViewId
          : null
        const value = (explicit ? towerTargets[tower] : fallback) ?? ''
        const unattached = value && !assets[value]

        return (
          <li key={tower}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] font-light text-white/75">
                {meta.isPlaceholder ? tower : meta.displayName}
              </span>
              {!explicit && value ? (
                <span className="label shrink-0 text-white/25">Default</span>
              ) : null}
            </div>
            <select
              value={value}
              aria-label={`View opened by ${tower}`}
              onChange={(event) => setTowerTarget(tower, event.target.value)}
              className="mt-2 w-full cursor-pointer border border-white/12 bg-neutral-900 px-3 py-2.5 text-[13px] font-light text-white/80 outline-none transition-colors duration-300 hover:border-white/25 focus:border-white/40"
            >
              <option value="">No link</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
            {unattached ? (
              <p className="mt-1.5 text-[11px] text-amber-200/60">
                That view has no file yet — the button stays disabled until it does.
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Which view each unit typology opens. Every 3BHK shares one plan, so they
 * share one walkthrough; the metadata supplies a default, this overrides it.
 */
function UnitTypeLinks({ view }) {
  const { views, unitTypeTargets, assets, setUnitTypeTarget } = useExperience()
  const targets = views.filter((candidate) => candidate.id !== view.id)

  return (
    <ul className="space-y-4 px-7">
      {Object.entries(unitTypes).map(([type, spec]) => {
        const explicit = Object.prototype.hasOwnProperty.call(unitTypeTargets, type)
        const fallback = targets.some((target) => target.id === spec.targetViewId)
          ? spec.targetViewId
          : null
        const value = (explicit ? unitTypeTargets[type] : fallback) ?? ''
        const unattached = value && !assets[value]

        return (
          <li key={type}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-light text-white/75">{spec.label}</span>
              {!explicit && value ? (
                <span className="label shrink-0 text-white/25">Default</span>
              ) : null}
            </div>
            <select
              value={value}
              aria-label={`View opened by ${spec.label} units`}
              onChange={(event) => setUnitTypeTarget(type, event.target.value)}
              className="mt-2 w-full cursor-pointer border border-white/12 bg-neutral-900 px-3 py-2.5 text-[13px] font-light text-white/80 outline-none transition-colors duration-300 hover:border-white/25 focus:border-white/40"
            >
              <option value="">No walkthrough</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
            {unattached ? (
              <p className="mt-1.5 text-[11px] text-amber-200/60">
                That view has no file yet — the button stays disabled until it does.
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function ViewSettings({ view, isStart, canDelete }) {
  const { assets, renameView, removeView, setStartView, attachAsset } = useExperience()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef(null)
  const asset = assets[view.id]
  const type = getViewType(view.type)

  return (
    <section className="border-t border-white/10 py-7">
      <p className="label px-7 text-white/40">Selected View</p>

      <div className="mt-5 px-7">
        <InlineEdit
          label="view"
          value={view.name}
          onCommit={(name) => renameView(view.id, name)}
          className="display text-2xl text-white"
          inputClassName="display text-2xl text-white"
        />

        <div className="mt-5 flex items-center justify-between gap-3 border border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-light text-white/75">
              {asset?.name ?? view.asset?.fileName ?? 'No file attached'}
            </p>
            <p className="mt-1 text-[11px] text-white/35">
              {asset
                ? formatBytes(asset.size)
                : view.asset
                  ? 'Not loaded in this session'
                  : type?.hint}
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="label shrink-0 text-white/55 transition-colors duration-300 hover:text-white"
          >
            {asset ? 'Replace' : 'Attach'}
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple={type?.multiple ?? false}
            accept={type?.accept}
            onChange={(event) => {
              const picked = pickMainFile(view.type, event.target.files, isAcceptedFile)
              if (picked) attachAsset(view.id, picked.file, picked.companions)
              event.target.value = ''
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {!isStart ? (
            <button
              type="button"
              onClick={() => setStartView(view.id)}
              className="label text-white/45 transition-colors duration-300 hover:text-white"
            >
              Set as Start
            </button>
          ) : null}

          {canDelete ? (
            confirmDelete ? (
              <span className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => removeView(view.id)}
                  className="label text-red-300/80 transition-colors duration-300 hover:text-red-200"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="label text-white/40 transition-colors duration-300 hover:text-white"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="label text-white/45 transition-colors duration-300 hover:text-red-300/80"
              >
                Delete View
              </button>
            )
          ) : null}
        </div>
      </div>

      {view.type === '3d' ? (
        <>
          <div className="mt-8">
            <p className="label mb-5 px-7 text-white/40">Tower Links</p>
            <TowerLinks view={view} />
          </div>
          <div className="mt-8">
            <p className="label mb-5 px-7 text-white/40">Unit Type Links</p>
            <UnitTypeLinks view={view} />
          </div>
        </>
      ) : null}
    </section>
  )
}

/**
 * The editor's left panel: the project, its views in order, the selected
 * view's settings, and the way into the customer-facing preview.
 */
export default function ViewsSidebar({ onAddView }) {
  const {
    project,
    views,
    assets,
    currentView,
    renameProject,
    selectView,
    setMode,
    resetProject,
  } = useExperience()
  const [confirmReset, setConfirmReset] = useState(false)

  const missingCount = views.filter((view) => !assets[view.id]).length

  return (
    <aside className="glass flex h-full w-[320px] shrink-0 flex-col border-y-0 border-l-0">
      <header className="px-7 pt-8 pb-7">
        <div className="flex items-center gap-3 text-white/55">
          <CubeIcon size={15} />
          <span className="label">Experience Editor</span>
        </div>
        <div className="mt-5">
          <InlineEdit
            label="project"
            value={project.name}
            onCommit={renameProject}
            className="display text-3xl leading-tight text-white"
            inputClassName="display text-3xl text-white"
          />
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <section className="border-t border-white/10 pt-6 pb-3">
          <div className="flex items-baseline justify-between px-7">
            <p className="label text-white/40">Views</p>
            <p className="label text-white/25">{views.length}</p>
          </div>

          <ul className="mt-3">
            {views.map((view, index) => (
              <ViewRow
                key={view.id}
                view={view}
                index={index}
                isCurrent={view.id === currentView?.id}
                isStart={view.id === project.startViewId}
                hasAsset={Boolean(assets[view.id])}
                onSelect={() => selectView(view.id)}
              />
            ))}
          </ul>

          <div className="px-7 pt-3">
            <button
              type="button"
              onClick={onAddView}
              className="label w-full border border-dashed border-white/20 py-3.5 text-white/60 transition-colors duration-500 hover:border-white/45 hover:text-white"
            >
              + Add View
            </button>
          </div>
        </section>

        {currentView ? (
          <ViewSettings
            key={currentView.id}
            view={currentView}
            isStart={currentView.id === project.startViewId}
            canDelete={views.length > 1}
          />
        ) : null}
      </div>

      <footer className="border-t border-white/10 px-7 pt-6 pb-7">
        {missingCount > 0 ? (
          <p className="mb-4 flex items-start gap-2 text-[11px] leading-relaxed text-amber-200/65">
            <span className="mt-0.5 shrink-0">
              <AlertIcon size={12} />
            </span>
            {missingCount === 1
              ? '1 view needs its file'
              : `${missingCount} views need their files`}{' '}
            attached for this session.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setMode(MODES.SHOWCASE)}
          className="label flex w-full items-center justify-between bg-white px-6 py-4 text-neutral-950 transition-colors duration-500 hover:bg-white/85"
        >
          Preview Experience
          <ArrowIcon size={15} />
        </button>

        <div className="mt-4 text-center">
          {confirmReset ? (
            <span className="flex items-center justify-center gap-5">
              <button
                type="button"
                onClick={resetProject}
                className="label text-red-300/80 transition-colors duration-300 hover:text-red-200"
              >
                Discard Project
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="label text-white/40 transition-colors duration-300 hover:text-white"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="label inline-flex items-center gap-2 text-white/30 transition-colors duration-300 hover:text-white/60"
            >
              <CloseIcon size={11} />
              New Project
            </button>
          )}
        </div>
      </footer>
    </aside>
  )
}
