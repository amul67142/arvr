# Implementation plan — the hotspot pipeline

**The main thing.** Turning a studio's tower renders into per-floor, per-flat,
per-balcony clickable regions. Everything else in the product already works;
this is the one mechanism that has never been executed, and the one the client's
render budget depends on.

Written 24 September 2026, after the council review
(`docs/council/council-report-20260924.html`).

---

## 0. The decision, in one paragraph

**Bake hotspot polygons offline from projected proxy geometry, and make the
viewer consume a single hotspot file that three different producers can write.**

The studio sends the camera path plus a crude proxy model (one box per flat).
A build script projects that proxy through a matched camera for every frame,
takes the convex hull of each unit's projected corners, subtracts whatever
occludes it, simplifies, and writes `hotspots.json`. The viewer already draws
SVG paths and handles pointer events — it only needs to read polygons from a
file instead of deriving them from the silhouette.

Two other producers write the **same file**: a mask tracer (for studios that
can only give Object-ID / Cryptomatte passes) and a manual tracer (for when
both fail, or for corrections). One schema, three ways to fill it, so no render
delivery can ever produce a dead end.

---

## 1. Why this shape, and not the alternatives

| Approach | Verdict |
| --- | --- |
| **Projected proxy, baked offline** ← chosen | Exact at every frame, not just stop frames. No EXR parsing, no computer vision, no anti-aliasing artefacts. Pure geometry, deterministic, reviewable, correctable by hand. Runs at build time, so tablets do nothing but draw SVG. |
| Runtime three.js proxy over the frames | Same maths, but needs WebGL alive during the orbit, a depth buffer for picking, and exact per-frame camera at runtime. More battery, more failure surface on mid-range Android, and it throws away the SVG overlay that already works. Keep as a debugging view, not the product. |
| Mask / Cryptomatte tracing | Works, but only on the frames that were masked, and it inherits every artefact of the render: anti-aliased boundaries produce fractional coverage that must be thresholded, which opens gaps between adjacent flats. Cryptomatte in particular was designed for compositing, encodes IDs as MurmurHash3 floats with a manifest in EXR metadata, and needs an EXR reader in the toolchain. Good fallback, wrong default. |
| Pure real-time 3D (no renders) | This is the thing the client is paying renders to avoid. A WebGL tower will never look like a V-Ray frame on a phone. |

**Practical consequence for the render brief:** stop asking for Cryptomatte as
the primary. Ask for the **camera + proxy**. If a studio cannot export a
camera, ask for a **flat-colour Object-ID PNG with anti-aliasing off** — far
easier for them and for us than Cryptomatte EXR, and renderer-agnostic.

---

## 2. The data contract — build this first

Everything else keys off this file. Coordinates are fractions of the frame
(0–1), so any resolution tier works, exactly like the existing orbit manifest.

```jsonc
// public/demo/<project>/hotspots.json
{
  "version": 1,
  "source": "proxy",              // "proxy" | "mask" | "manual"
  "frameCount": 240,
  "generatedAt": "2026-09-24T...",
  "camera": { "fovY": 31.4, "aspect": 1.7778 },   // for audit, not runtime
  "targets": {                    // what a polygon can point at
    "T1-F12-A":  { "kind": "unit",    "unit": "12A", "floor": 12, "tower": "T1" },
    "T1-F12-A-BAL": { "kind": "room", "unit": "12A", "room": "balcony" },
    "T1-F12":    { "kind": "floor",   "floor": 12,  "tower": "T1" },
    "T1":        { "kind": "tower",   "tower": "T1" }
  },
  "frames": [
    {
      "frame": 0,
      "shapes": [
        { "id": "T1-F12-A", "d": [[0.41,0.32],[0.47,0.31],[0.47,0.36],[0.41,0.37]], "area": 0.0031, "occluded": 0.0 }
      ]
    }
  ]
}
```

Rules that keep it honest:

- Shapes are ordered back-to-front; the viewer hit-tests front-to-back.
- `area` and `occluded` let the viewer ignore slivers (a flat 92% hidden behind
  another tower should not be clickable).
- A frame with no entry falls back to the derived floor bands we already have,
  so a partial bake is still usable.
- Same file for 13 stop frames or all 240 — the viewer does not care.

---

## 3. Week one: the pilot harness (do this before anything else)

The council's single instruction: prove the chain on assets **you** generate,
this week, before the client spends a rupee.

We already own everything needed for a synthetic ground truth: `scripts/` can
build towers (`build-skyline.mjs`, `build-bignonia.mjs`) and
`public/demo/skyline.glb` is a 35-floor tower with named parts.

**Day 1 — synthetic studio delivery.** Write `scripts/mock-studio.mjs`: load
`skyline.glb`, orbit a camera around it on a fixed radius and height, and for
each of 24 frames write (a) a shaded "beauty" PNG, (b) a flat-colour Object-ID
PNG, and (c) a `camera.json` with position, target, fovY and aspect per frame.
That is exactly what a studio would ship, and it gives us a known answer to
check against.

**Day 2 — the projector.** `scripts/build-hotspots.mjs`: read the proxy + camera
and emit `hotspots.json` per §4.

**Day 3 — the viewer.** Teach `RotationView` to load `hotspots.json` and render
its shapes instead of derived bands when present (§6).

**Day 4 — the mask tracer.** `scripts/trace-masks.mjs` against the Object-ID
PNGs from Day 1 (§5). Compare its polygons with the projector's on the same
frames — the difference between the two is your accuracy report.

**Day 5 — the demo.** Click one specific balcony on one specific floor, on a
frame nobody hand-tuned. Record it. That clip goes in front of Trident.

**Acceptance, written down in advance:**

- Every flat on the camera-facing side is clickable on every frame.
- Hover highlight sits inside the rendered flat, no bleed into the neighbour.
- Mask-traced and projected polygons agree within ~2 px at 4K on stop frames.
- `hotspots.json` for 240 frames × 192 units stays under ~2 MB gzipped.
- The bake for a full 240-frame orbit runs in under 2 minutes on this laptop.

---

## 4. Technique A — projected proxy (the primary)

### 4.1 What we ask the studio for

- **Camera:** glTF/GLB preferred (it carries `yfov` directly), else FBX or
  Alembic, else a plain CSV of position, target and focal length per frame.
- **Proxy:** one box (or simple mesh) per sellable thing, in the *same scene
  units and origin as the render camera*, named to a convention:
  `T1_F12_A` (flat), `T1_F12_A_BAL` (balcony), `T1_F12_SLAB` (floor band),
  `T1_CORE`, `AMEN_POOL`.
- Nothing else. No materials, no textures, no detail — boxes are ideal.

### 4.2 Matching the camera (the one place this goes wrong)

Renderers disagree about focal length. 3ds Max and V-Ray physical cameras
compute FOV from different film-gate assumptions, and glTF export bakes a
`yfov` that may already have lost the original. So we do not trust a number —
**we solve for it.**

```js
// scripts/lib/camera-match.mjs
// Given a frame and 2+ known points (the proxy's roof corners, say), solve for
// the vertical FOV that makes the projection line up, then verify on other frames.
const fovY = solve((f) => projectRoof(f).error, { lo: 15, hi: 60, tol: 1e-4 })
```

In practice: import the camera, project the proxy onto frame 1, overlay it on
the beauty frame, and nudge `fovY` until the silhouettes match. Do it once per
delivery, store it in `camera.json`, and assert it on every later frame. If the
residual grows over the orbit, the studio's camera is animating focal length
and we say so immediately rather than shipping drift.

Pitfalls to check on delivery: sensor fit (horizontal vs vertical FOV), film
gate vs render aspect, lens shift, and Y-up vs Z-up.

### 4.3 Projection and polygon build

Per frame, per named proxy object:

1. Project every vertex with the matched view-projection matrix into
   normalised 0–1 frame space.
2. Drop the object if all vertices are behind the camera or off-frame.
3. Take the **convex hull** of the projected vertices — exact for a box, and
   a tight bound for anything convex. For an L-shaped flat, hull each convex
   piece and union them.
4. **Occlusion:** sort objects by distance to the camera, then subtract the
   union of everything nearer from each polygon
   (`polygon-clipping` — Martinez-Rueda, O((n+k) log n), handles holes and
   multipolygons). Record how much area was removed as `occluded`.
5. **Simplify** with Douglas-Peucker at ~0.3 px at 4K; drop shapes under ~400
   px² or over 95% occluded.
6. Round to 4 decimals and write.

```js
import polygonClipping from 'polygon-clipping'
const visible = polygonClipping.difference([hull], ...nearerHulls)
```

Cost is trivial: 192 units × 240 frames × 8 corners is ~370k point
projections — milliseconds. The clipping dominates, and it is still seconds.

### 4.4 Why this also kills the stop-frame limitation

Because the maths works on every frame, hotspots no longer have to be confined
to 13–20 stop frames. The orbit can highlight a floor *while it turns*. That is
a visible product upgrade over Panom, which only shows overlays at rest — and
it costs nothing extra, because the cost was always the masks, not the frames.

---

## 5. Technique B — masks (the fallback)

Used when a studio cannot give a camera, or as an independent check.

**Ask for flat-colour Object-ID PNGs, not Cryptomatte.** One RGB colour per
object, anti-aliasing off, no DOF, no motion blur, same camera and resolution
as the beauty frame, plus a `colors.csv` mapping colour to object name. Every
renderer can do this; it needs no EXR reader, no hash manifest, and produces
crisp boundaries.

Pipeline:

1. Read the PNG with `sharp` (already a dependency), raw RGB.
2. Bucket pixels by exact colour → connected components (flood fill).
3. Trace each component's boundary (marching squares), then Douglas-Peucker.
4. Map colour → target id via `colors.csv`. Write the same `hotspots.json`.

Only if a studio insists on Cryptomatte: decode with the `exrs` WASM bindings
in Node (or Python `decryptomatte` / OpenEXR + OpenCV offline), read the
`cryptomatte/<id>/manifest` metadata, match names to MurmurHash3_32 hashes,
then threshold coverage at 0.5 before tracing. Budget two extra days for this
path and do not promise it in a proposal until it has run once.

---

## 6. Viewer changes (small)

`src/components/rotation/RotationView.jsx` already renders SVG paths with
pointer handlers and already has the concept of hover, floor, unit and drawer.
The change is a source swap, not a rewrite:

- Load `manifest.hotspots` (a URL) alongside the orbit manifest.
- `rotationGeometry.js` gains `shapesFor(frame)` — returns file polygons when
  the frame has them, else the existing derived bands.
- Hit-test front-to-back; on hover, highlight by `id`, on click resolve
  `targets[id]` to floor/unit/room and reuse the existing openFloor/openUnit.
- Room-level ids (`…_BAL`) light the balcony *and* select its flat — this is
  the "hover the balcony, get the room" behaviour asked for.
- Keep the derived bands as the permanent fallback so an unprocessed project
  still works.

Also add `scripts/verify-hotspots.mjs`: render each polygon over its frame as a
contact sheet PNG. Every delivery gets one, and it is reviewed before the
client sees anything.

---

## 7. Technique C — the manual tracer (insurance)

A small editor route in the app: load a frame, click points to draw a polygon,
assign it a target id, save. Hours of work for 13–20 stop frames, and it is how
we correct machine output rather than re-rendering.

This matters commercially: it means **no render delivery can produce a dead
end**. Worst case, a designer traces for a day and the demo still ships. Say
this to the client — it converts the scariest question in the room ("what if it
doesn't work?") into a scheduling detail.

---

## 8. Gates before the client commissions anything

1. **Gate 1 (this week):** the pilot harness passes its acceptance list on
   synthetic data. *No client money is discussed before this.*
2. **Gate 2:** the studio confirms, in writing, that they can export the camera
   and a named proxy (or flat-colour Object-ID PNGs). Get one sample of each
   from an old project — it costs them ten minutes.
3. **Gate 3:** the studio's real pilot batch — 10 frames, one with masks, the
   camera, one interior 360 — runs through the bake and the contact sheet is
   clean. *Only now is the full render ordered.*

Update `docs/RENDER-BRIEF-FOR-ARTIST.md` to match: camera + proxy becomes
§1 approach A, flat-colour Object-ID PNG becomes approach B, Cryptomatte drops
to a footnote, and the pilot batch moves from an appendix to the first page.

---

## 9. Risks, and what each costs

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Studio cannot export a camera | Medium | Fall back to Object-ID PNGs (technique B) |
| Camera focal length animates mid-orbit | Low | Solve per frame; detect and report on delivery |
| Proxy origin/units differ from render scene | Medium | Gate 3 catches it on 10 frames, not 240 |
| Flats hidden behind trees/props in frame | Medium | Ask for a no-foliage pass on stop frames; `occluded` already measures it |
| Curved/organic facades where boxes fit badly | Low | Proxy can be any mesh, not only boxes; hull per convex piece |
| Nothing works | Very low | Manual tracer, one day of design work |

---

## 10. Effort

| Piece | Estimate |
| --- | --- |
| `hotspots.json` schema + viewer read path | 0.5 day |
| `mock-studio.mjs` (synthetic delivery) | 1 day |
| `build-hotspots.mjs` (projector, occlusion, simplify) | 1.5 days |
| `camera-match.mjs` + solver | 0.5 day |
| `trace-masks.mjs` (Object-ID PNG path) | 1 day |
| `verify-hotspots.mjs` contact sheet | 0.5 day |
| Manual tracer UI | 1.5 days |
| Cryptomatte EXR path (only if demanded) | +2 days |

≈ 6.5 days to have all three producers working, of which the first **3 days
answer the question that is blocking the proposal.**

---

## 11. New dependencies

- `polygon-clipping` (MIT) — boolean ops for occlusion.
- `sharp` — already present, used for PNG reading and the contact sheets.
- Optional, only for the Cryptomatte path: `exrs` WASM bindings, or a Python
  side-script with OpenEXR + OpenCV.

Nothing here needs a GPU, a browser, or a server.

---

## Sources consulted

- Cryptomatte structure, MurmurHash3_32 IDs and EXR manifest metadata —
  [Grokipedia: Cryptomatte](https://grokipedia.com/page/cryptomatte),
  [Foundry: Keying with Cryptomatte](https://learn.foundry.com/nuke/content/comp_environment/cryptomatte/keying_with_cryptomatte.html),
  [db&w exrTrader docs](https://wiki.db-w.com/exrtrader2018/cryptomatte),
  [decryptomatte (Python reference implementation)](https://github.com/tappi287/decryptomatte)
- EXR reading outside DCC tools —
  [exrs (Rust/WASM, npm bindings)](https://github.com/johannesvollmer/exrs/blob/master/exrs-wasm/js/README.md),
  [tinyexr](https://github.com/syoyo/tinyexr)
- Camera/FOV mismatch between V-Ray, 3ds Max, FBX/glTF and three.js —
  [Chaos forum: V-Ray physical camera focal length vs FOV](https://forums.chaos.com/t/v-ray-physical-camera-focal-length-doesnt-match-fov/124838),
  [Autodesk FBX camera support](https://download.autodesk.com/us/fbx/20112/3dsmax/files/WS1a9193826455f5ff6026605b1181237e94650be.htm),
  [three.js forum: Blender FOV to three.js FOV](https://discourse.threejs.org/t/blender-fov-to-threejs-fov/75654)
- Mask → polygon tracing —
  [OpenCV shape descriptors (`findContours`, `approxPolyDP`)](https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html),
  [PyImageSearch: contour approximation](https://pyimagesearch.com/2021/10/06/opencv-contour-approximation/)
- Polygon boolean operations in JS —
  [polygon-clipping (Martinez-Rueda-Feito)](https://github.com/mfogel/polygon-clipping),
  [martinez](https://github.com/w8r/martinez)
- Runtime picking alternative, for the debug view —
  [three.js GPU picking with a 1×1 render target](https://github.com/mrdoob/three.js/pull/15194),
  [three.js manual: indexed textures for picking](https://rbm-lib.github.io/three.js/manual/en/indexed-textures.html)
- Headless rendering options, if the mock studio ever needs to run on a server —
  [node-webgl (ANGLE-backed WebGL2 for Node)](https://github.com/RenaudRohlinger/node-webgl),
  [three.js forum: headless rendering](https://discourse.threejs.org/t/headless-rendering/14401)
