import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  fillBetween,
  hoverHits,
  liftOutline,
  outlineAt,
  pairOutlines,
  placeOutline,
  solveOrbit,
  toGrey,
  trackAround,
} from '../../../scripts/lib/orbit-follow.mjs'
import { createHotspotFile, defineTarget, addShape, validateHotspots } from '../../../scripts/lib/hotspots.mjs'
import { decodeOrbitFrames } from '../rotation/videoDecode'
import { extractVideoFrames } from '../rotation/videoFrames'

/**
 * Option A, live: a client sends only an orbit video. Draw a flat on two or
 * three frames and watch it follow the building all the way round; draw the
 * lowest and highest flat of a column and fill the floors between.
 *
 * When the project has an answer key (hotspots traced from an ID pass), every
 * flat is scored against it, and the key can stand in for a steady hand.
 *
 *   /?follow=/demo/unreal-orbit/orbit.json      a prepared project
 *   <FollowLab video={url} onSave={…} />       inside the app, on an upload
 *
 * Inside the app it starts from the uploaded video itself: the clip is cut
 * into one frame per degree, and Save hands the frames, the hotspots and the
 * homes back to the rotation view, which becomes clickable.
 *
 * The maths is scripts/lib/orbit-follow.mjs; scripts/test-follow.mjs and
 * scripts/test-stamp.mjs run the same scoring headless.
 */

const TRACK_W = 960
const SPAN = 12
const COLOURS = ['#f3cf93', '#7aa2ff', '#6ee7b7', '#f9a8d4', '#fca5a5', '#c4b5fd', '#fde047', '#67e8f9']

const srcOf = (path, base) => (!path || /^(https?:)?\//.test(path) ? path : base + path)
const ring = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x * 100} ${y * 100}`).join('') + 'Z'
const area = (d) => {
  let s = 0
  for (let i = 0; i < d.length; i++) s += d[i][0] * d[(i + 1) % d.length][1] - d[(i + 1) % d.length][0] * d[i][1]
  return Math.abs(s / 2)
}
const inside = ([x, y], poly) => {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function loadGrey(url, h) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = TRACK_W
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, TRACK_W, h)
      resolve(toGrey(ctx.getImageData(0, 0, TRACK_W, h).data, TRACK_W, h))
    }
    img.onerror = () => reject(new Error(`Could not read ${url}`))
    img.src = url
  })
}

// Where we know what the renderer really used, say so next to the solve.
const TRUE_CAMERAS = { '/demo/unreal-orbit/': 'Unreal actually used 30 mm, tilted 13.2° down' }

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 30))

/** How many frames an uploaded orbit is cut into: one per degree. */
const VIDEO_FRAMES = 360

const ordinal = (n) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${tail}`
}

/**
 * A builder's price list, pasted or uploaded as CSV: a header row naming the
 * columns (flat, bhk, sq ft / sbua, carpet, facing, price, status — any order,
 * any case) and a row per home. Returns { [flat]: fields }.
 */
function parsePriceList(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split(/[,\t;]/).map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean))
  if (rows.length < 2) return {}
  const header = rows[0].map((h) => h.toLowerCase())
  const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)))
  const at = { flat: col('flat', 'unit', 'home', 'no'), bhk: col('bhk', 'config', 'type'), sbua: col('sbua', 'super', 'sq', 'area'), carpet: col('carpet'), facing: col('facing', 'view'), price: col('price', 'cr'), status: col('status') }
  const out = {}
  for (const row of rows.slice(1)) {
    const flat = row[at.flat]?.replace(/\s+/g, '').toUpperCase()
    if (!flat) continue
    const number = (i) => (i >= 0 && row[i] !== '' && Number.isFinite(parseFloat(row[i])) ? parseFloat(row[i]) : undefined)
    out[flat] = {
      bhk: number(at.bhk),
      sbua: number(at.sbua),
      carpet: number(at.carpet),
      facing: at.facing >= 0 ? row[at.facing] || undefined : undefined,
      price: number(at.price),
      status: at.status >= 0 && row[at.status] ? row[at.status][0].toUpperCase() + row[at.status].slice(1).toLowerCase() : undefined,
    }
  }
  return out
}

export default function FollowLab({ manifestUrl = null, video = null, initial = null, onSave = null, onClose = null }) {
  const base = manifestUrl ? manifestUrl.replace(/[^/]*$/, '') : ''
  const [manifest, setManifest] = useState(initial?.manifest ?? null)
  const [key, setKey] = useState(null) // the answer key, when there is one
  const [error, setError] = useState(null)
  const [frame, setFrame] = useState(0)
  const [camera, setCamera] = useState(initial?.camera ?? null)
  const [busy, setBusy] = useState(null)
  const [flats, setFlats] = useState(initial?.flats ?? [])
  const [prices, setPrices] = useState(initial?.prices ?? {})
  const [saved, setSaved] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [draft, setDraft] = useState([])
  const [cursor, setCursor] = useState(null)
  const [borrow, setBorrow] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [hovered, setHovered] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const frameRef = useRef(null)
  const seq = useRef((initial?.flats?.length ?? 0) + 1)
  const ownFrames = useRef(null) // frames cut here, released unless saved

  // An upload: cut the video into one frame per degree, fast path first.
  useEffect(() => {
    if (!video || initial?.manifest) return undefined
    let cancelled = false
    const progress = (p) => !cancelled && setBusy(`Cutting the video into ${VIDEO_FRAMES} photos… ${Math.round(p * 100)}%`)
    progress(0)
    ;(async () => {
      let cut = await decodeOrbitFrames(video, { count: VIDEO_FRAMES, onProgress: progress }).catch(() => null)
      if (!cut) cut = await extractVideoFrames(video, { count: VIDEO_FRAMES, width: 1280, loop: true, onProgress: progress })
      if (cancelled) return cut.dispose()
      const size = await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve([img.naturalWidth, img.naturalHeight])
        img.onerror = () => resolve([16, 9])
        img.src = cut.urls[0]
      })
      ownFrames.current = cut
      setManifest({ frameCount: cut.urls.length, aspect: size[0] / size[1], preview: cut.urls, full: cut.urls, duration: cut.duration })
      setBusy(null)
    })().catch((reason) => !cancelled && setError(String(reason?.message ?? reason)))
    return () => {
      cancelled = true
    }
  }, [video, initial])

  // Frames cut here and never saved are released when the lab closes.
  useEffect(
    () => () => {
      if (ownFrames.current && !ownFrames.current.kept) ownFrames.current.dispose()
    },
    [],
  )

  useEffect(() => {
    if (!manifestUrl) return undefined
    let cancelled = false
    fetch(manifestUrl)
      .then((r) => r.json())
      .then(async (data) => {
        if (cancelled) return
        setManifest(data)
        if (data.hotspots) {
          try {
            const answer = await fetch(srcOf(data.hotspots, base)).then((r) => r.json())
            if (!cancelled) setKey(answer)
          } catch {
            // no answer key: the lab still works, just unscored
          }
        }
      })
      .catch((reason) => !cancelled && setError(String(reason?.message ?? reason)))
    return () => {
      cancelled = true
    }
  }, [base, manifestUrl])

  const N = manifest?.frameCount ?? 1
  const aspect = manifest?.aspect ?? 16 / 9
  const imageOf = useCallback((f) => srcOf(manifest.full?.[f] ?? manifest.preview?.[f], base), [manifest, base])

  // Turntable playback.
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setFrame((f) => (f + 1) % N), 60)
    return () => clearInterval(timer)
  }, [playing, N])

  // -- 1. the camera, from the footage alone ------------------------------------ --
  // Points tracked round a frame, put in 3D: what a single drawing's rough
  // guess is lifted from. Kept per frame, since many flats share a photo.
  const depthAt = useRef(new Map())

  const trackFrom = useCallback(
    async (at) => {
      const h = Math.round(TRACK_W / aspect)
      const src = (f) => imageOf(((f % N) + N) % N)
      setBusy(`Reading ${2 * SPAN + 1} photos around photo ${at + 1}…`)
      await nextFrame()
      const anchor = await loadGrey(src(at), h)
      const before = [], after = []
      for (let k = 1; k <= SPAN; k++) {
        before.push(await loadGrey(src(at - k), h))
        after.push(await loadGrey(src(at + k), h))
      }
      setBusy('Following a few thousand points through them…')
      await nextFrame()
      return trackAround(anchor, before, after, TRACK_W, h)
    },
    [aspect, imageOf, N],
  )

  const depthFor = useCallback(
    async (at, cam) => {
      if (depthAt.current.has(at)) return depthAt.current.get(at)
      const tracks = await trackFrom(at)
      const solved = solveOrbit(tracks, N, { fixed: { focal: cam.focal, pitch: cam.pitch, step: cam.step } })
      depthAt.current.set(at, solved)
      setBusy(null)
      return solved
    },
    [N, trackFrom],
  )

  const solveCamera = useCallback(async () => {
    if (!manifest) return null
    const t0 = performance.now()
    const tracks = await trackFrom(frame)
    setBusy(`Finding the lens and tilt that fit ${tracks.length} tracks…`)
    await nextFrame()
    const solved = solveOrbit(tracks, N)
    depthAt.current.set(frame, solved)
    const result = {
      focal: solved.focal,
      pitch: solved.pitch,
      step: solved.step,
      mm: 36 * solved.focal,
      tilt: (-solved.pitch * 180) / Math.PI,
      tracks: tracks.length,
      ms: Math.round(performance.now() - t0),
    }
    setCamera(result)
    setBusy(null)
    return result
  }, [frame, manifest, N, trackFrom])

  // -- 2. flats ----------------------------------------------------------------- --
  const active = flats.find((f) => f.id === activeId) ?? null

  const newFlat = useCallback(() => {
    const n = seq.current++
    const flat = { id: `flat-${n}`, name: `Flat ${n}`, floor: '', column: '', colour: COLOURS[(n - 1) % COLOURS.length], views: [], keyId: null }
    setFlats((list) => [...list, flat])
    setActiveId(flat.id)
    setDraft([])
  }, [])

  const updateFlat = (id, patch) => setFlats((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  // Two or more drawings and a camera put a flat in 3D.
  const place = useCallback(
    (flat, cam) => {
      if (flat.views.length < 2 || flat.placed || flat.filled) return flat
      try {
        const paired = pairOutlines(flat.views.map((v) => v.outline), aspect)
        const placed = placeOutline(flat.views.map((v, i) => ({ offset: v.frame, outline: paired[i] })), cam, aspect)
        return { ...flat, placed, problem: null }
      } catch (reason) {
        return { ...flat, problem: String(reason.message ?? reason) }
      }
    },
    [aspect],
  )

  const addView = useCallback(
    (outline, keyId = null) => {
      if (!active) return
      const target = keyId && key?.targets?.[keyId]
      const views = [...active.views.filter((v) => v.frame !== frame), { frame, outline }].sort((a, b) => a.frame - b.frame)
      const patch = { views, placed: null, problem: null }
      if (keyId && !active.keyId) {
        patch.keyId = keyId
        if (target?.unit) patch.name = `Home ${target.unit}`
        if (target?.floor) patch.floor = String(target.floor)
        if (target?.unit) patch.column = String(target.unit).replace(/^\d+/, '')
      }
      setDraft([])
      setCursor(null)
      const next = { ...active, ...patch }
      // Drawing several flats on one photo, then all of them again on the
      // next, is the natural rhythm: go straight on to the next one waiting.
      if (views.length >= 2) {
        const waiting = flats.find((f) => f.id !== active.id && !f.filled && f.views.length === 1 && f.views[0].frame !== frame)
        setActiveId(waiting?.id ?? null)
      }
      if (views.length < 2) {
        updateFlat(active.id, { ...patch, guess: null, nudge: null })
        // One drawing: lift it onto the facade from the footage, so it can be
        // shown - roughly - on every other photo and nudged into place.
        const id = active.id, at = frame
        ;(async () => {
          const cam = camera ?? (await solveCamera())
          if (!cam) return
          const solved = await depthFor(at, cam)
          let guess = null
          try {
            guess = { ...liftOutline(outline, solved, aspect), frame: at }
          } catch {
            guess = null
          }
          setFlats((list) => list.map((f) => (f.id === id && f.views.length === 1 ? { ...f, guess } : f)))
        })()
        return
      }
      if (camera) return setFlats((list) => list.map((f) => (f.id === active.id ? place(next, camera) : f)))
      // First placement: the camera is worked out from the footage first.
      updateFlat(active.id, patch)
      solveCamera().then((cam) => cam && setFlats((list) => list.map((f) => place(f, cam))))
    },
    [active, aspect, camera, depthFor, flats, frame, key, place, solveCamera],
  )

  const closeDraft = useCallback(() => {
    if (draft.length >= 3) addView(draft)
  }, [addView, draft])

  // The rough guess, dragged onto the flat on this photo, as its second drawing.
  const acceptGuess = useCallback(
    (outline) => {
      if (outline) addView(outline)
    },
    [addView],
  )

  // -- 3. fill a column ------------------------------------------------------------ --
  const columns = useMemo(() => {
    const byColumn = new Map()
    for (const flat of flats) {
      if (!flat.placed || flat.filled || !flat.column || !Number(flat.floor)) continue
      if (!byColumn.has(flat.column)) byColumn.set(flat.column, [])
      byColumn.get(flat.column).push(flat)
    }
    return [...byColumn.entries()]
      .map(([column, list]) => {
        const sorted = [...list].sort((a, b) => Number(a.floor) - Number(b.floor))
        return { column, low: sorted[0], high: sorted[sorted.length - 1] }
      })
      .filter(({ low, high }) => Number(high.floor) - Number(low.floor) >= 2)
  }, [flats])

  const fillColumn = ({ column, low, high }) => {
    const lo = Number(low.floor), hi = Number(high.floor)
    const have = new Set(flats.filter((f) => f.column === column).map((f) => Number(f.floor)))
    const added = []
    for (let floor = lo + 1; floor < hi; floor++) {
      if (have.has(floor)) continue
      const unit = `${floor}${column}`
      const keyId = key ? Object.keys(key.targets).find((id) => key.targets[id].unit === unit) ?? null : null
      added.push({
        id: `fill-${column}-${floor}`,
        name: `Home ${unit}`,
        floor: String(floor),
        column,
        colour: low.colour,
        views: [],
        keyId,
        filled: true,
        anchors: [...new Set([...low.views, ...high.views].map((v) => v.frame))],
        placed: fillBetween(low.placed, high.placed, (floor - lo) / (hi - lo)),
      })
    }
    setFlats((list) => [...list, ...added])
  }

  // -- scoring against the answer key ------------------------------------------------ --
  const truthOf = useCallback(
    (f, id) => (key?.frames?.[f]?.shapes ?? []).filter((s) => s.id === id).map((s) => s.d),
    [key],
  )

  const scores = useMemo(() => {
    if (!key || !camera) return {}
    const out = {}
    for (const flat of flats) {
      if (!flat.placed || !flat.keyId) continue
      // Split by distance from the nearest drawing: near is what the drawings
      // cover, far is what the 3D placement has to carry on its own.
      const anchors = flat.anchors ?? flat.views.map((v) => v.frame)
      const near = { hits: 0, count: 0 }, all = { hits: 0, count: 0 }
      for (let f = 0; f < N; f++) {
        const truth = truthOf(f, flat.keyId)
        if (truth.reduce((s, d) => s + area(d), 0) < 0.00015) continue
        const hit = hoverHits(outlineAt(flat.placed, camera, f, aspect), truth)
        const gap = Math.min(...anchors.map((a) => Math.min(Math.abs(f - a), N - Math.abs(f - a))))
        all.hits += hit
        all.count++
        if (gap <= N / 12) {
          near.hits += hit
          near.count++
        }
      }
      out[flat.id] = all.count ? { all: all.hits / all.count, near: near.count ? near.hits / near.count : null, nearCount: near.count, allCount: all.count } : null
    }
    return out
  }, [aspect, camera, flats, key, N, truthOf])

  const overall = useMemo(() => {
    const values = Object.values(scores).filter((v) => v != null)
    if (!values.length) return null
    const mean = (list) => list.reduce((a, b) => a + b, 0) / (list.length || 1)
    return { all: mean(values.map((v) => v.all)), near: mean(values.filter((v) => v.near != null).map((v) => v.near)) }
  }, [scores])

  // -- what is on this frame ---------------------------------------------------------- --
  const outlinesHere = useMemo(() => {
    if (!camera) return []
    return flats
      .filter((f) => f.placed)
      .map((flat) => ({ flat, outline: outlineAt(flat.placed, camera, frame, aspect) }))
      .filter((x) => x.outline)
  }, [aspect, camera, flats, frame])

  // Flats drawn once: their rough guess here, moved by any nudge made here.
  const guessesHere = useMemo(() => {
    if (!camera) return []
    return flats
      .filter((f) => !f.placed && f.guess && f.views.length === 1 && f.views[0].frame !== frame)
      .map((flat) => {
        let offset = frame - flat.guess.frame
        if (offset > N / 2) offset -= N
        if (offset < -N / 2) offset += N
        const outline = outlineAt(flat.guess, camera, offset, aspect)
        if (!outline) return null
        const [dx, dy] = flat.nudge?.frame === frame ? flat.nudge.by : [0, 0]
        return { flat, outline: outline.map(([x, y]) => [x + dx, y + dy]) }
      })
      .filter(Boolean)
  }, [aspect, camera, flats, frame, N])
  const activeGuess = guessesHere.find((g) => g.flat.id === activeId) ?? null

  const keyShapesHere = useMemo(() => (key?.frames?.[frame]?.shapes ?? []).filter((s) => key.targets[s.id]?.kind === 'unit'), [key, frame])

  // -- 5. hand it back to the tour ------------------------------------------------------ --
  const matchedPrices = useMemo(
    () => flats.filter((f) => f.placed && prices[f.name.replace(/^home\s+/i, '').replace(/\s+/g, '').toUpperCase()]).length,
    [flats, prices],
  )

  const buildDelivery = useCallback(() => {
    const file = createHotspotFile({
      source: 'manual',
      project: 'Uploaded orbit video',
      frameCount: N,
      notes: 'Drawn on a few frames and carried round the orbit from the footage alone (Option A)',
    })
    const units = []
    for (const flat of flats.filter((f) => f.placed)) {
      const flatNo = flat.name.replace(/^home\s+/i, '').trim() || flat.id
      const id = `U_${flatNo.replace(/\s+/g, '')}`
      const floor = Number(flat.floor) || null
      defineTarget(file, id, { kind: 'unit', unit: flatNo, ...(floor ? { floor } : {}) })
      for (let f = 0; f < N; f++) {
        const outline = outlineAt(flat.placed, camera, f, aspect)
        if (outline) addShape(file, f, { id, points: outline })
      }
      const row = prices[flatNo.replace(/\s+/g, '').toUpperCase()] ?? {}
      units.push({
        id: flatNo,
        flatNo,
        floor,
        floorLabel: floor ? ordinal(floor) : '',
        code: flat.column || '',
        status: row.status ?? 'Available',
        ...(row.bhk ? { bhk: row.bhk, type: `${row.bhk}BHK` } : {}),
        ...(row.sbua ? { sbua: row.sbua } : {}),
        ...(row.carpet ? { carpet: row.carpet } : {}),
        ...(row.facing ? { facing: row.facing } : {}),
        ...(row.price ? { price: row.price } : {}),
      })
    }
    file.frames.sort((a, b) => a.frame - b.frame)
    return { file, units }
  }, [aspect, camera, flats, N, prices])

  const save = useCallback(() => {
    const { file, units } = buildDelivery()
    const report = validateHotspots(file)
    if (!report.ok) return setSaved(`Not saved: ${report.errors[0]}`)
    if (ownFrames.current) ownFrames.current.kept = true
    const floors = Math.max(0, ...units.map((u) => u.floor ?? 0))
    onSave?.({
      frames: manifest.full,
      aspect,
      hotspots: file,
      units,
      building: { id: 'T1', label: 'Tower', floors },
      lab: { manifest, camera, flats, prices },
    })
  }, [aspect, buildDelivery, camera, flats, manifest, onSave, prices])

  const download = () => {
    const { file } = buildDelivery()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
    link.download = 'hotspots.json'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const readFile = (event, then) => {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (chosen) chosen.text().then(then).catch((reason) => setSaved(String(reason?.message ?? reason)))
  }

  // -- pointer and keys ------------------------------------------------------------------ --
  const pointAt = (event) => {
    const box = frameRef.current.getBoundingClientRect()
    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]
  }

  const onClick = (event) => {
    if (event.shiftKey || dragging.current?.moved || dragging.current?.guess) return
    const p = pointAt(event)
    if (!active) {
      const hit = [...outlinesHere].reverse().find(({ outline }) => inside(p, outline))
      if (hit) setActiveId(hit.flat.id)
      else {
        const waiting = flats.find((f) => !f.filled && f.views.length === 1 && f.views[0].frame !== frame)
        if (waiting) setActiveId(waiting.id)
      }
      return
    }
    if (borrow && key) {
      // The answer key's outline as a perfect hand: the flat under the click
      // the first time, the same flat after that.
      const shapes = active.keyId ? keyShapesHere.filter((s) => s.id === active.keyId) : keyShapesHere.filter((s) => inside(p, s.d))
      const shape = [...shapes].sort((a, b) => b.area - a.area)[0]
      if (shape) addView(shape.d, shape.id)
      return
    }
    setDraft((points) => [...points, p])
  }

  const dragging = useRef(null)
  const onPointerDown = (event) => {
    if (event.button === 0 && !event.shiftKey && activeGuess && !draft.length && inside(pointAt(event), activeGuess.outline)) {
      const flat = activeGuess.flat
      dragging.current = { guess: flat.id, start: pointAt(event), by: flat.nudge?.frame === frame ? flat.nudge.by : [0, 0], moved: false }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      dragging.current = { x: event.clientX, y: event.clientY, view, moved: false }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }
  const onPointerMove = (event) => {
    if (dragging.current?.guess) {
      const [x, y] = pointAt(event)
      const { start, by, guess } = dragging.current
      dragging.current.moved = true
      updateFlat(guess, { nudge: { frame, by: [by[0] + x - start[0], by[1] + y - start[1]] } })
      return
    }
    if (dragging.current) {
      dragging.current.moved = true
      setView({
        ...dragging.current.view,
        x: dragging.current.view.x + event.clientX - dragging.current.x,
        y: dragging.current.view.y + event.clientY - dragging.current.y,
      })
      return
    }
    const p = pointAt(event)
    if (draft.length) setCursor(p)
    const hit = [...outlinesHere].reverse().find(({ outline }) => inside(p, outline))
    setHovered(hit?.flat.id ?? null)
  }
  const onPointerUp = () => {
    setTimeout(() => (dragging.current = null), 0)
  }
  // Zoom about the cursor: the stage is scaled from its top-left corner.
  const stageRef = useRef(null)
  const onWheel = (event) => {
    const box = stageRef.current.getBoundingClientRect()
    const px = event.clientX - box.left, py = event.clientY - box.top
    // Follows the wheel's own distance, so one notch and a fast spin both feel right.
    const factor = Math.exp(Math.max(-1, Math.min(1, -event.deltaY * 0.0025)))
    setView((current) => {
      const zoom = Math.min(12, Math.max(1, current.zoom * factor))
      if (zoom === 1) return { zoom: 1, x: 0, y: 0 }
      const k = zoom / current.zoom
      return { zoom, x: px - (px - current.x) * k, y: py - (py - current.y) * k }
    })
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'ArrowRight') setFrame((f) => (f + (event.shiftKey ? 15 : 1)) % N)
      if (event.key === 'ArrowLeft') setFrame((f) => (f - (event.shiftKey ? 15 : 1) + N) % N)
      if (event.key === 'Enter') {
        if (draft.length) closeDraft()
        else if (activeGuess) acceptGuess(activeGuess.outline)
      }
      if (event.key === 'Escape') {
        setDraft([])
        setCursor(null)
        setActiveId(null)
      }
      if (event.key === 'Backspace') setDraft((points) => points.slice(0, -1))
      if (event.key === ' ') {
        event.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [acceptGuess, activeGuess, closeDraft, draft.length, N])

  if (error) return <div className="grid h-full place-items-center bg-neutral-950 text-sm text-white/60">{error}</div>
  if (!manifest) {
    return (
      <div className="grid h-full place-items-center bg-neutral-950">
        <div className="text-center">
          <p className="label text-white/60">{busy ?? 'Loading…'}</p>
          {onClose ? (
            <button type="button" onClick={onClose} className="label mt-6 border border-white/20 px-4 py-2 text-white/60">
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const placedCount = flats.filter((f) => f.placed).length
  const waiting = flats.filter((f) => !f.filled && f.views.length === 1)
  const waitingAway = waiting.filter((f) => f.views[0].frame !== frame)
  const nextHint = !active && waitingAway.length
    ? `Click anywhere to fix ${waitingAway[0].name} on this photo — the picture on the left shows which flat.`
    : !active
    ? flats.length
      ? 'Pick a flat from the list, or start a new one.'
      : 'Press “New flat”, then click on a flat in the picture.'
    : active.views.length === 0
      ? borrow && key
        ? 'Click a flat in the picture. (Test hand: the answer key draws it perfectly for you.)'
        : 'Click round the flat’s outline, then press Enter.'
      : active.views.length === 1
        ? active.views[0].frame === frame
          ? `${active.name} is drawn on this photo. Turn about 45–60° (Shift + → four times) and draw it again there.`
          : activeGuess
            ? `The dashed outline is a rough guess of ${active.name}. Drag it onto the real flat and press Enter — or click round the flat to draw it fresh.`
            : busy ?? `Draw ${active.name} again here — the picture on the left shows where you drew it.`
        : active.placed
          ? 'Placed. Turn the building — it follows. A third drawing on the other side makes it steadier.'
          : busy ?? 'Placing…'

  return (
    <div className="flex h-full w-full bg-neutral-950">
      {/* -- the frame -- */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
          <div
            className="absolute inset-0 grid place-items-center"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}
          >
            <div
              ref={frameRef}
              className="relative max-h-full w-full cursor-crosshair"
              style={{ aspectRatio: `${aspect}`, maxWidth: `calc((100vh - 120px) * ${aspect})` }}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => setHovered(null)}
              onClick={onClick}
            >
              <img src={imageOf(frame)} alt={`Frame ${frame + 1}`} className="absolute inset-0 h-full w-full select-none" draggable={false} />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {showKey
                  ? keyShapesHere.map((s, i) => (
                      <path key={`k${i}`} d={ring(s.d)} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeDasharray="3 2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))
                  : null}
                {outlinesHere.map(({ flat, outline }) => {
                  const lit = flat.id === hovered || flat.id === activeId
                  return (
                    <path
                      key={flat.id}
                      d={ring(outline)}
                      fill={flat.colour}
                      fillOpacity={lit ? 0.5 : 0.22}
                      stroke={flat.colour}
                      strokeWidth={lit ? 2 : 1.2}
                      vectorEffect="non-scaling-stroke"
                    />
                  )
                })}
                {guessesHere.map(({ flat, outline }) => (
                  <path
                    key={`guess-${flat.id}`}
                    d={ring(outline)}
                    fill={flat.colour}
                    fillOpacity={flat.id === activeId ? 0.3 : 0.12}
                    stroke={flat.colour}
                    strokeDasharray="5 3"
                    strokeWidth={flat.id === activeId ? 2 : 1.2}
                    vectorEffect="non-scaling-stroke"
                    className={flat.id === activeId ? 'cursor-move' : undefined}
                  />
                ))}
                {flats.flatMap((flat) =>
                  flat.views
                    .filter((v) => v.frame === frame && (flat.id === activeId || !flat.placed))
                    .map((v) => (
                      <path
                        key={`drawn-${flat.id}`}
                        d={ring(v.outline)}
                        fill="none"
                        stroke={flat.id === activeId ? '#ffffff' : flat.colour}
                        strokeDasharray={flat.placed ? undefined : '4 3'}
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                    )),
                )}
                {draft.length ? (
                  <>
                    <path d={ring(cursor ? [...draft, cursor] : draft)} fill="rgba(243,207,147,0.25)" stroke="#f3cf93" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    {draft.map(([x, y], i) => (
                      <circle key={i} cx={x * 100} cy={y * 100} r={0.25 / view.zoom} fill="#f3cf93" />
                    ))}
                  </>
                ) : null}
              </svg>
              {hovered ? (
                <div className="glass pointer-events-none absolute left-3 top-3 px-3 py-2 text-[12px] text-white">
                  {flats.find((f) => f.id === hovered)?.name}
                </div>
              ) : null}
            </div>
          </div>
          <p className="glass label pointer-events-none absolute bottom-4 left-1/2 max-w-[90%] -translate-x-1/2 px-4 py-2 text-center text-white/80">{nextHint}</p>

          {waitingAway.length ? (
            <p className="pointer-events-none absolute top-4 left-1/2 max-w-[90%] -translate-x-1/2 bg-amber-300/90 px-4 py-2 text-center text-[12px] text-neutral-950">
              {waiting.length === 1 ? `${waiting[0].name} is` : `${waiting.length} flats are`} drawn on one photo only — dashed outlines are rough guesses.
              Fix each once on a photo about 45–60° round (drag the guess onto the flat, Enter) and it follows accurately.
            </p>
          ) : null}

          <Reference
            flat={active ?? (waitingAway[0] || null)}
            frame={frame}
            imageOf={imageOf}
            aspect={aspect}
          />
        </div>

        {/* -- the turntable -- */}
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-3">
          <button type="button" onClick={() => setPlaying((p) => !p)} className="ctrl w-20 px-3 py-2 text-[12px]">
            {playing ? 'Stop' : 'Turn'}
          </button>
          <input type="range" min={0} max={N - 1} value={frame} onChange={(e) => setFrame(Number(e.target.value))} className="flex-1 accent-white" />
          <span className="w-40 text-right text-[12px] text-white/55">
            frame {frame + 1}/{N} · {Math.round((frame * 360) / N)}°
          </span>
        </div>
      </div>

      {/* -- the panel -- */}
      <aside className="glass flex h-full w-[360px] shrink-0 flex-col border-l">
        <header className="px-6 pt-6 pb-4">
          <p className="label text-white/40">Option A · video only</p>
          <h1 className="display mt-2 text-2xl text-white">Draw once, follow round</h1>
          <p className="mt-2 text-[12px] leading-relaxed text-white/50">
            Nothing here uses the 3D model or the camera Unreal rendered with — only the video frames and your drawings.
          </p>
        </header>
        <div className="hairline mx-6 h-px" />

        <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section>
            <p className="label text-white/40">1 · The camera, from the video</p>
            {camera ? (
              <p className="mt-2 text-[13px] leading-relaxed text-white/80">
                Lens ≈ <b>{camera.mm.toFixed(1)} mm</b> · tilted <b>{camera.tilt.toFixed(1)}°</b> down
                <span className="block text-[11px] text-white/45">
                  from {camera.tracks} tracked points in {(camera.ms / 1000).toFixed(1)} s
                </span>
                {TRUE_CAMERAS[base] ? <span className="block text-[11px] text-white/45">{TRUE_CAMERAS[base]}</span> : null}
              </p>
            ) : (
              <button type="button" onClick={solveCamera} disabled={!!busy} className="label mt-2 w-full bg-white px-4 py-3 text-neutral-950 disabled:bg-white/30">
                {busy ?? 'Work it out'}
              </button>
            )}
            {busy && camera ? <p className="mt-2 text-[12px] text-white/50">{busy}</p> : null}
          </section>

          <section>
            <div className="flex items-center justify-between">
              <p className="label text-white/40">2 · Flats</p>
              <button type="button" onClick={newFlat} className="label bg-white px-3 py-2 text-neutral-950">
                New flat
              </button>
            </div>
            {key ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] leading-snug text-white/60">
                <input type="checkbox" checked={borrow} onChange={(e) => setBorrow(e.target.checked)} className="mt-0.5 accent-white" />
                Test hand — clicking a flat copies Unreal’s exact outline, so the score measures the following, not my drawing
              </label>
            ) : null}
            <ul className="mt-3 space-y-1">
              {flats.map((flat) => (
                <li key={flat.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(flat.id === activeId ? null : flat.id)}
                    data-active={flat.id === activeId}
                    className="flex w-full items-center gap-2 px-2 py-2 text-left text-[12px] text-white/75 hover:bg-white/[0.05] data-[active=true]:bg-white/10"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: flat.colour }} />
                    <span className="flex-1 truncate">{flat.name}</span>
                    <span className="text-white/40">
                      {flat.filled ? 'filled' : flat.placed ? `${flat.views.length} drawings` : `${flat.views.length}/2 drawn`}
                    </span>
                    {scores[flat.id] != null ? (
                      <span className="w-16 text-right text-white/80" title="near the drawings · every frame it shows on">
                        {scores[flat.id].near != null ? Math.round(scores[flat.id].near * 100) : '—'}
                        <span className="text-white/40"> · {Math.round(scores[flat.id].all * 100)}</span>
                      </span>
                    ) : null}
                  </button>
                  {flat.id === activeId && !flat.filled ? (
                    <div className="mb-2 flex gap-2 px-2 text-[12px]">
                      <input value={flat.name} onChange={(e) => updateFlat(flat.id, { name: e.target.value })} className="min-w-0 flex-[3] border border-white/12 bg-neutral-900 px-2 py-1.5 text-white/85 outline-none" />
                      <input value={flat.floor} placeholder="floor" onChange={(e) => updateFlat(flat.id, { floor: e.target.value })} className="w-14 border border-white/12 bg-neutral-900 px-2 py-1.5 text-white/85 outline-none" />
                      <input value={flat.column} placeholder="col" onChange={(e) => updateFlat(flat.id, { column: e.target.value })} className="w-12 border border-white/12 bg-neutral-900 px-2 py-1.5 text-white/85 outline-none" />
                      <button type="button" onClick={() => { setFlats((l) => l.filter((f) => f.id !== flat.id)); setActiveId(null) }} className="px-2 text-red-300/80">
                        ✕
                      </button>
                    </div>
                  ) : null}
                  {flat.id === activeId && flat.views.length ? (
                    <p className="mb-2 px-2 text-[11px] text-white/40">
                      drawn on frames {flat.views.map((v) => v.frame + 1).join(', ')}
                      {flat.problem ? <span className="block text-red-300/80">{flat.problem}</span> : null}
                    </p>
                  ) : null}
                </li>
              ))}
              {!flats.length ? <li className="px-2 text-[12px] text-white/35">none yet</li> : null}
            </ul>
            {draft.length ? (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={closeDraft} disabled={draft.length < 3} className="label flex-1 bg-white px-3 py-2 text-neutral-950 disabled:bg-white/30">
                  Close outline ({draft.length})
                </button>
                <button type="button" onClick={() => setDraft([])} className="ctrl px-3 text-[12px]">
                  Clear
                </button>
              </div>
            ) : null}
          </section>

          <section>
            <p className="label text-white/40">3 · Fill the floors between</p>
            {columns.length ? (
              columns.map((c) => (
                <button key={c.column} type="button" onClick={() => fillColumn(c)} className="label mt-2 w-full border border-white/25 px-3 py-2.5 text-white/85 hover:bg-white/10">
                  Column {c.column}: fill floors {Number(c.low.floor) + 1}–{Number(c.high.floor) - 1}
                </button>
              ))
            ) : (
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">
                Place a low and a high flat in the same column (same letter, floors a few apart) and the ones between can be filled in one go.
              </p>
            )}
          </section>

          {video ? (
            <section>
              <p className="label text-white/40">5 · Price list (optional)</p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">
                The builder’s list as CSV — a header row (flat, bhk, sq ft, carpet, facing, price, status) and a row per home.
                Homes without a row show as “price on request”.
              </p>
              <label className="label mt-2 block cursor-pointer border border-white/25 px-3 py-2.5 text-center text-white/85 hover:bg-white/10">
                Choose price list…
                <input type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => readFile(e, (text) => setPrices(parsePriceList(text)))} />
              </label>
              {Object.keys(prices).length ? (
                <p className="mt-2 text-[12px] text-white/60">
                  {Object.keys(prices).length} rows read · {matchedPrices} of {flats.filter((f) => f.placed).length} placed flats matched
                </p>
              ) : null}
            </section>
          ) : null}

          {video && !key ? (
            <section>
              <p className="label text-white/40">Answer key (testing only)</p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">
                For our own Unreal test: load its exact hotspots.json to score the flats and borrow its outlines. A client never has this.
              </p>
              <label className="label mt-2 block cursor-pointer border border-white/15 px-3 py-2.5 text-center text-white/60 hover:bg-white/10">
                Load answer key…
                <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => readFile(e, (text) => setKey(JSON.parse(text)))} />
              </label>
            </section>
          ) : null}

          {key ? (
            <section>
              <p className="label text-white/40">4 · Against Unreal’s exact answer</p>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-white/60">
                <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} className="accent-white" />
                show the exact outlines (dashed)
              </label>
              <p className="mt-3 text-[13px] leading-relaxed text-white/75">
                {overall == null ? (
                  'Place a flat to see how it scores.'
                ) : (
                  <>
                    Pointing anywhere on the real flat finds the right home <b className="text-white">{Math.round(overall.near * 100)}%</b> of the time within 30° of a drawing,
                    and <b className="text-white">{Math.round(overall.all * 100)}%</b> over every frame it shows on ({placedCount} flats). Where it slips, one more drawing there fixes it.
                  </>
                )}
              </p>
            </section>
          ) : null}
        </div>

        <footer className="space-y-3 border-t border-white/10 px-6 py-4">
          {onSave ? (
            <>
              {saved ? <p className="text-[11px] text-red-300/80">{saved}</p> : null}
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="label flex-1 border border-white/20 px-3 py-3 text-white/75">
                  Close
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!placedCount || !camera}
                  className="label flex-[2] bg-white px-3 py-3 text-neutral-950 disabled:bg-white/25"
                >
                  Save to the tour ({placedCount})
                </button>
              </div>
              {placedCount ? (
                <button type="button" onClick={download} className="label w-full text-white/45 hover:text-white/75">
                  Download hotspots.json
                </button>
              ) : null}
            </>
          ) : null}
          <p className="text-[11px] leading-relaxed text-white/40">
            wheel zooms · right-drag pans · ←/→ step · Shift+←/→ 15° · space turns · Enter closes an outline · Esc deselects
          </p>
        </footer>
      </aside>
    </div>
  )
}

/**
 * Where a flat was drawn before: a close-up of the photo it was first drawn
 * on, outline included, so the same flat can be found again after turning.
 */
function Reference({ flat, frame, imageOf, aspect }) {
  const first = flat?.views?.[0]
  if (!first || flat.views.some((v) => v.frame === frame)) return null
  const xs = first.outline.map((p) => p[0]), ys = first.outline.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const BOX_W = 200, BOX_H = 120
  const cropW = Math.min(0.6, Math.max(0.16, (Math.max(...xs) - Math.min(...xs)) * 3)) // of the image width
  const shownW = BOX_W / cropW
  const shownH = shownW / aspect
  const left = BOX_W / 2 - cx * shownW
  const top = BOX_H / 2 - cy * shownH
  return (
    <div className="glass pointer-events-none absolute top-20 left-4 p-2">
      <p className="label mb-1.5 text-white/60">
        {flat.name} · drawn on photo {first.frame + 1}
      </p>
      <div className="relative overflow-hidden" style={{ width: BOX_W, height: BOX_H }}>
        <div className="absolute" style={{ left, top, width: shownW, height: shownH }}>
          <img src={imageOf(first.frame)} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path
              d={first.outline.map(([x, y], i) => `${i ? 'L' : 'M'}${x * 100} ${y * 100}`).join('') + 'Z'}
              fill={flat.colour}
              fillOpacity="0.35"
              stroke={flat.colour}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
