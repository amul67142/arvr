/**
 * Carrying a hand-drawn outline round an orbit video — for clients who send
 * only footage: no model, no camera, no ID pass.
 *
 * Someone draws a flat once, on one frame. From the footage alone this works
 * out where that outline sits in 3D and redraws it on every other frame:
 *
 *   1. track   pick a few thousand textured points around the drawn frame and
 *              follow each through the neighbouring frames (patch matching;
 *              the camera moves about a degree per frame, so steps are small)
 *   2. solve   an orbit is a very constrained camera: it circles one vertical
 *              axis at fixed height and distance, keeps that axis centred, and
 *              turns a fixed angle per frame. Only the lens and the tilt are
 *              unknown, so they are found by search — the pair under which the
 *              tracked points triangulate most consistently
 *   3. lift    the facade's depth around the outline is fitted from the tracked
 *              points (a vertical, possibly curved wall), which puts each drawn
 *              vertex in 3D
 *   4. redraw  project the 3D outline into every frame; hide it where the wall
 *              faces away
 *
 * Assumes the footage is one full, steady turn (angle per frame = 360° / frames)
 * with the orbit's centre kept mid-frame — true of drone point-of-interest
 * orbits and render turntables. Coordinates in and out are frame fractions
 * (0–1), like the hotspot file.
 *
 * Shared by the browser lab (?follow=) and scripts/test-follow.mjs.
 */

// -- images ----------------------------------------------------------------- --

/** RGBA pixels to a grey Float32Array. */
export function toGrey(rgba, w, h) {
  const grey = new Float32Array(w * h)
  for (let i = 0, j = 0; i < grey.length; i++, j += 4) {
    grey[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]
  }
  return grey
}

/**
 * Shi–Tomasi corners, the strongest per grid cell: points a patch match can
 * lock onto in both directions, spread over the whole frame.
 */
export function detectFeatures(img, w, h, { cell = 7, border = 16, minScore = 12 } = {}) {
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      gx[i] = (img[i + 1] - img[i - 1]) / 2
      gy[i] = (img[i + w] - img[i - w]) / 2
    }
  }
  const points = []
  for (let cy = border; cy < h - border - cell; cy += cell) {
    for (let cx = border; cx < w - border - cell; cx += cell) {
      let best = minScore
      let at = null
      for (let y = cy; y < cy + cell; y++) {
        for (let x = cx; x < cx + cell; x++) {
          let sxx = 0, syy = 0, sxy = 0
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const i = (y + dy) * w + x + dx
              sxx += gx[i] * gx[i]
              syy += gy[i] * gy[i]
              sxy += gx[i] * gy[i]
            }
          }
          const tr = (sxx + syy) / 2
          const score = (tr - Math.sqrt(Math.max(0, tr * tr - (sxx * syy - sxy * sxy)))) / 25
          if (score > best) {
            best = score
            at = [x, y]
          }
        }
      }
      if (at) points.push(at)
    }
  }
  return points
}

const R = 5 // patch radius: 11×11

function patch(img, w, x, y) {
  const out = new Float32Array((2 * R + 1) ** 2)
  const xi = Math.round(x), yi = Math.round(y)
  let k = 0, mean = 0
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) mean += out[k++] = img[(yi + dy) * w + xi + dx]
  mean /= out.length
  let norm = 0
  for (k = 0; k < out.length; k++) {
    out[k] -= mean
    norm += out[k] * out[k]
  }
  norm = Math.sqrt(norm) || 1
  for (k = 0; k < out.length; k++) out[k] /= norm
  return out
}

/** Normalised cross-correlation of a prepared patch against img at (x, y). */
function ncc(tpl, img, w, x, y) {
  let s = 0, s2 = 0, st = 0, k = 0
  for (let dy = -R; dy <= R; dy++) {
    const row = (y + dy) * w + x
    for (let dx = -R; dx <= R; dx++) {
      const v = img[row + dx]
      s += v
      s2 += v * v
      st += tpl[k++] * v
    }
  }
  const n = (2 * R + 1) ** 2
  const varSum = s2 - (s * s) / n
  return varSum > 1e-6 ? st / Math.sqrt(varSum) : 0
}

/**
 * Follow one point from frame to frame. The search is wide on the first step
 * and narrow after it, around where the last step's velocity predicts. Sub-
 * pixel position from a parabola through the correlation peak. Returns the
 * positions, stopping at the first poor match.
 */
function followPoint(frames, w, h, [x0, y0], { search = 7, near = 3, minNcc = 0.86 } = {}) {
  const out = [[x0, y0]]
  let x = x0, y = y0, vx = 0, vy = 0
  // A patch is cut at whole pixels, so remember where the point sits inside
  // it; dropping that fraction at every step would walk the track away.
  let tpl = patch(frames[0], w, x, y)
  let fx = x - Math.round(x), fy = y - Math.round(y)
  for (let f = 1; f < frames.length; f++) {
    const img = frames[f]
    const px = Math.round(x + vx), py = Math.round(y + vy)
    const r = f === 1 ? search : near
    let best = -2, bx = 0, by = 0
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const cx = px + dx, cy = py + dy
        if (cx < R + 1 || cy < R + 1 || cx >= w - R - 1 || cy >= h - R - 1) continue
        const score = ncc(tpl, img, w, cx, cy)
        if (score > best) {
          best = score
          bx = cx
          by = cy
        }
      }
    }
    if (best < minNcc) break
    const sub = (a, b, c) => {
      const d = a - 2 * b + c
      return d < 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * d))) : 0
    }
    const sx = sub(ncc(tpl, img, w, bx - 1, by), best, ncc(tpl, img, w, bx + 1, by))
    const sy = sub(ncc(tpl, img, w, bx, by - 1), best, ncc(tpl, img, w, bx, by + 1))
    const nx = bx + sx + fx, ny = by + sy + fy
    vx = nx - x
    vy = ny - y
    x = nx
    y = ny
    out.push([x, y])
    tpl = patch(img, w, x, y) // follow the patch as it foreshortens
    fx = x - Math.round(x)
    fy = y - Math.round(y)
  }
  return out
}

/**
 * Track features from the drawn frame forwards and backwards through
 * `before` and `after` (grey images, nearest first). Each track is a list of
 * { t, x, y } with t the frame offset from the drawn frame, x/y in frame
 * fractions scaled so both axes are measured in widths from the centre.
 */
export function trackAround(anchor, before, after, w, h, { onProgress } = {}) {
  const features = detectFeatures(anchor, w, h)
  const tracks = []
  const norm = ([x, y]) => [(x - w / 2) / w, (y - h / 2) / w]
  features.forEach((point, i) => {
    const fwd = followPoint([anchor, ...after], w, h, point)
    const back = followPoint([anchor, ...before], w, h, point)
    const obs = []
    back.forEach((p, t) => t > 0 && obs.push({ t: -t, p: norm(p) }))
    fwd.forEach((p, t) => obs.push({ t, p: norm(p) }))
    if (obs.length >= 7) tracks.push({ anchor: norm(point), obs })
    if (onProgress && i % 200 === 0) onProgress(i / features.length)
  })
  return tracks
}

// -- the orbit camera --------------------------------------------------------- --

/**
 * The camera at orbit angle θ: distance 1 from the axis, height 0 (both are
 * gauge choices: the whole scene scales with them), looking at the axis with
 * pitch `pitch`. Returns its centre and axes.
 */
export function orbitCamera(theta, pitch) {
  const c = Math.cos(theta), s = Math.sin(theta)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  return {
    C: [c, s, 0],
    right: [-s, c, 0],
    fwd: [-c * cp, -s * cp, sp],
    up: [c * sp, s * sp, cp],
  }
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/** Project a world point; null when it is behind the camera. */
export function project(X, cam, focal) {
  const d = sub3(X, cam.C)
  const z = dot(d, cam.fwd)
  if (z <= 1e-6) return null
  return [(focal * dot(d, cam.right)) / z, (-focal * dot(d, cam.up)) / z, z]
}

/** Linear triangulation of one track, and its RMS reprojection error. */
function triangulate(obs, cams, focal) {
  const A = [0, 0, 0, 0, 0, 0] // symmetric 3×3: xx xy xz yy yz zz
  const b = [0, 0, 0]
  for (const { t, p } of obs) {
    const cam = cams(t)
    for (const row of [
      [p[0] * cam.fwd[0] - focal * cam.right[0], p[0] * cam.fwd[1] - focal * cam.right[1], p[0] * cam.fwd[2] - focal * cam.right[2]],
      [p[1] * cam.fwd[0] + focal * cam.up[0], p[1] * cam.fwd[1] + focal * cam.up[1], p[1] * cam.fwd[2] + focal * cam.up[2]],
    ]) {
      const rhs = dot(row, cam.C)
      A[0] += row[0] * row[0]; A[1] += row[0] * row[1]; A[2] += row[0] * row[2]
      A[3] += row[1] * row[1]; A[4] += row[1] * row[2]; A[5] += row[2] * row[2]
      b[0] += row[0] * rhs; b[1] += row[1] * rhs; b[2] += row[2] * rhs
    }
  }
  const [a, d, e, g, h, k] = A
  const det = a * (g * k - h * h) - d * (d * k - h * e) + e * (d * h - g * e)
  if (Math.abs(det) < 1e-18) return null
  const X = [
    (b[0] * (g * k - h * h) - d * (b[1] * k - h * b[2]) + e * (b[1] * h - g * b[2])) / det,
    (a * (b[1] * k - h * b[2]) - b[0] * (d * k - h * e) + e * (d * b[2] - b[1] * e)) / det,
    (a * (g * b[2] - b[1] * h) - d * (d * b[2] - b[1] * e) + b[0] * (d * h - g * e)) / det,
  ]
  let err = 0
  for (const { t, p } of obs) {
    const q = project(X, cams(t), focal)
    if (!q) return null
    err += (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
  }
  return { X, err: Math.sqrt(err / obs.length) }
}

export function cameraSet(pitch, step) {
  const cache = new Map()
  return (t) => {
    if (!cache.has(t)) cache.set(t, orbitCamera(t * step, pitch))
    return cache.get(t)
  }
}

/**
 * Find the lens and tilt. `step` is the orbit angle per frame, known from the
 * frame count; both turning directions are tried. Cost: truncated squared
 * a Cauchy (heavy-tailed) penalty on reprojection error, so the answer is
 * the lens under which the most tracks agree tightly — bad tracks cap out
 * instead of steering it.
 */
export function solveOrbit(tracks, frameCount, { tolerance = 1.5 / 960, fixed = null } = {}) {
  const sample = tracks.filter((track) => track.obs.length >= 11)
  const pool = (sample.length > 600 ? sample.filter((_, i) => i % Math.ceil(sample.length / 600) === 0) : sample)
  const cost = (focal, pitch, step) => {
    const cams = cameraSet(pitch, step)
    let sum = 0
    for (const track of pool) {
      const solved = triangulate(track.obs, cams, focal)
      sum += Math.log1p(((solved ? Math.min(solved.err, tolerance * 8) : tolerance * 8) / (tolerance * 0.4)) ** 2)
    }
    return sum / pool.length
  }
  const base = (2 * Math.PI) / frameCount
  let best = fixed ? { ...fixed, c: cost(fixed.focal, fixed.pitch, fixed.step) } : null
  for (const step of fixed ? [] : [base, -base]) {
    for (let fov = 20; fov <= 100; fov += 4) {
      for (let tilt = -50; tilt <= 10; tilt += 3) {
        const focal = 0.5 / Math.tan((fov * Math.PI) / 360)
        const pitch = (tilt * Math.PI) / 180
        const c = cost(focal, pitch, step)
        if (!best || c < best.c) best = { c, focal, pitch, step }
      }
    }
  }
  // Refine by shrinking pattern search in (log focal, pitch).
  let dl = 0.08, dp = (2 * Math.PI) / 180
  while (!fixed && dl > 0.0005) {
    let moved = false
    for (const [a, b] of [[dl, 0], [-dl, 0], [0, dp], [0, -dp]]) {
      const focal = best.focal * Math.exp(a), pitch = best.pitch + b
      const c = cost(focal, pitch, best.step)
      if (c < best.c) {
        best = { ...best, c, focal, pitch }
        moved = true
      }
    }
    if (!moved) {
      dl /= 2
      dp /= 2
    }
  }
  const cams = cameraSet(best.pitch, best.step)
  const points = []
  const errors = []
  for (const track of tracks) {
    const solved = triangulate(track.obs, cams, best.focal)
    if (solved) errors.push(solved.err)
    if (solved && solved.err < tolerance) points.push({ anchor: track.anchor, X: solved.X })
  }
  errors.sort((a, b) => a - b)
  return {
    focal: best.focal,
    pitch: best.pitch,
    step: best.step,
    rms: errors[Math.floor(errors.length / 2)] ?? 0, // median, in widths
    points,
    fovDeg: (360 / Math.PI) * Math.atan(0.5 / best.focal),
  }
}

// -- lifting the outline -------------------------------------------------------- --

/** Solve a small least-squares system by normal equations and elimination. */
function leastSquares(rows, values, weights) {
  const n = rows[0].length
  const M = Array.from({ length: n }, () => new Float64Array(n + 1))
  rows.forEach((row, k) => {
    const wk = weights[k]
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) M[i][j] += wk * row[i] * row[j]
      M[i][n] += wk * row[i] * values[k]
    }
  })
  for (let i = 0; i < n; i++) M[i][i] += 1e-9
  for (let i = 0; i < n; i++) {
    let p = i
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r
    ;[M[i], M[p]] = [M[p], M[i]]
    for (let r = 0; r < n; r++) {
      if (r === i || !M[i][i]) continue
      const f = M[r][i] / M[i][i]
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1))
}

/**
 * Put a drawn outline (frame fractions on the drawn frame) into 3D.
 *
 * A tower is a vertical extrusion: the facade behind a flat carries on above
 * and below it, in the same columns of the frame. So the depth is fitted
 * from tracked points in those columns (not beside them, where the view runs
 * past the building's edge to ground far behind), weighted towards the
 * flat's own height, as a wall that may curve: depth = a + b·u + c·u² + d·v.
 * Huber weights outvote whatever else is in the columns — podium, ground.
 */
export function liftOutline(outline, solve, aspect) {
  const cam = orbitCamera(0, solve.pitch)
  const pts = outline.map(([x, y]) => [x - 0.5, (y - 0.5) / aspect])
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const cx = (x0 + x1) / 2
  let near = []
  for (const pad of [0.003, 0.008, 0.02]) {
    near = solve.points.filter(({ anchor: [u] }) => u > x0 - pad && u < x1 + pad)
    if (near.length >= 30) break
  }
  if (near.length < 8) throw new Error('Too few tracked points around this outline to place it — try a sharper frame.')
  const prior = near.map(({ anchor: [, v] }) => {
    const dv = v < y0 ? y0 - v : v > y1 ? v - y1 : 0
    return 1 / (1 + (dv / 0.06) ** 2)
  })
  const depths = near.map(({ X }) => dot(sub3(X, cam.C), cam.fwd))
  const rows = near.map(({ anchor: [u, v] }) => [1, u - cx, (u - cx) ** 2, v])
  let weights = prior
  let coef = [0, 0, 0, 0]
  for (let iter = 0; iter < 10; iter++) {
    coef = leastSquares(rows, depths, weights)
    const res = rows.map((row, k) => depths[k] - row.reduce((s, r, i) => s + r * coef[i], 0))
    const mad = [...res].map(Math.abs).sort((a, b) => a - b)[Math.floor(res.length / 2)] || 1e-4
    const k = 1.5 * mad * 1.4826
    weights = res.map((r, i) => prior[i] * (Math.abs(r) <= k ? 1 : k / Math.abs(r)))
  }
  const lift = (u, v) => {
    const z = coef[0] + coef[1] * (u - cx) + coef[2] * (u - cx) ** 2 + coef[3] * v
    const ray = [0, 1, 2].map((i) => cam.fwd[i] + (u / solve.focal) * cam.right[i] - (v / solve.focal) * cam.up[i])
    return [0, 1, 2].map((i) => cam.C[i] + z * ray[i])
  }
  // The wall across the flat, left to right, for deciding when it faces away.
  const wall = []
  for (let i = 0; i <= 8; i++) wall.push(lift(x0 + ((x1 - x0) * i) / 8, (y0 + y1) / 2))
  const normals = wallNormals(wall, cam)
  return { points3d: pts.map(([u, v]) => lift(u, v)), normals, support: near.length }
}

/** Horizontal normals along a run of wall points, turned towards `cam`. */
function wallNormals(wall, cam) {
  const normals = []
  for (let i = 0; i + 1 < wall.length; i++) {
    const a = wall[i], b = wall[i + 1]
    let n = [b[1] - a[1], -(b[0] - a[0]), 0]
    const len = Math.hypot(n[0], n[1])
    if (len < 1e-9) continue
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    if (dot(n, sub3(cam.C, mid)) < 0) n = [-n[0], -n[1], 0]
    normals.push({ at: mid, n: [n[0] / len, n[1] / len, 0] })
  }
  return normals
}

/**
 * Place a flat from drawings on two or more frames: views is a list of
 * { offset, outline }, offset being the frame number (any fixed origin works,
 * as long as every flat that is to be combined uses the same one),
 * outlines paired to the same vertex order (see pairOutlines). Each vertex,
 * seen from known cameras, is triangulated outright — no depth model, so it
 * works on a facade with nothing trackable on it.
 */
export function placeOutline(views, solve, aspect) {
  const norm = ([x, y]) => [x - 0.5, (y - 0.5) / aspect]
  const cams = cameraSet(solve.pitch, solve.step)
  const first = views[0].outline
  const points3d = first.map((_, i) => {
    const solved = triangulate(views.map(({ offset, outline }) => ({ t: offset, p: norm(outline[i]) })), cams, solve.focal)
    if (!solved) throw new Error('Those drawings do not agree — check each one sits on the same flat.')
    return solved.X
  })
  // The wall: the outline's plan positions, binned left to right on the first frame.
  const us = first.map(([x]) => x)
  const lo = Math.min(...us), hi = Math.max(...us)
  const bins = Array.from({ length: 5 }, () => [0, 0, 0, 0])
  points3d.forEach((X, i) => {
    const b = bins[Math.min(4, Math.floor(((us[i] - lo) / (hi - lo || 1)) * 5))]
    b[0] += X[0]; b[1] += X[1]; b[2] += X[2]; b[3]++
  })
  const wall = bins.filter((b) => b[3]).map((b) => [b[0] / b[3], b[1] / b[3], b[2] / b[3]])
  const seenFrom = orbitCamera(views[0].offset * solve.step, solve.pitch)
  const lifted = { points3d, normals: wallNormals(wall, seenFrom), support: first.length, residuals: [] }
  // What the 3D fit misses at each drawn frame, so the outline lands exactly
  // on every drawing and eases between them.
  lifted.residuals = views.map(({ offset, outline }) => {
    const fitted = outlineAt({ ...lifted, residuals: [] }, solve, offset, aspect, { always: true })
    return { offset, delta: outline.map(([x, y], i) => [x - fitted[i][0], y - fitted[i][1]]) }
  })
  return lifted
}

/** Two drawings: the first frame's and one `offset` frames away. */
export function correctOutline(outlineA, offset, outlineB, solve, aspect) {
  return placeOutline([{ offset: 0, outline: outlineA }, { offset, outline: outlineB }], solve, aspect)
}

/**
 * Floors repeat. Given two placed flats of one column (same wall, different
 * floors), the flat on any floor between — or a little beyond — is spaced
 * evenly between them in 3D. `t` is 0 at `low`, 1 at `high`.
 */
export function fillBetween(low, high, t) {
  const mix = (p, q) => p.map((v, i) => v + t * (q[i] - v))
  return {
    points3d: low.points3d.map((p, i) => mix(p, high.points3d[i])),
    normals: low.normals.map((n, i) => ({ at: mix(n.at, (high.normals[i] ?? n).at), n: n.n })),
    residuals: [
      ...low.residuals.map((r) => ({ offset: r.offset, group: 'low', delta: r.delta.map(([x, y]) => [x * (1 - t), y * (1 - t)]) })),
      ...high.residuals.map((r) => ({ offset: r.offset, group: 'high', delta: r.delta.map(([x, y]) => [x * t, y * t]) })),
    ],
  }
}

/**
 * Pair up drawings of the same flat, made independently on different frames
 * with any number of clicks. A flat on a facade is a band: find its four
 * corners, split it into a top and a bottom edge, and resample each edge to
 * the same number of points by length. Returns them in matching order.
 */
export function pairOutlines(outlines, aspect, perEdge = 8) {
  return outlines.map((poly) => resampleBand(poly, aspect, perEdge))
}

function resampleBand(poly, aspect, perEdge) {
  const px = poly.map(([x, y]) => [x, y / aspect]) // square units
  const pick = (score) => px.reduce((best, p, i) => (score(p) < score(px[best]) ? i : best), 0)
  const tl = pick(([x, y]) => x + y), tr = pick(([x, y]) => -x + y)
  const br = pick(([x, y]) => -x - y), bl = pick(([x, y]) => x - y)
  const n = px.length
  const walk = (from, to, dir) => {
    const out = [px[from]]
    for (let i = from; i !== to; ) {
      i = (i + dir + n) % n
      out.push(px[i])
    }
    return out
  }
  const meanY = (chain) => chain.reduce((s, p) => s + p[1], 0) / chain.length
  // The top edge runs TL→TR one way round; take the way that stays higher.
  const topA = walk(tl, tr, 1), topB = walk(tl, tr, -1)
  const top = meanY(topA) <= meanY(topB) ? topA : topB
  const botA = walk(bl, br, 1), botB = walk(bl, br, -1)
  const bottom = meanY(botA) >= meanY(botB) ? botA : botB
  const resample = (chain) => {
    const lengths = [0]
    for (let i = 1; i < chain.length; i++) lengths.push(lengths[i - 1] + Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]))
    const total = lengths[lengths.length - 1] || 1
    const out = []
    for (let k = 0; k < perEdge; k++) {
      const target = (total * k) / (perEdge - 1)
      let i = 1
      while (i < chain.length - 1 && lengths[i] < target) i++
      const span = lengths[i] - lengths[i - 1] || 1
      const t = Math.max(0, Math.min(1, (target - lengths[i - 1]) / span))
      out.push([chain[i - 1][0] + t * (chain[i][0] - chain[i - 1][0]), chain[i - 1][1] + t * (chain[i][1] - chain[i - 1][1])])
    }
    return out
  }
  return [...resample(top), ...resample(bottom).reverse()].map(([x, y]) => [x, y * aspect])
}

/**
 * The outline on frame `offset` frames away from the drawn one, in frame
 * fractions, or null when the whole wall under it faces away there. A curved
 * flat stays in view while any part of it still turns towards the camera.
 */
export function outlineAt(lifted, solve, offset, aspect, { always = false } = {}) {
  const cam = orbitCamera(offset * solve.step, solve.pitch)
  let facing = -1
  for (const { at, n } of lifted.normals) {
    const toCam = sub3(cam.C, at)
    facing = Math.max(facing, dot(n, toCam) / Math.hypot(...toCam))
  }
  if (facing < 0.03 && !always) return null
  const out = []
  for (const X of lifted.points3d) {
    const q = project(X, cam, solve.focal)
    if (!q) return null
    out.push([q[0] + 0.5, q[1] * aspect + 0.5])
  }
  // Residuals ease out over 40° of turn. Each group (one drawn flat; a filled
  // floor carries two, pre-scaled) is averaged on its own, then groups add.
  const reach = (2 * Math.PI) / 9
  const groups = new Map()
  for (const { offset: at, delta, group = 0 } of lifted.residuals ?? []) {
    let turn = ((offset - at) * solve.step) % (2 * Math.PI)
    if (turn > Math.PI) turn -= 2 * Math.PI
    if (turn < -Math.PI) turn += 2 * Math.PI
    const w = Math.max(0, 1 - Math.abs(turn) / reach)
    if (!w) continue
    if (!groups.has(group)) groups.set(group, { weight: 0, shift: out.map(() => [0, 0]) })
    const g = groups.get(group)
    g.weight += w
    delta.forEach(([dx, dy], i) => {
      g.shift[i][0] += w * dx
      g.shift[i][1] += w * dy
    })
  }
  return out.map(([x, y], i) => {
    for (const { weight, shift } of groups.values()) {
      const scale = 1 / Math.max(1, weight)
      x += shift[i][0] * scale
      y += shift[i][1] * scale
    }
    return [x, y]
  })
}

// -- scoring against an answer key ------------------------------------------------ --

/** Rasterise polygons (frame fractions) into a coarse coverage grid. */
export function rasterise(polygons, gw = 1920, gh = 1080) {
  const grid = new Uint8Array(gw * gh)
  for (const poly of polygons) {
    const ys = poly.map((p) => p[1] * gh)
    const top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(gh - 1, Math.ceil(Math.max(...ys)))
    for (let y = top; y <= bottom; y++) {
      const sy = y + 0.5
      const xs = []
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]
        const y0 = ay * gh, y1 = by * gh
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push((ax + ((sy - y0) / (y1 - y0)) * (bx - ax)) * gw)
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(gw, Math.round(xs[k + 1])); x++) grid[y * gw + x] ^= 1
      }
    }
  }
  return grid
}

/** Overlap of two sets of polygons: intersection over union, 0–1. */
export function overlap(a, b) {
  const ga = rasterise(a), gb = rasterise(b)
  let both = 0, either = 0
  for (let i = 0; i < ga.length; i++) {
    both += ga[i] & gb[i]
    either += ga[i] | gb[i]
  }
  return either ? both / either : 1
}

const inside = ([x, y], poly) => {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/**
 * What a buyer feels: pointing anywhere on the real flat, how often does the
 * outline answer? A grid of points over the answer key's shapes, 0–1.
 */
export function hoverHits(guess, truth) {
  let hits = 0, total = 0
  for (const poly of truth) {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 6; j++) {
        const p = [x0 + ((x1 - x0) * (i + 0.5)) / 24, y0 + ((y1 - y0) * (j + 0.5)) / 6]
        if (!inside(p, poly)) continue
        total++
        if (guess && inside(p, guess)) hits++
      }
    }
  }
  return total ? hits / total : 1
}
