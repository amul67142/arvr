import { useEffect, useRef, useState } from 'react'

import { pickMainFile, totalBytes } from '../../experience/assetSources'
import { useExperience } from '../../experience/experienceStore'
import { AVAILABLE_VIEW_TYPES, getViewType, isAcceptedFile } from '../../experience/viewTypes'
import { formatBytes } from '../../utils/modelUtils'
import { AlertIcon, ArrowIcon, CloseIcon, CubeIcon, UploadIcon } from '../common/Icons'

function ImageGlyph({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2.6" y="3.6" width="14.8" height="12.8" rx="0.6" />
      <circle cx="7.2" cy="8" r="1.4" />
      <path d="m2.8 14.2 4.4-4.2 3.4 3.2 2.2-2 4.4 4" />
    </svg>
  )
}

/** A doorway with a path through it — walking in. */
function WalkGlyph({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 17.4V3.6h9v13.8" />
      <path d="M2.4 17.4h15.2" />
      <path d="M13 3.6l3.6 1.8v12" />
      <circle cx="10.6" cy="10.6" r="0.7" />
    </svg>
  )
}

const TYPE_GLYPH = { '3d': CubeIcon, image: ImageGlyph, walkthrough: WalkGlyph }

/** "tower_d-render.png" -> "Tower D Render" */
function nameFromFile(fileName) {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  return stem.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/**
 * Two steps: choose what kind of view, then name it and give it a file.
 * The file stays in the browser, like every asset in the app.
 */
export default function AddViewModal({ open, onClose }) {
  const { addView } = useExperience()
  const inputRef = useRef(null)

  const [typeId, setTypeId] = useState(null)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState(null) // { file, companions }
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)

  const type = getViewType(typeId)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  const stage = (files) => {
    const result = pickMainFile(typeId, files, isAcceptedFile)
    if (!result) {
      setPicked(null)
      setError(`Please choose a ${type.extensions.map((ext) => `.${ext}`).join(', ')} file.`)
      return
    }
    setError(null)
    setPicked(result)
    // Suggest a name from the file, but never overwrite one the user typed.
    if (!name.trim()) setName(nameFromFile(result.file.name))
  }

  const submit = (event) => {
    event.preventDefault()
    if (!picked) {
      setError('Choose a file for this view.')
      return
    }
    addView({
      name: name.trim() || nameFromFile(picked.file.name),
      type: typeId,
      file: picked.file,
      companions: picked.companions,
    })
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-view-title"
      className="view-enter fixed inset-0 z-50 grid place-items-center bg-black/65 px-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="glass w-full max-w-2xl">
        <header className="flex items-start justify-between px-9 pt-9 pb-7">
          <div>
            <p className="label text-white/40">{type ? `New ${type.label} View` : 'Add View'}</p>
            <h2 id="add-view-title" className="display mt-4 text-4xl text-white">
              {type ? 'Name & file' : 'Choose view type'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ctrl -mt-1 -mr-3 px-3">
            <CloseIcon size={16} />
          </button>
        </header>

        {!type ? (
          <div className="grid gap-3 px-9 pb-9 sm:grid-cols-3">
            {AVAILABLE_VIEW_TYPES.map((option) => {
              const Glyph = TYPE_GLYPH[option.id] ?? CubeIcon
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTypeId(option.id)}
                  className="group flex flex-col items-start border border-white/12 px-6 py-7 text-left transition-colors duration-500 hover:border-white/40 hover:bg-white/[0.04]"
                >
                  <span className="text-white/40 transition-colors duration-500 group-hover:text-white/80">
                    <Glyph size={26} />
                  </span>
                  <span className="label-lg mt-7 text-white/85">{option.label}</span>
                  <span className="mt-2 text-xs text-white/35">{option.hint}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <form onSubmit={submit} className="px-9 pb-9">
            <label className="block">
              <span className="label text-white/40">View Name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  typeId === 'image'
                    ? 'e.g. Tower D Exterior'
                    : typeId === 'walkthrough'
                      ? 'e.g. 3BHK Walkthrough'
                      : 'e.g. Masterplan'
                }
                className="mt-3 w-full border-b border-white/20 bg-transparent pb-2 text-lg font-light text-white outline-none transition-colors duration-300 placeholder:text-white/20 focus:border-white/60"
              />
            </label>

            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                stage(event.dataTransfer.files)
              }}
              data-dragging={dragging}
              className="mt-8 flex flex-col items-center justify-center gap-4 border border-dashed border-white/15 px-6 py-9 text-center transition-colors duration-500 data-[dragging=true]:border-white/45 data-[dragging=true]:bg-white/[0.05]"
            >
              {picked ? (
                <>
                  <p className="max-w-full truncate text-sm text-white/85">{picked.file.name}</p>
                  <p className="text-xs text-white/40">
                    {formatBytes(totalBytes(picked.file, picked.companions))}
                    {picked.companions.length > 0
                      ? ` · ${picked.companions.length} linked file${picked.companions.length === 1 ? '' : 's'}`
                      : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="label text-white/45 transition-colors duration-300 hover:text-white"
                  >
                    Choose a different file
                  </button>
                </>
              ) : (
                <>
                  <span className="text-white/30">
                    <UploadIcon size={24} />
                  </span>
                  <p className="label text-white/60">Drop {type.label} here</p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="label border border-white/20 px-6 py-3 text-white/75 transition-colors duration-500 hover:bg-white/10"
                  >
                    Choose File
                  </button>
                  <p className="text-[11px] text-white/30">
                    {type.extensions.map((ext) => `.${ext}`).join('  ')}
                  </p>
                </>
              )}

              <input
                ref={inputRef}
                type="file"
                className="hidden"
                multiple={type.multiple}
                accept={type.accept}
                onChange={(event) => {
                  stage(event.target.files)
                  event.target.value = ''
                }}
              />
            </div>

            {error ? (
              <p className="mt-4 flex items-center gap-2 text-xs text-red-300/80">
                <AlertIcon size={13} />
                {error}
              </p>
            ) : null}

            <p className="mt-5 text-[11px] leading-relaxed text-white/30">
              The file stays in this browser and is never uploaded. It is kept for this
              session only — after a refresh, the view remains but its file needs
              re-attaching.
            </p>

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setTypeId(null)
                  setPicked(null)
                  setError(null)
                }}
                className="label text-white/40 transition-colors duration-300 hover:text-white"
              >
                ← Back
              </button>
              <button
                type="submit"
                className="label flex items-center gap-3 bg-white px-7 py-3.5 text-neutral-950 transition-colors duration-500 hover:bg-white/85"
              >
                Add View
                <ArrowIcon size={15} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
