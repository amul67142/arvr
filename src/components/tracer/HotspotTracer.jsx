import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  addShape,
  createHotspotFile,
  defineTarget,
  describeHotspots,
  validateHotspots,
} from '../../../scripts/lib/hotspots.mjs'
import { CloseIcon } from '../common/Icons'

/**
 * Drawing hotspots by hand — the pipeline's third producer, and its floor.
 *
 * The projector needs a camera and a proxy; the tracer needs Object-ID passes.
 * When a studio can supply neither, or when a delivery is nearly right and one
 * flat is wrong, someone draws the polygon. A day of this covers a set of stop
 * frames, which is why no render delivery can ever reach a dead end.
 *
 * It writes exactly the file the other two producers write — the same module
 * builds and checks it — so the viewer cannot tell them apart.
 *
 *   /?trace=/demo/mock/orbit.json
 */

const KINDS = ['unit', 'room', 'floor', 'amenity', 'tower']
const ROOMS = ['balcony', 'living', 'dining', 'kitchen', 'bedroom', 'bathroom']

const srcOf = (path, base) => (!path || /^(https?:)?\//.test(path) ? path : base + path)

export default function HotspotTracer({ manifestUrl }) {
  const base = manifestUrl.replace(/[^/]*$/, '')

  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)
  const [file, setFile] = useState(null)
  const [frame, setFrame] = useState(0)
  const [draft, setDraft] = useState([]) // the polygon being drawn
  const [cursor, setCursor] = useState(null) // rubber-band point
  const [selected, setSelected] = useState(null) // { frame, index }
  const [kind, setKind] = useState('unit')
  const [unitId, setUnitId] = useState('')
  const [room, setRoom] = useState('balcony')
  const [floorNo, setFloorNo] = useState(1)
  const [onion, setOnion] = useState(true)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [saved, setSaved] = useState(null)

  const history = useRef([])
  const frameRef = useRef(null)

  // -- the project ---------------------------------------------------------- --
  useEffect(() => {
    let cancelled = false
    fetch(manifestUrl)
      .then((response) => response.json())
      .then(async (data) => {
        if (cancelled) return
        setManifest(data)
        // Start from whatever hotspots already exist, so this is also the tool
        // for correcting a machine-made file rather than only for making one.
        if (data.hotspots) {
          try {
            const existing = await fetch(srcOf(data.hotspots, base)).then((r) => r.json())
            if (!cancelled) {
              setFile({ ...existing, notes: [existing.notes, 'corrected by hand'].filter(Boolean).join(' · ') })
              return
            }
          } catch {
            // fall through to a fresh file
          }
        }
        if (!cancelled) {
          setFile(
            createHotspotFile({
              source: 'manual',
              project: data.building?.label ?? 'project',
              frameCount: data.frameCount,
            }),
          )
        }
      })
      .catch((reason) => !cancelled && setError(String(reason?.message ?? reason)))
    return () => {
      cancelled = true
    }
  }, [base, manifestUrl])

  const units = useMemo(() => manifest?.units ?? [], [manifest])
  const floors = manifest?.building?.floors ?? 0
  // Until a home is chosen, the first one in the price list is the subject.
  const activeUnit = unitId || units[0]?.id || ''

  // -- what is being drawn on ----------------------------------------------- --
  const shapesHere = useMemo(
    () => file?.frames.find((entry) => entry.frame === frame)?.shapes ?? [],
    [file, frame],
  )
  const shapesBefore = useMemo(
    () => (onion ? (file?.frames.find((entry) => entry.frame === frame - 1)?.shapes ?? []) : []),
    [file, frame, onion],
  )

  const currentTarget = useMemo(() => {
    if (kind === 'unit' || kind === 'room') {
      const unit = units.find((candidate) => candidate.id === activeUnit)
      if (!unit) return null
      const id = kind === 'room' ? `${unit.id}-${room}` : unit.id
      return {
        id,
        target:
          kind === 'room'
            ? { kind: 'room', unit: unit.id, floor: unit.floor, room }
            : { kind: 'unit', unit: unit.id, floor: unit.floor },
      }
    }
    if (kind === 'floor') return { id: `floor-${floorNo}`, target: { kind: 'floor', floor: Number(floorNo) } }
    if (kind === 'amenity') return { id: 'amenity', target: { kind: 'amenity', amenity: 'amenity' } }
    return { id: 'tower', target: { kind: 'tower' } }
  }, [activeUnit, floorNo, kind, room, units])

  // -- edits ---------------------------------------------------------------- --
  const remember = useCallback(() => {
    if (!file) return
    history.current = [...history.current.slice(-19), JSON.stringify(file)]
  }, [file])

  const undo = useCallback(() => {
    const last = history.current.pop()
    if (last) setFile(JSON.parse(last))
  }, [])

  const commit = useCallback(() => {
    if (!file || draft.length < 3 || !currentTarget) return
    remember()
    const next = structuredClone(file)
    if (!next.targets[currentTarget.id]) defineTarget(next, currentTarget.id, currentTarget.target)
    addShape(next, frame, { id: currentTarget.id, points: draft })
    setFile(next)
    setDraft([])
    setCursor(null)
  }, [currentTarget, draft, file, frame, remember])

  const removeSelected = useCallback(() => {
    if (!file || !selected) return
    remember()
    const next = structuredClone(file)
    const entry = next.frames.find((candidate) => candidate.frame === selected.frame)
    if (entry) {
      entry.shapes.splice(selected.index, 1)
      if (!entry.shapes.length) next.frames = next.frames.filter((candidate) => candidate !== entry)
    }
    setFile(next)
    setSelected(null)
  }, [file, remember, selected])

  // -- keys ------------------------------------------------------------------ --
  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'ArrowRight') setFrame((f) => Math.min((manifest?.frameCount ?? 1) - 1, f + 1))
      if (event.key === 'ArrowLeft') setFrame((f) => Math.max(0, f - 1))
      if (event.key === 'Enter') commit()
      if (event.key === 'Escape') {
        setDraft([])
        setCursor(null)
        setSelected(null)
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        setDraft((points) => points.slice(0, -1))
      }
      if (event.key === 'Delete') removeSelected()
      if (event.key === 'z' && (event.ctrlKey || event.metaKey)) undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commit, manifest, removeSelected, undo])

  // -- pointer --------------------------------------------------------------- --
  const pointAt = (event) => {
    const box = frameRef.current.getBoundingClientRect()
    return [
      Math.round(((event.clientX - box.left) / box.width) * 10000) / 10000,
      Math.round(((event.clientY - box.top) / box.height) * 10000) / 10000,
    ]
  }

  const onWheel = (event) => {
    const box = frameRef.current.getBoundingClientRect()
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
    setView((current) => {
      const zoom = Math.min(12, Math.max(1, current.zoom * factor))
      // keep the point under the cursor still
      const px = (event.clientX - box.left) / box.width
      const py = (event.clientY - box.top) / box.height
      const scale = zoom / current.zoom
      return {
        zoom,
        x: current.x + (px - 0.5) * (1 - scale) * 100,
        y: current.y + (py - 0.5) * (1 - scale) * 100,
      }
    })
  }

  const dragging = useRef(null)
  const onPointerDown = (event) => {
    if (event.button === 1 || event.shiftKey) {
      dragging.current = { x: event.clientX, y: event.clientY, view }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }
  const onPointerMove = (event) => {
    if (dragging.current) {
      const box = frameRef.current.getBoundingClientRect()
      setView({
        ...dragging.current.view,
        x: dragging.current.view.x + ((event.clientX - dragging.current.x) / box.width) * 100,
        y: dragging.current.view.y + ((event.clientY - dragging.current.y) / box.height) * 100,
      })
      return
    }
    if (draft.length) setCursor(pointAt(event))
  }
  const onPointerUp = () => {
    dragging.current = null
  }

  const onClick = (event) => {
    if (event.shiftKey) return
    setDraft((points) => [...points, pointAt(event)])
  }

  // -- saving ---------------------------------------------------------------- --
  const download = () => {
    const report = validateHotspots(file)
    if (!report.ok) {
      setSaved(`Not saved: ${report.errors[0]}`)
      return
    }
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'hotspots.json'
    link.click()
    URL.revokeObjectURL(link.href)
    setSaved(`Saved hotspots.json — ${describeHotspots(file)}`)
  }

  if (error) {
    return <div className="grid h-full place-items-center bg-neutral-950 text-sm text-white/60">{error}</div>
  }
  if (!manifest || !file) {
    return <div className="grid h-full place-items-center bg-neutral-950"><p className="label text-white/45">Loading…</p></div>
  }

  const image = srcOf(manifest.preview?.[frame] ?? manifest.full?.[frame], base)
  const ring = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x * 100} ${y * 100}`).join('') + 'Z'
  const stats = validateHotspots(file).stats

  return (
    <div className="flex h-full w-full bg-neutral-950">
      {/* -- the frame -- */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${view.x}%, ${view.y}%) scale(${view.zoom})`, transformOrigin: 'center' }}
        >
          <div
            ref={frameRef}
            className="absolute inset-0 cursor-crosshair"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={onClick}
          >
            <img src={image} alt={`Frame ${frame + 1}`} className="h-full w-full object-contain" draggable={false} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {shapesBefore.map((shape, index) => (
                <path
                  key={`onion-${index}`}
                  d={ring(shape.d)}
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity="0.18"
                  strokeWidth="0.15"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {shapesHere.map((shape, index) => {
                const active = selected?.frame === frame && selected?.index === index
                return (
                  <path
                    key={`${shape.id}-${index}`}
                    d={[ring(shape.d), ...(shape.holes ?? []).map(ring)].join(' ')}
                    fillRule="evenodd"
                    fill={active ? 'rgba(224,173,98,0.45)' : 'rgba(43,92,255,0.22)'}
                    stroke={active ? '#f3cf93' : '#7aa2ff'}
                    strokeWidth="0.18"
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelected({ frame, index })
                    }}
                  />
                )
              })}
              {draft.length ? (
                <>
                  <path
                    d={ring(cursor ? [...draft, cursor] : draft)}
                    fill="rgba(224,173,98,0.25)"
                    stroke="#f3cf93"
                    strokeWidth="0.2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {draft.map(([x, y], index) => (
                    <circle key={index} cx={x * 100} cy={y * 100} r="0.35" fill="#f3cf93" />
                  ))}
                </>
              ) : null}
            </svg>
          </div>
        </div>

        <p className="glass label pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 text-white/70">
          click to place points · enter closes · backspace undoes a point · shift-drag pans · wheel zooms
        </p>
      </div>

      {/* -- the panel -- */}
      <aside className="glass flex h-full w-[340px] shrink-0 flex-col border-l">
        <header className="px-7 pt-8 pb-6">
          <p className="label text-white/40">Hotspot tracer</p>
          <h1 className="display mt-3 text-3xl text-white">{manifest.building?.label ?? 'Project'}</h1>
          <p className="mt-2 text-[12px] text-white/45">
            {stats.shapes} shapes · {stats.frames}/{file.frameCount} frames · source {file.source}
          </p>
        </header>
        <div className="hairline mx-7 h-px" />

        <div className="scroll-thin min-h-0 flex-1 space-y-7 overflow-y-auto px-7 py-6">
          <section>
            <p className="label text-white/40">Frame</p>
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={() => setFrame(Math.max(0, frame - 1))} className="ctrl px-3 py-2">
                ‹
              </button>
              <input
                type="range"
                min={0}
                max={file.frameCount - 1}
                value={frame}
                onChange={(event) => setFrame(Number(event.target.value))}
                className="flex-1 accent-white"
              />
              <button
                type="button"
                onClick={() => setFrame(Math.min(file.frameCount - 1, frame + 1))}
                className="ctrl px-3 py-2"
              >
                ›
              </button>
            </div>
            <p className="mt-2 text-[12px] text-white/45">
              {frame + 1} of {file.frameCount} · {shapesHere.length} shapes here
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-white/55">
              <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} className="accent-white" />
              show the previous frame's outlines
            </label>
          </section>

          <section>
            <p className="label text-white/40">Drawing</p>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className="mt-3 w-full cursor-pointer border border-white/12 bg-neutral-900 px-3 py-2.5 text-[13px] text-white/85 outline-none"
            >
              {KINDS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {(kind === 'unit' || kind === 'room') && units.length ? (
              <select
                value={activeUnit}
                onChange={(event) => setUnitId(event.target.value)}
                className="mt-2 w-full cursor-pointer border border-white/12 bg-neutral-900 px-3 py-2.5 text-[13px] text-white/85 outline-none"
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.flatNo} · {unit.bhk} BHK · {unit.status}
                  </option>
                ))}
              </select>
            ) : null}

            {kind === 'room' ? (
              <select
                value={room}
                onChange={(event) => setRoom(event.target.value)}
                className="mt-2 w-full cursor-pointer border border-white/12 bg-neutral-900 px-3 py-2.5 text-[13px] text-white/85 outline-none"
              >
                {ROOMS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : null}

            {kind === 'floor' ? (
              <input
                type="number"
                min={1}
                max={floors || 200}
                value={floorNo}
                onChange={(event) => setFloorNo(event.target.value)}
                className="mt-2 w-full border border-white/12 bg-neutral-900 px-3 py-2.5 text-[13px] text-white/85 outline-none"
              />
            ) : null}

            <p className="mt-3 text-[12px] text-white/45">
              id <span className="text-white/75">{currentTarget?.id ?? '—'}</span> · {draft.length} points placed
            </p>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={commit}
                disabled={draft.length < 3}
                className="label flex-1 bg-white px-4 py-3 text-neutral-950 disabled:cursor-not-allowed disabled:bg-white/25"
              >
                Close shape
              </button>
              <button type="button" onClick={() => setDraft([])} className="ctrl px-4">
                <CloseIcon size={14} />
              </button>
            </div>
          </section>

          <section>
            <p className="label text-white/40">On this frame</p>
            <ul className="mt-3 space-y-1">
              {shapesHere.map((shape, index) => (
                <li key={`${shape.id}-${index}`}>
                  <button
                    type="button"
                    onClick={() => setSelected({ frame, index })}
                    data-active={selected?.frame === frame && selected?.index === index}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-white/70 hover:bg-white/[0.05] data-[active=true]:bg-white/10"
                  >
                    <span className="truncate">{shape.id}</span>
                    <span className="text-white/35">{file.targets[shape.id]?.kind}</span>
                  </button>
                </li>
              ))}
              {!shapesHere.length ? <li className="px-3 text-[12px] text-white/35">nothing traced yet</li> : null}
            </ul>
            {selected?.frame === frame ? (
              <button
                type="button"
                onClick={removeSelected}
                className="label mt-3 w-full border border-red-300/30 px-4 py-2.5 text-red-300/80 hover:bg-red-300/10"
              >
                Delete selected
              </button>
            ) : null}
          </section>
        </div>

        <footer className="space-y-2 border-t border-white/10 px-7 py-6">
          {saved ? <p className="text-[11px] leading-relaxed text-white/50">{saved}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={undo} className="label flex-1 border border-white/20 px-4 py-3 text-white/75">
              Undo
            </button>
            <button type="button" onClick={download} className="label flex-[2] bg-white px-4 py-3 text-neutral-950">
              Save hotspots.json
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-white/35">
            Drop the file next to the frames and point the manifest's <code>hotspots</code> at it.
          </p>
        </footer>
      </aside>
    </div>
  )
}
