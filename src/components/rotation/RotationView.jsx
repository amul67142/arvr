import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'

import { getTowerMetadata } from '../../data/towerMetadata'
import { assetBase } from '../../experience/assetSources'
import { MODES as APP_MODES, useExperience } from '../../experience/experienceStore'
import { ArrowIcon, CloseIcon } from '../common/Icons'
import InventoryPanel from '../showcase/InventoryPanel'
import UnitDrawer from '../showcase/UnitDrawer'
import { useInventoryFilters } from '../showcase/useInventoryFilters'
import FollowLab from '../tracer/FollowLab'
import FloorPlate from './FloorPlate'
import { VIEW_H, VIEW_W, floorBand, shapesAt, shapesTop, towerOutline, towerTop } from './rotationGeometry'
import { decodeOrbitFrames } from './videoDecode'
import { extractVideoFrames } from './videoFrames'
import { bhkText, priceText, unitSummary } from '../showcase/unitText'

const DRAG_FRAMES_PER_WIDTH = 70 // dragging across the whole view turns ~70 frames
const FULL_RES_DELAY = 140 // ms at rest before the sharp frame swaps in
const TAG_H = 60 // the tower tag: two lines of text and its padding
const TAG_LEAD = 40 // the leader line below it, at full length

const MODES = [
  { id: 'tower', label: 'Tower' },
  { id: 'floors', label: 'Floors' },
  { id: 'homes', label: 'Homes' },
  { id: 'amenities', label: 'Amenities' },
]

/**
 * A drone orbit or render sequence, presented the way Panom presents one.
 *
 * - Drag to turn, with momentum. The rotation always comes to rest on a
 *   stop frame, and the interactive layer (tower outline, label, clickable
 *   floors) fades in only there, so it never trails the footage.
 * - Hover the tower for its card; switch to Floors and pick one straight off
 *   the building; the floor opens as a plan of its homes; a home opens in
 *   full. The inventory beside it filters the same homes and lights their
 *   floor on the tower.
 *
 * Frames are painted to a canvas and the turning is imperative — no React
 * render per frame. React only hears about rests, hovers and choices.
 */
export default function RotationView({ asset, active = true }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(0)
  const [size, setSize] = useState({ w: 1, h: 1 })
  const [restFrame, setRestFrame] = useState(null) // null while turning
  const [mode, setMode] = useState('tower')
  const [overlays, setOverlays] = useState(true)
  const [hover, setHover] = useState(null) // { kind: 'tower' | 'floor', floor?, x, y }
  const [floor, setFloor] = useState(null)
  const [previewFloor, setPreviewFloor] = useState(null)
  const [hoveredUnit, setHoveredUnit] = useState(null)
  const [selectedUnit, setSelectedUnit] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [touched, setTouched] = useState(false)
  const [plans, setPlans] = useState({})
  const [fetchedHotspots, setHotspots] = useState(null)
  const { navigateToView, resolveUnitTypeTarget, views, assets, embed, mode: appMode, prepareView } = useExperience()
  const [labOpen, setLabOpen] = useState(false)
  const isVideo = ['mp4', 'webm', 'mov'].includes(asset.extension)
  const viewId = useMemo(() => Object.keys(assets).find((id) => assets[id] === asset) ?? null, [assets, asset])

  const motion = useRef({
    frame: 0,
    previews: [],
    full: new Map(),
    dragging: false,
    moved: 0,
    lastX: 0,
    lastT: 0,
    velocity: 0,
    tween: null,
    settleTimer: 0,
  })

  /** Where a path in the manifest actually points. */
  const srcOf = useCallback(
    (path) => (!path || /^(https?:)?\//.test(path) ? path : (manifest?.base ?? '') + path),
    [manifest],
  )

  // Hotspots drawn in the lab arrive with the manifest; a project's come by URL.
  const hotspots = manifest?.hotspotsData ?? fetchedHotspots
  const tower = manifest?.towers?.[0] ?? null
  const units = useMemo(() => manifest?.units ?? [], [manifest])
  const filters = useInventoryFilters(units)

  // -- manifest (demo) or frames from an uploaded video ------------------ --
  useEffect(() => {
    let cancelled = false
    let release = () => {}
    const prepared = asset.prepared
    const load = prepared
      ? // Made clickable in the lab: its frames, hotspots and homes, in memory.
        Promise.resolve({
          frameCount: prepared.frames.length,
          preview: prepared.frames,
          full: prepared.frames,
          towers: [],
          base: '',
          stopEvery: 1,
          building: prepared.building,
          units: prepared.units,
          hotspotsData: prepared.hotspots,
        })
      : isVideo
      ? // Decode the stream once (seconds); seek frame by frame only if the
        // browser cannot decode this file directly (minutes).
        decodeOrbitFrames(asset.url, { count: 360, width: 1280 })
          .catch(() => null)
          .then((cut) => cut ?? extractVideoFrames(asset.url, { count: 96, width: 1280 }))
          .then(({ urls, dispose }) => {
            release = dispose
            return { frameCount: urls.length, preview: urls, full: urls, towers: [], base: '', stopEvery: urls.length >= 360 ? 4 : 8 }
          })
      : fetch(asset.url)
          .then((response) => response.json())
          .then((data) => ({ ...data, base: assetBase(asset) }))
    load
      .then((data) => (cancelled ? release() : setManifest(data)))
      .catch((reason) => !cancelled && setError(String(reason?.message ?? reason)))
    return () => {
      cancelled = true
      release()
    }
  }, [asset, isVideo])

  // Home-type floor plans, drawn from the same data as their walkthroughs.
  useEffect(() => {
    if (!manifest?.unitPlans) return
    let cancelled = false
    Promise.all(
      Object.entries(manifest.unitPlans).map(([type, src]) =>
        fetch(src.startsWith('/') ? src : manifest.base + src)
          .then((response) => response.json())
          .then((plan) => [type, plan])
          .catch(() => null),
      ),
    ).then((entries) => !cancelled && setPlans(Object.fromEntries(entries.filter(Boolean))))
    return () => {
      cancelled = true
    }
  }, [manifest])

  /**
   * Polygons baked from the studio's camera and proxy geometry. When a project
   * has them, they replace the floor bands derived from the tower's
   * silhouette: exact per flat, per balcony, on every frame.
   */
  useEffect(() => {
    if (!manifest?.hotspots) return undefined
    let cancelled = false
    fetch(srcOf(manifest.hotspots))
      .then((response) => response.json())
      .then((data) => !cancelled && setHotspots(data))
      .catch(() => {
        // No hotspots is not an error: the derived bands still work.
      })
    return () => {
      cancelled = true
    }
  }, [manifest, srcOf])

  const stops = useMemo(() => {
    if (!manifest) return []
    const every = manifest.stopEvery || 1
    const list = []
    for (let f = 0; f < manifest.frameCount; f += every) list.push(f)
    if (list.at(-1) !== manifest.frameCount - 1) list.push(manifest.frameCount - 1)
    return list
  }, [manifest])

  // -- painting ----------------------------------------------------------- --
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const m = motion.current
    if (!canvas || !manifest) return
    const index = Math.round(m.frame)
    let image = m.full.get(index)
    if (!image?.complete || !image.naturalWidth) image = null
    for (let d = 0; !image && d < manifest.frameCount; d++) {
      for (const i of [index - d, index + d]) {
        const candidate = m.previews[i]
        if (candidate?.complete && candidate.naturalWidth) {
          image = candidate
          break
        }
      }
    }
    if (!image) return
    const ctx = canvas.getContext('2d')
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
    const w = image.naturalWidth * scale
    const h = image.naturalHeight * scale
    ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
  }, [manifest])

  const loadFull = useCallback(
    (index) => {
      const m = motion.current
      clearTimeout(m.settleTimer)
      m.settleTimer = setTimeout(() => {
        if (m.full.has(index) || !manifest) return
        const image = new Image()
        image.decoding = 'async'
        image.src = srcOf(manifest.full[index])
        m.full.set(index, image)
        image.onload = () => Math.round(motion.current.frame) === index && paint()
      }, FULL_RES_DELAY)
    },
    [manifest, paint, srcOf],
  )

  const setFrame = useCallback(
    (frame) => {
      const m = motion.current
      const next = Math.min((manifest?.frameCount ?? 1) - 1, Math.max(0, frame))
      const changed = Math.round(next) !== Math.round(m.frame)
      m.frame = next
      if (changed) paint()
    },
    [manifest, paint],
  )

  /** Glide to a stop frame, then reveal the overlays there. */
  const settleOn = useCallback(
    (target, duration) => {
      const m = motion.current
      m.tween?.kill()
      const proxy = { f: m.frame }
      const distance = Math.abs(target - m.frame)
      m.tween = gsap.to(proxy, {
        f: target,
        duration: duration ?? Math.min(1.4, 0.35 + distance * 0.018),
        ease: 'power3.out',
        onUpdate: () => setFrame(proxy.f),
        onComplete: () => {
          setFrame(target)
          setRestFrame(target)
          loadFull(target)
        },
      })
    },
    [loadFull, setFrame],
  )

  const nearestStop = useCallback(
    (frame, direction = 0) => {
      if (!stops.length) return 0
      if (direction > 0) return stops.find((s) => s >= frame) ?? stops.at(-1)
      if (direction < 0) return [...stops].reverse().find((s) => s <= frame) ?? stops[0]
      return stops.reduce((best, s) => (Math.abs(s - frame) < Math.abs(best - frame) ? s : best), stops[0])
    },
    [stops],
  )

  // -- preload previews, then an opening turn ---------------------------- --
  useEffect(() => {
    if (!manifest) return
    const m = motion.current
    let count = 0
    m.previews = manifest.preview.map((src, i) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = srcOf(src)
      image.onload = () => {
        count += 1
        setLoaded(count)
        if (i === Math.round(m.frame)) paint()
      }
      return image
    })
    return () => {
      m.previews = []
      m.full.clear()
      clearTimeout(m.settleTimer)
      m.tween?.kill()
    }
  }, [manifest, paint, srcOf])

  const introPlayed = useRef(false)
  const ready = manifest && loaded >= manifest.frameCount * 0.6
  useEffect(() => {
    if (!ready || introPlayed.current || !stops.length) return
    introPlayed.current = true
    settleOn(stops[Math.min(3, stops.length - 1)], 2.6)
  }, [ready, settleOn, stops])

  // -- canvas size ------------------------------------------------------- --
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(container.clientWidth * dpr)
      canvas.height = Math.round(container.clientHeight * dpr)
      setSize({ w: container.clientWidth, h: container.clientHeight })
      paint()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    return () => observer.disconnect()
  }, [paint])

  // -- turning -------------------------------------------------------------- --
  const beginTurn = () => {
    motion.current.tween?.kill()
    setRestFrame(null)
    setHover(null)
    setTouched(true)
  }

  const onPointerDown = (event) => {
    const m = motion.current
    m.dragging = true
    m.moved = 0
    m.velocity = 0
    m.lastX = event.clientX
    m.lastT = performance.now()
  }

  const onPointerMove = (event) => {
    const m = motion.current
    if (!m.dragging) return
    const dx = event.clientX - m.lastX
    m.moved += Math.abs(dx)
    if (m.moved < 5) return
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      beginTurn()
    }
    const width = containerRef.current?.clientWidth || 1
    const now = performance.now()
    const df = (-dx / width) * DRAG_FRAMES_PER_WIDTH
    m.velocity = (df / Math.max(1, now - m.lastT)) * 16
    m.lastX = event.clientX
    m.lastT = now
    setFrame(m.frame + df)
  }

  const onPointerUp = () => {
    const m = motion.current
    if (!m.dragging) return
    m.dragging = false
    if (m.moved < 5) return
    // Coast in the direction of the throw, then settle on the next stop.
    const projected = m.frame + m.velocity * 10
    settleOn(nearestStop(projected, Math.sign(m.velocity)))
  }

  const step = (direction) => {
    const current = restFrame ?? motion.current.frame
    const index = stops.indexOf(nearestStop(current))
    const next = stops[Math.min(stops.length - 1, Math.max(0, index + direction))]
    if (next === undefined || next === current) return
    beginTurn()
    settleOn(next)
  }

  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  })
  useEffect(() => {
    if (!active) return undefined
    const onKey = (event) => {
      if (event.key === 'ArrowLeft') stepRef.current(-1)
      if (event.key === 'ArrowRight') stepRef.current(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  // -- geometry at rest ---------------------------------------------------- --
  // The SVG covers the frame the way the canvas does ("slice"); this maps
  // its units to screen pixels for the HTML cards.
  const cover = Math.max(size.w / VIEW_W, size.h / VIEW_H)
  const toScreen = (x, y) => ({
    x: (size.w - VIEW_W * cover) / 2 + x * cover,
    y: (size.h - VIEW_H * cover) / 2 + y * cover,
  })

  const restData = useMemo(() => {
    if (restFrame === null || !tower?.frames?.length) return null
    const frame = tower.frames[Math.min(restFrame, tower.frames.length - 1)]
    const bands = []
    for (let f = tower.floors; f >= 1; f--) {
      const d = floorBand(frame, tower, f)
      if (d) bands.push({ floor: f, d })
    }
    return { frame, outline: towerOutline(frame), top: towerTop(frame), bands }
  }, [restFrame, tower])

  const restShapes = useMemo(
    () => (restFrame === null || !hotspots ? null : shapesAt(hotspots, restFrame)),
    [hotspots, restFrame],
  )

  const floorSummary = (n) => {
    const onFloor = units.filter((u) => u.floor === n)
    const open = onFloor.filter((u) => u.status === 'Available')
    const prices = open.map((u) => u.price).filter(Number.isFinite)
    const from = prices.length ? Math.min(...prices) : null
    return { total: onFloor.length, open: open.length, from }
  }

  const meta = tower
    ? getTowerMetadata(tower.id)
    : manifest?.building
      ? { displayName: manifest.building.label }
      : null
  const floorCount = tower?.floors ?? manifest?.building?.floors ?? 0
  const available = units.filter((u) => u.status === 'Available').length
  const shownOverlays = overlays && (restData || restShapes?.length)
  const highlightFloor = previewFloor ?? floor
  const highlightBand =
    shownOverlays && highlightFloor && restData
      ? restData.bands.find((b) => b.floor === highlightFloor)
      : null

  // What the overlay should light up: the chosen floor, or a home being
  // hovered anywhere — in the inventory list, on the floor plate, or here.
  const highlightShapes = useMemo(() => {
    if (!restShapes) return []
    const unitId = hoveredUnit ?? selectedUnit
    if (unitId) {
      const onUnit = restShapes.filter((shape) => shape.target.unit === unitId)
      if (onUnit.length) return onUnit
    }
    if (!highlightFloor) return []
    return restShapes.filter((shape) => shape.target.kind === 'floor' && shape.target.floor === highlightFloor)
  }, [highlightFloor, hoveredUnit, restShapes, selectedUnit])

  const floorOffscreen =
    shownOverlays && highlightFloor && !highlightBand && restData && highlightShapes.length === 0
  const trackHover = (event, info) => {
    setTouched(true)
    const box = containerRef.current.getBoundingClientRect()
    setHover({ ...info, x: event.clientX - box.left, y: event.clientY - box.top })
  }

  const openFloor = (n) => {
    setFloor(n)
    setSelectedUnit(null)
    setMode('floors')
  }
  /**
   * Which baked shapes answer the pointer in this mode.
   *
   * Homes answer straight away, without switching mode first: a buyer looking
   * at a building points at the flat they want, not at a control bar.
   */
  const interactiveShapes = useMemo(() => {
    if (!restShapes) return []
    if (mode === 'amenities') return restShapes.filter((shape) => shape.target.kind === 'amenity')
    if (mode === 'floors') return restShapes.filter((shape) => shape.target.kind === 'floor')
    return restShapes.filter((shape) => shape.target.kind === 'unit' || shape.target.kind === 'room')
  }, [mode, restShapes])

  const openUnit = (id) => {
    const unit = units.find((u) => u.id === id)
    if (!unit) return
    setFloor(unit.floor)
    setSelectedUnit(id)
  }

  /** A baked shape describes what it points at; act on that. */
  const openShape = (shape) => {
    if (motion.current.moved >= 5) return
    const { kind, unit } = shape.target
    if (kind === 'unit' || kind === 'room') openUnit(unit)
    else if (kind === 'floor') openFloor(shape.target.floor)
  }

  const hoverFor = (shape) => {
    if (shape.target.kind === 'floor') return { kind: 'floor', floor: shape.target.floor, shapeId: shape.id }
    if (shape.target.kind === 'unit' || shape.target.kind === 'room') {
      return { kind: 'unit', unitId: shape.target.unit, room: shape.target.room, shapeId: shape.id }
    }
    return { kind: 'tower', shapeId: shape.id }
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center text-sm text-white/50">
        This rotation could not be loaded: {error}
      </div>
    )
  }

  const progress = manifest ? loaded / manifest.frameCount : 0
  const floorUnits = floor ? units.filter((u) => u.floor === floor) : []
  const selected = selectedUnit ? units.find((u) => u.id === selectedUnit) : null
  const top = restData?.top ?? shapesTop(restShapes)
  const labelAt = top ? toScreen(top.x, top.y - 10) : null
  // The tower tag stands above the roof on a leader line. A tall tower fills
  // the frame, so there is often no sky to stand it in: the line shortens to
  // whatever room is left, and if even that is not enough the tag hangs below
  // the roof instead of being cut off by the top of the frame.
  const labelRoom = labelAt ? labelAt.y - TAG_H - 16 : 0
  const labelBelow = labelAt !== null && labelAt.y < TAG_H
  const labelLead = Math.round(Math.max(0, Math.min(TAG_LEAD, labelRoom)))
  const colorFor = (unit) => (unit.status === 'Sold' ? '#8a8a8a' : manifest?.typeColors?.[unit.type] ?? '#fff')

  return (
    <div className="absolute inset-0 flex select-none overflow-hidden bg-neutral-950">
      <div
        ref={containerRef}
        className="relative min-w-0 flex-1 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {/* Cinematic falloff so the chrome reads over any frame. */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45),transparent_22%,transparent_70%,rgba(0,0,0,0.55))]" />

        {tower || restShapes?.length ? (
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 h-full w-full transition-opacity duration-500"
            style={{ opacity: shownOverlays ? 1 : 0 }}
            onPointerLeave={() => {
              setHover(null)
              setHoveredUnit(null)
            }}
          >
            <defs>
              <filter id="orbit-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {restShapes?.length ? (
              <>
                {highlightShapes.map((shape) => (
                  <path
                    key={`highlight-${shape.key}`}
                    d={shape.d}
                    fillRule="evenodd"
                    fill="#e0ad62"
                    fillOpacity={previewFloor && !hoveredUnit ? 0.35 : 0.5}
                    stroke="#f3cf93"
                    strokeWidth="2"
                    filter="url(#orbit-glow)"
                    pointerEvents="none"
                  />
                ))}
                {interactiveShapes.map((shape) => {
                  const active = hover?.shapeId === shape.id
                  return (
                    <path
                      key={shape.key}
                      d={shape.d}
                      fillRule="evenodd"
                      fill={active ? 'rgba(224,173,98,0.45)' : 'rgba(255,255,255,0.001)'}
                      stroke={active ? '#f3cf93' : 'rgba(255,255,255,0.16)'}
                      strokeWidth={active ? 1.6 : 0.8}
                      className="cursor-pointer"
                      onPointerMove={(event) => {
                        trackHover(event, hoverFor(shape))
                        if (shape.target.unit) setHoveredUnit(shape.target.unit)
                      }}
                      onClick={() => openShape(shape)}
                    />
                  )
                })}
              </>
            ) : restData ? (
              <>
                <path
                  d={restData.outline}
                  fill={hover?.kind === 'tower' ? 'rgba(255,255,255,0.1)' : 'none'}
                  stroke="white"
                  strokeWidth={hover?.kind === 'tower' ? 3.5 : 2.4}
                  strokeLinejoin="round"
                  filter="url(#orbit-glow)"
                  pointerEvents="none"
                  style={{ transition: 'stroke-width 250ms, fill 250ms' }}
                />
                {highlightBand ? (
                  <path
                    d={highlightBand.d}
                    fill="#e0ad62"
                    fillOpacity={previewFloor ? 0.35 : 0.55}
                    stroke="#f3cf93"
                    strokeWidth="2"
                    filter="url(#orbit-glow)"
                    pointerEvents="none"
                  />
                ) : null}

                {mode === 'floors' ? (
                  restData.bands.map((band) => (
                    <path
                      key={band.floor}
                      d={band.d}
                      fill={hover?.floor === band.floor ? 'rgba(224,173,98,0.45)' : 'rgba(255,255,255,0.001)'}
                      stroke={hover?.floor === band.floor ? '#f3cf93' : 'rgba(255,255,255,0.18)'}
                      strokeWidth="1"
                      className="cursor-pointer"
                      onPointerMove={(event) => trackHover(event, { kind: 'floor', floor: band.floor })}
                      onClick={() => motion.current.moved < 5 && openFloor(band.floor)}
                    />
                  ))
                ) : (
                  <path
                    d={restData.outline}
                    fill="transparent"
                    className="cursor-pointer"
                    onPointerMove={(event) => trackHover(event, { kind: 'tower' })}
                    onClick={() => motion.current.moved < 5 && setMode('floors')}
                  />
                )}
              </>
            ) : null}
          </svg>
        ) : null}

        {/* Tower tag, pinned above the roof — Panom's leader-line label. */}
        {shownOverlays && labelAt && meta ? (
          <div
            key={restFrame}
            className="view-enter pointer-events-none absolute z-10 -translate-x-1/2"
            style={{
              left: Math.min(Math.max(labelAt.x, 110), Math.max(size.w - 110, 110)),
              top: Math.max(8, labelBelow ? labelAt.y : labelAt.y - TAG_H - labelLead - 8),
            }}
          >
            {labelBelow ? (
              <>
                <div className="mx-auto h-2 w-2 rounded-full bg-white" />
                <div className="mx-auto w-px bg-white/70" style={{ height: TAG_LEAD }} />
              </>
            ) : null}
            <div className="glass px-4 py-2 text-center">
              <p className="display text-lg leading-tight text-white">{meta.displayName}</p>
              <p className="label mt-0.5 text-white/55">{floorCount} floors</p>
            </div>
            {labelBelow ? null : (
              <>
                <div className="mx-auto w-px bg-white/70" style={{ height: labelLead }} />
                <div className="mx-auto h-2 w-2 rounded-full bg-white" />
              </>
            )}
          </div>
        ) : null}

        {/* Hover cards. */}
        {hover && shownOverlays ? (
          <div
            className="glass pointer-events-none absolute z-20 w-[240px] px-5 py-4"
            style={{ left: Math.min(hover.x + 20, size.w - 260), top: Math.min(hover.y + 20, size.h - 150) }}
          >
            {hover.kind === 'tower' && meta ? (
              <>
                <p className="label text-white/45">Residential tower</p>
                <p className="display mt-1 text-2xl text-white">{meta.displayName}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    [floorCount, 'Floors'],
                    [units.length, 'Homes'],
                    [available, 'Available'],
                  ].map(([value, label]) => (
                    <div key={label} className="border border-white/10 py-2">
                      <p className="text-lg text-white">{value}</p>
                      <p className="label mt-0.5 text-[9px] text-white/45">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-white/45">Click to choose a floor</p>
              </>
            ) : hover.kind === 'floor' ? (
              <FloorCard floor={hover.floor} summary={floorSummary(hover.floor)} />
            ) : hover.kind === 'unit' ? (
              <UnitCard unit={units.find((candidate) => candidate.id === hover.unitId)} room={hover.room} />
            ) : null}
          </div>
        ) : null}

        {floorOffscreen ? (
          <p className="glass label pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 px-4 py-2 text-white/75">
            Floor {highlightFloor} is below this view
          </p>
        ) : null}

        {!touched && progress >= 0.6 && restFrame !== null ? (
          <p className="glass label view-enter pointer-events-none absolute top-[62%] left-1/2 -translate-x-1/2 px-5 py-3 text-white/80">
            Drag to turn the tower
          </p>
        ) : null}

        {/* Loading */}
        {progress < 1 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
            <div className="h-full bg-white/70 transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
        ) : null}
        {!manifest ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <p className="label text-white/50">
              {['mp4', 'webm', 'mov'].includes(asset.extension) ? 'Processing frames…' : 'Loading…'}
            </p>
          </div>
        ) : null}

        {/* Control bar */}
        <div
          className="glass absolute bottom-7 left-1/2 z-20 flex max-w-[94%] -translate-x-1/2 items-center gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => step(-1)} aria-label="Turn left" className="ctrl px-3">
            <span className="rotate-180">
              <ArrowIcon size={14} />
            </span>
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Turn right" className="ctrl px-3">
            <ArrowIcon size={14} />
          </button>
          {tower || hotspots ? (
            <>
              <span className="mx-2 h-6 w-px shrink-0 bg-white/15" />
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-active={mode === m.id}
                  onClick={() => {
                    setMode(m.id)
                    setTouched(true)
                    if (m.id === 'tower') setFloor(null)
                  }}
                  className="label shrink-0 px-3.5 py-2 text-white/55 transition-colors duration-300 hover:text-white data-[active=true]:bg-white data-[active=true]:text-neutral-950"
                >
                  {m.label}
                </button>
              ))}
              <span className="mx-2 h-6 w-px shrink-0 bg-white/15" />
              <button
                type="button"
                onClick={() => setOverlays((v) => !v)}
                className="label shrink-0 px-3 py-2 text-white/55 hover:text-white"
              >
                {overlays ? 'Hide outlines' : 'Show outlines'}
              </button>
            </>
          ) : (
            <p className="label px-3 text-white/55">Drag to turn</p>
          )}
        </div>

        {/* Amenities: the project's amenity renders. */}
        {mode === 'amenities' && manifest?.amenities ? (
          <div
            className="view-enter absolute bottom-28 left-1/2 z-20 flex -translate-x-1/2 gap-3"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {Object.values(manifest.amenities).map((item) => (
              <button key={item.label} type="button" onClick={() => setLightbox(item)} className="glass group w-48 p-2 text-left">
                <img
                  src={srcOf(item.image)}
                  alt={item.label}
                  className="aspect-[4/3] w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
                />
                <p className="mt-2 px-1 text-[13px] text-white">{item.label}</p>
              </button>
            ))}
          </div>
        ) : null}

        {!floor && !selectedUnit && shownOverlays && mode !== 'amenities' ? (
          <p className="glass label pointer-events-none absolute top-24 right-6 z-20 px-4 py-2 text-white/70">
            {mode === 'floors' ? 'Hover the tower to pick a floor' : 'Hover a home on the building'}
          </p>
        ) : null}

        <p className="pointer-events-none absolute bottom-1 left-3 text-[10px] text-white/35">
          Demo footage · the building shown is not for sale
        </p>

        {/* Editor only: an uploaded orbit video can be made clickable here. */}
        {isVideo && !embed && appMode === APP_MODES.EDITOR && viewId ? (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setLabOpen(true)}
            className="label absolute top-6 right-6 z-20 bg-white px-4 py-3 text-neutral-950"
          >
            {asset.prepared ? 'Edit clickable flats' : 'Make flats clickable'}
          </button>
        ) : null}
      </div>

      {/* Right side: the inventory, or the chosen floor. */}
      {mode === 'homes' ? (
        <InventoryPanel
          units={units}
          filters={filters}
          hoveredId={hoveredUnit}
          selectedId={selectedUnit}
          onHover={(id) => {
            setHoveredUnit(id)
            setPreviewFloor(id ? (units.find((u) => u.id === id)?.floor ?? null) : null)
          }}
          onSelect={openUnit}
          onClose={() => setMode('tower')}
          colorFor={colorFor}
        />
      ) : null}

      {mode === 'floors' && floor ? (
        <aside className="glass view-enter z-30 flex h-full w-[360px] shrink-0 flex-col border-l">
          <header className="flex items-start justify-between px-7 pt-24 pb-5">
            <div>
              <button
                type="button"
                onClick={() => setFloor(null)}
                className="label flex items-center gap-2 text-white/45 transition-colors hover:text-white"
              >
                <span className="rotate-180">
                  <ArrowIcon size={12} />
                </span>
                All floors
              </button>
              <h2 className="display mt-3 text-4xl text-white">Floor {floor}</h2>
              <p className="mt-2 text-sm text-white/50">
                {floorSummary(floor).open} of {floorSummary(floor).total} homes available
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Floor above"
                onClick={() => setFloor(Math.min(floorCount, floor + 1))}
                className="ctrl px-2.5"
              >
                <span className="-rotate-90">
                  <ArrowIcon size={13} />
                </span>
              </button>
              <button
                type="button"
                aria-label="Floor below"
                onClick={() => setFloor(Math.max(1, floor - 1))}
                className="ctrl px-2.5"
              >
                <span className="rotate-90">
                  <ArrowIcon size={13} />
                </span>
              </button>
            </div>
          </header>
          <div className="hairline mx-7 h-px" />
          <div className="scroll-thin flex-1 overflow-y-auto px-7 py-6">
            <FloorPlate
              plan={manifest.plan}
              units={floorUnits}
              typeColors={manifest.typeColors}
              hoveredId={hoveredUnit}
              selectedId={selectedUnit}
              onHover={setHoveredUnit}
              onSelect={openUnit}
            />
            <ul className="mt-6 space-y-2">
              {floorUnits.map((unit) => (
                <li key={unit.id}>
                  <button
                    type="button"
                    onPointerEnter={() => setHoveredUnit(unit.id)}
                    onPointerLeave={() => setHoveredUnit(null)}
                    onClick={() => openUnit(unit.id)}
                    data-active={hoveredUnit === unit.id}
                    className="flex w-full items-center justify-between border border-l-4 border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/[0.05] data-[active=true]:bg-white/[0.07]"
                    style={{ borderLeftColor: colorFor(unit) }}
                  >
                    <span>
                      <span className="display block text-lg text-white">{unit.flatNo}</span>
                      <span className="text-[12px] text-white/50">
                        {unitSummary(unit) || `${unit.floorLabel} floor`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`label block ${unit.status === 'Available' ? 'text-emerald-300/85' : 'text-white/35'}`}>
                        {unit.status}
                      </span>
                      <span className="text-[13px] text-white/85">{priceText(unit)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}

      {selected ? (
        <UnitDrawer
          unit={selected}
          manifest={manifest}
          favourite={filters.favourites.has(selected.id)}
          onFavourite={() => filters.toggleFavourite(selected.id)}
          onImage={setLightbox}
          onClose={() => setSelectedUnit(null)}
          plan={plans[selected.type]}
          experiences={(() => {
            const params = {
              title: [`Home ${selected.flatNo}`, bhkText(selected)].filter(Boolean).join(' · '),
              subtitle: `${meta?.displayName ?? 'Tower'} · Floor ${selected.floor}`,
            }
            const list = []
            // A photographic 360° tour first, when the home type has one…
            const tour = manifest.unitTours?.[selected.type]
            if (tour && views.some((view) => view.id === tour)) {
              list.push({ label: '360° virtual tour', onOpen: () => navigateToView(tour, params) })
            }
            // …then the walkable 3D version.
            const walk = resolveUnitTypeTarget(selected.type)
            if (walk) list.push({ label: '3D walkthrough', onOpen: () => navigateToView(walk, params) })
            return list
          })()}
        />
      ) : null}

      {labOpen ? (
        <div className="fixed inset-0 z-[70] bg-neutral-950">
          <FollowLab
            video={asset.url}
            initial={asset.prepared?.lab ?? null}
            onClose={() => setLabOpen(false)}
            onSave={(prepared) => {
              prepareView(viewId, prepared)
              setLabOpen(false)
            }}
          />
        </div>
      ) : null}

      {lightbox ? (
        <div
          className="view-enter absolute inset-0 z-50 grid place-items-center bg-black/85 p-8"
          onClick={() => setLightbox(null)}
        >
          <figure className="relative max-h-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <img src={srcOf(lightbox.image)} alt={lightbox.label} className="max-h-[78vh] w-auto object-contain" />
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

/** A home under the pointer, straight off the building. */
function UnitCard({ unit, room }) {
  if (!unit) return <p className="text-[13px] text-white/60">This home is not in the price list</p>
  return (
    <>
      <p className="label text-white/45">{room ? `${room} · ${unit.flatNo}` : `Home ${unit.flatNo}`}</p>
      <p className="display mt-1 text-2xl text-white">
        {unitSummary(unit, { facing: 'none' }) || `Home ${unit.flatNo}`}
      </p>
      <p className="mt-2 text-[13px] text-white/70">
        {[unit.floorLabel ? `${unit.floorLabel} floor` : null, unit.facing].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-3 flex items-baseline justify-between">
        <span className={`label ${unit.status === 'Available' ? 'text-emerald-300/85' : 'text-white/35'}`}>
          {unit.status}
        </span>
        <span className="text-[15px] text-white">{priceText(unit)}</span>
      </div>
    </>
  )
}

function FloorCard({ floor, summary }) {
  return (
    <>
      <p className="display text-2xl text-white">Floor {floor}</p>
      <p className="mt-1 text-[13px] text-white/70">
        {summary.open} of {summary.total} homes available
      </p>
      {summary.from ? <p className="text-[12px] text-white/45">from ₹{summary.from.toFixed(2)} Cr</p> : null}
    </>
  )
}
