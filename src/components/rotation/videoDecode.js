/**
 * Every frame of an MP4, fast: the file's own index read directly and the
 * samples handed to the browser's hardware decoder (WebCodecs).
 *
 * Seeking a <video> element frame by frame is slow on renders and drone
 * footage alike — each seek decodes forward from the last keyframe, and an
 * encoder may put only one keyframe in several seconds — so a 360-frame
 * orbit took minutes. Decoding the stream once, in order, takes seconds, and
 * works whether or not the page is on screen.
 *
 * Handles H.264 in an MP4/MOV container, the usual render and phone/drone
 * export. Returns null for anything else (HEVC, VP9, fragmented MP4), and the
 * caller falls back to seeking.
 */

function boxes(view, start, end) {
  const out = []
  let at = start
  while (at + 8 <= end) {
    let size = view.getUint32(at)
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7))
    let header = 8
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8))
      header = 16
    } else if (size === 0) {
      size = end - at
    }
    if (size < header) break
    out.push({ type, start: at, body: at + header, end: at + size })
    at += size
  }
  return out
}

function find(view, box, path) {
  let current = box
  for (const type of path) {
    const children = boxes(view, current.body, current.end)
    current = children.find((child) => child.type === type)
    if (!current) return null
  }
  return current
}

function fullBox(view, box) {
  return { version: view.getUint8(box.body), body: box.body + 4 }
}

/** The video track's samples, decode order, with times in seconds. */
function readTrack(buffer) {
  const view = new DataView(buffer)
  const top = boxes(view, 0, buffer.byteLength)
  const moov = top.find((box) => box.type === 'moov')
  if (!moov) return null

  for (const trak of boxes(view, moov.body, moov.end).filter((box) => box.type === 'trak')) {
    const hdlr = find(view, trak, ['mdia', 'hdlr'])
    if (!hdlr) continue
    const handler = String.fromCharCode(...new Uint8Array(buffer, hdlr.body + 8, 4))
    if (handler !== 'vide') continue

    const mdhd = find(view, trak, ['mdia', 'mdhd'])
    const { version, body } = fullBox(view, mdhd)
    const timescale = view.getUint32(body + (version === 1 ? 16 : 8))

    const stbl = find(view, trak, ['mdia', 'minf', 'stbl'])
    const child = (type) => boxes(view, stbl.body, stbl.end).find((box) => box.type === type)

    // Sample description: only avc1/avc3 with an avcC record.
    const stsd = child('stsd')
    const entry = boxes(view, stsd.body + 8, stsd.end)[0]
    if (!entry || !['avc1', 'avc3'].includes(entry.type)) return null
    const width = view.getUint16(entry.body + 24)
    const height = view.getUint16(entry.body + 26)
    const avcC = boxes(view, entry.body + 78, entry.end).find((box) => box.type === 'avcC')
    if (!avcC) return null
    const description = new Uint8Array(buffer.slice(avcC.body, avcC.end))
    const hex = (n) => n.toString(16).padStart(2, '0')
    const codec = `avc1.${hex(description[1])}${hex(description[2])}${hex(description[3])}`

    // Sample sizes.
    const stsz = child('stsz')
    const fixed = view.getUint32(stsz.body + 4)
    const count = view.getUint32(stsz.body + 8)
    const sizes = Array.from({ length: count }, (_, i) => fixed || view.getUint32(stsz.body + 12 + 4 * i))

    // Chunk offsets, and how many samples each chunk holds.
    const stco = child('stco') ?? child('co64')
    const chunks = view.getUint32(stco.body + 4)
    const offsets = Array.from({ length: chunks }, (_, i) =>
      stco.type === 'co64' ? Number(view.getBigUint64(stco.body + 8 + 8 * i)) : view.getUint32(stco.body + 8 + 4 * i),
    )
    const stsc = child('stsc')
    const runs = Array.from({ length: view.getUint32(stsc.body + 4) }, (_, i) => ({
      first: view.getUint32(stsc.body + 8 + 12 * i),
      perChunk: view.getUint32(stsc.body + 12 + 12 * i),
    }))
    const where = []
    let sample = 0
    for (let c = 0; c < chunks && sample < count; c++) {
      const run = runs.filter((r) => r.first <= c + 1).pop()
      let at = offsets[c]
      for (let k = 0; k < run.perChunk && sample < count; k++) {
        where.push(at)
        at += sizes[sample++]
      }
    }

    // Decode times, plus composition offsets when frames are reordered.
    const stts = child('stts')
    const dts = []
    let t = 0
    for (let i = 0, n = view.getUint32(stts.body + 4); i < n; i++) {
      const runCount = view.getUint32(stts.body + 8 + 8 * i)
      const delta = view.getUint32(stts.body + 12 + 8 * i)
      for (let k = 0; k < runCount; k++) {
        dts.push(t)
        t += delta
      }
    }
    const pts = [...dts]
    const ctts = child('ctts')
    if (ctts) {
      const signed = view.getUint8(ctts.body) === 1
      let i = 0
      for (let e = 0, n = view.getUint32(ctts.body + 4); e < n; e++) {
        const runCount = view.getUint32(ctts.body + 8 + 8 * e)
        const offset = signed ? view.getInt32(ctts.body + 12 + 8 * e) : view.getUint32(ctts.body + 12 + 8 * e)
        for (let k = 0; k < runCount; k++, i++) if (i < pts.length) pts[i] += offset
      }
    }
    const stss = child('stss')
    const sync = stss
      ? new Set(Array.from({ length: view.getUint32(stss.body + 4) }, (_, i) => view.getUint32(stss.body + 8 + 4 * i) - 1))
      : null

    const first = Math.min(...pts)
    return {
      codec,
      description,
      width,
      height,
      duration: t / timescale,
      samples: sizes.map((size, i) => ({
        offset: where[i],
        size,
        key: sync ? sync.has(i) : true,
        time: (pts[i] - first) / timescale,
        length: ((dts[i + 1] ?? t) - dts[i]) / timescale,
      })),
    }
  }
  return null
}

/**
 * Split an orbit video into `count` frames spaced evenly over exactly one
 * turn (frame i shows time (i + ½)/count of the clip), as JPEG blob URLs.
 * Returns null when this path cannot decode the file.
 */
export async function decodeOrbitFrames(url, { count = 360, width = 1280, quality = 0.85, onProgress = null } = {}) {
  if (typeof VideoDecoder === 'undefined') return null
  const buffer = await fetch(url).then((response) => response.arrayBuffer())
  const track = readTrack(buffer)
  if (!track) return null
  const support = await VideoDecoder.isConfigSupported({ codec: track.codec, description: track.description })
  if (!support.supported) return null

  const height = Math.round((width * track.height) / track.width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const targets = Array.from({ length: count }, (_, i) => (track.duration * (i + 0.5)) / count)
  const blobs = new Array(count)
  const pending = []
  let next = 0
  let held = null // the latest frame, shown until the next one's time

  const emit = (frame, upTo) => {
    while (next < count && targets[next] < upTo) {
      ctx.drawImage(frame, 0, 0, width, height)
      const index = next++
      pending.push(new Promise((resolve) => canvas.toBlob((blob) => resolve((blobs[index] = blob)), 'image/jpeg', quality)))
      onProgress?.(next / count)
    }
  }

  let failure = null
  const decoder = new VideoDecoder({
    output: (frame) => {
      const time = frame.timestamp / 1e6
      if (held) {
        emit(held, time)
        held.close()
      }
      held = frame
    },
    error: (reason) => (failure = reason),
  })
  decoder.configure({ codec: track.codec, description: track.description, codedWidth: track.width, codedHeight: track.height })

  for (const sample of track.samples) {
    if (failure) break
    decoder.decode(
      new EncodedVideoChunk({
        type: sample.key ? 'key' : 'delta',
        timestamp: Math.round(sample.time * 1e6),
        duration: Math.round(sample.length * 1e6),
        data: new Uint8Array(buffer, sample.offset, sample.size),
      }),
    )
    // Keep the decoder's queue short so frames are drawn as they come.
    while (decoder.decodeQueueSize > 16) await new Promise((resolve) => setTimeout(resolve, 2))
  }
  if (!failure) await decoder.flush().catch((reason) => (failure = reason))
  if (held) {
    emit(held, Infinity)
    held.close()
  }
  decoder.close()
  await Promise.all(pending)
  if (failure || blobs.some((blob) => !blob)) return null

  const urls = blobs.map((blob) => URL.createObjectURL(blob))
  return { urls, duration: track.duration, dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)) }
}
