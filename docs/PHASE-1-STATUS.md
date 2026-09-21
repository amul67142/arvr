# Interactive Real Estate 3D Viewer — Phase 1 Status

*Last updated: 19 September 2026*

---

## 1. What this is

A browser-based 3D viewer for selling real estate. You upload a `.glb` or `.gltf`
masterplan from your own computer and immediately explore it: orbit the project,
hover and click a tower, watch the camera fly to it, read its details, switch
between day and night, and inspect every object inside the file.

It is **frontend-only by design**. No backend, no database, no authentication, no
cloud upload. The model is read into a blob URL with `URL.createObjectURL()` and
never leaves the machine — worth saying out loud in a client meeting, because
developers are protective of their 3D assets.

|            |                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------- |
| **Code**   | `D:\ar and vr`                                                                             |
| **Repo**   | https://github.com/amul67142/arvr — public, one commit on `main`                           |
| **Size**   | ~3,300 lines across 27 source files                                                        |
| **Stack**  | React 19.2, Vite, JavaScript, Tailwind 4, Three.js 0.186, R3F 9.7, drei 10.7, GSAP 3.15    |

### Running it

```bash
cd "D:\ar and vr"
npm install
npm run dev
```

Then drag `samples/gurugram-masterplan.glb` onto the upload screen.

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build
npm run lint      # oxlint — currently clean
```

---

## 2. What is working

Every item below was verified by actually driving the app in a browser, not just
by the code compiling. All 18 steps from the original brief are done.

| #  | Feature                  | Status | Notes                                                        |
| -- | ------------------------ | ------ | ------------------------------------------------------------ |
| 1  | Upload screen            | Works  | Drag/drop, folder drop, file picker, shows filename + size    |
| 2  | Load local GLB           | Works  | `useLoader(GLTFLoader, blobUrl)`                              |
| 3  | Loading state            | Works  | `useProgress()` percentage, measured climbing 0 → 100         |
| 4  | Camera auto-fit          | Works  | From bounding box; never hard-coded for one model             |
| 5  | OrbitControls            | Works  | Damping on; rotate / zoom / pan; limits derived from model    |
| 6  | Scene traversal          | Works  | One pass produces towers, tree, stats and bounds              |
| 7  | Model Inspector          | Works  | Hierarchy, search, click-to-focus, scene statistics           |
| 8  | Tower detection          | Works  | `Tower_` / `Building_` / `Block_` name prefixes               |
| 9  | Hover highlight          | Works  | Subtle warm lift plus a cursor label with the object name     |
| 10 | Click to select          | Works  | Stronger highlight, stays while selected                      |
| 11 | Camera flight            | Works  | GSAP, 1.5 s, `power3.inOut`                                   |
| 12 | Tower info panel         | Works  | Slides in from the right                                      |
| 13 | Day / Night              | Works  | 1.6 s GSAP crossfade, never a hard flash                      |
| 14 | Reset view               | Works  | Animates back to the stored overview pose                     |
| 15 | Fullscreen               | Works  | Browser Fullscreen API                                        |
| 16 | Upload another model     | Works  | Revokes blob URLs, disposes GPU memory, resets all state      |
| 17 | Error handling           | Works  | Bad format and corrupt model, both offer "Try Another Model"  |
| 18 | UI polish                | Works  | Black / white / neutral, glassmorphism, premium typography    |

### Tested against real third-party models

Not just the demo asset. Three public models, each chosen to exercise a
different code path:

| Model                | Source                        | What it proved                                     |
| -------------------- | ----------------------------- | -------------------------------------------------- |
| `DamagedHelmet.glb`  | Khronos glTF-Sample-Assets    | Full PBR: base colour, normal, metallic, emissive   |
| `LittlestTokyo.glb`  | three.js examples             | Draco decoding; 215-object hierarchy in inspector   |
| `Sponza/`            | Khronos glTF-Sample-Assets    | Multi-file `.gltf`: 1 manifest + `.bin` + 69 textures, 50 MB |

None of these have `Tower_` names, so they also exercised the "no named towers
detected" fallback and the Model Inspector.

They live in `samples/downloaded/` and are **git-ignored** — they are other
people's CC-BY assets and should not be redistributed from our repo. The README
says where to re-download them.

---

## 3. How it is built

```
src/
  App.jsx                     upload -> loading -> viewer, no routing
  state/
    viewerStore.js            the context object + useViewer hook
    ViewerProvider.jsx        reducer: selection, focus requests, time of day, UI flags
  components/
    upload/ModelUploader.jsx  drag/drop, file picker, validation, size guidance
    viewer/
      ProjectViewer.jsx       canvas + overlay layout
      UploadedModel.jsx       GLTF loading, hover and click handling
      CameraController.jsx    OrbitControls + every camera move in the app
      LightingController.jsx  day/night, baked environment maps
      GroundShadow.jsx        shadow catcher under the project
      ViewerControls.jsx      day/night, reset, inspector, fullscreen
      TowerInfoPanel.jsx      right-hand sales panel
      ModelInspector.jsx      object tree, search, scene stats
      LoadingOverlay.jsx      progress screen
    common/                   Icons, ErrorState, ModelErrorBoundary
  hooks/
    useUploadedModel.js       blob URL lifetime
    useModelObjects.js        one traversal -> towers, tree, stats, bounds
    useFullscreen.js
  utils/
    modelUtils.js             bounds, detection, hierarchy, stats, disposal
    cameraUtils.js            fit, focus, GSAP flights, orbit limits
    materialUtils.js          non-destructive hover/selection highlighting
    envUtils.js               day/night palettes, baked environment maps
  data/towerMetadata.js       placeholder sales copy — the single data seam
```

### Four decisions that constrain future work

These are the load-bearing choices. Anything built in Phase 2 should respect
them or deliberately revisit them.

1. **Camera fit is computed, never hard-coded.** Model bounds drive the framing
   distance, orbit min/max distance, near/far clipping planes and the shadow
   frustum. Any model at any scale works. It also refits when the viewport
   changes — resize, tablet rotation, or entering fullscreen.

2. **Camera work is imperative.** GSAP tweens `camera.position` and
   `controls.target` directly. A 1.5-second flight costs zero React re-renders.
   Hover highlighting and the cursor label work the same way. *Do not* put
   per-frame values into React state.

3. **Imported materials are never mutated.** Highlighting clones a material per
   mesh and caches it on `userData`. GLTF files routinely share one material
   across dozens of meshes, so mutating in place would light up half the model.

4. **Only detected buildings are hit-testable.** Every other mesh opts out of
   raycasting, which keeps pointer moves cheap on large scenes. Shadows switch
   off automatically above 2,500 meshes. The original `raycast` is preserved on
   `userData` so floors and units can be re-enabled later.

---

## 4. Things added beyond the brief

Each of these removes a specific way the demo could fail in front of a client.

- **Decoders vendored into `public/`** — Draco, Meshopt and KTX2 are served
  locally instead of from a CDN. Compressed architectural models are common, and
  a failed decoder fetch on conference wifi means a blank screen.

- **Environment maps baked locally** via `PMREMGenerator` instead of drei's
  `<Environment preset>`, which needs a multi-megabyte CDN download that can
  stall or fail. Also makes the day/night crossfade smooth rather than a swap.

- **Multi-file `.gltf` actually works.** Drop the whole folder and the `.bin`
  and textures are wired up through blob URLs. GLB is still recommended
  everywhere in the UI.

- **A ground shadow catcher.** Uploaded masterplans often have no ground
  geometry, and a tower casting onto nothing reads as a model floating in space.

- **A demo model generator** (see next section).

---

## 5. The demo model

`samples/gurugram-masterplan.glb` — 447 objects, 46 KB, real scale at
200 × 138 × 170 m.

A Gurugram-style high-rise condominium: four residential towers (G+28 to G+38)
on a parking podium around a central green, plus a clubhouse, swimming pool,
tennis court, kids' play area, tree-lined driveway and entrance gate.

Four towers are detected by the `Tower_` prefix and the clubhouse by `Block_`,
so it exercises both detection paths. Regenerate with:

```bash
node scripts/make-project-model.mjs
```

### Why it is generated rather than downloaded

I searched for one. **No permissively-licensed 3D model of a real Gurugram
building is available to download.** The only Gurugram city model is paid and
not in glTF format; the free residential models on Sketchfab are behind an
account login and none are Indian architecture. Separately, no public sample
model uses the `Tower_` naming the viewer keys off — so none of them can
demonstrate tower selection at all.

### What is real and what is not

> **Important before showing this to anyone.**
> The project name (*Aravali Vista*), the pricing, the configurations and the
> handover dates in `src/data/towerMetadata.js` are **invented placeholders**.
> Only the locality — Sector 65, Golf Course Extension Road — is real.
> The 3D model is a representative massing model, **not a depiction of any real
> building**.
>
> I deliberately did not attach a real developer's brand to invented prices.
> Replace both the model and the copy before presenting this as a client's own
> project.

---

## 6. Bugs found by testing

These were all found by driving the app, not by reading the code. Listed because
they show which areas are fragile and worth regression-testing in Phase 2.

| # | Bug                                                        | Cause                                                                                                  |
| - | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1 | Infinite reload loop in development                        | Clearing the loader cache on unmount; React StrictMode's remount re-triggered it forever                 |
| 2 | Shadows silently downgraded                                | `PCFSoftShadowMap` was removed in three 0.186; `shadows="soft"` fell back with only a console warning    |
| 3 | Day lighting badly overexposed                             | Ambient + hemisphere + environment intensities all stacked too high                                      |
| 4 | Night highlight blew out to solid white                    | Emissive is absolute, so it dominates once scene lighting drops                                          |
| 5 | **Multi-file `.gltf` completely broken**                   | Relative paths resolve against the blob URL, and the rewriter skipped anything starting with `blob:`     |
| 6 | Camera never refitted on viewport change                   | Fit distance depends on aspect ratio; resizing *or entering fullscreen* left the project cropped         |
| 7 | Clicking a tall tower did nothing visible                  | Panel compensation scaled the whole fit distance; a side panel only crops width, not height              |
| 8 | 50 MB model reported as "163 KB"                           | Size read from the `.gltf` manifest alone, so the performance warning could never fire on multi-file     |

On #5 — I had told you multi-file `.gltf` worked before I had actually tested
it. It did not. Worth noting as a process point: claims about untested paths
are not reliable until exercised.

---

## 7. Known limits and caveats

Read this list before any client demo.

- **The repo is public.** https://github.com/amul67142/arvr is visible to
  anyone. One click in Settings → General makes it private.

- **Placeholder sales data.** See the warning in section 5.

- **Tower detection depends entirely on naming.** If the client's model does not
  use `Tower_` / `Building_` / `Block_` prefixes, nothing is selectable. The app
  degrades gracefully — it says so and points at the Model Inspector — but the
  selling feature is gone. **Ask any client for their model early** so the
  naming can be checked or fixed in Blender before a demo.

- **Framing a tower that is nearly as tall as the whole site is inherently
  limited.** If the tallest tower defines the site's bounding height, "fit the
  tower" and "fit the site" want similar camera distances, so the flight is less
  dramatic. Visible on Tower C in the demo model.

- **Very large models take time to parse.** Sponza (50 MB, 71 files) takes a few
  seconds. The progress bar is accurate throughout; the main thread is not
  blocked.

- **Git identity.** Commits use the name `amul67142`, set locally for this repo
  only. Change with `git config user.name "Your Name"` in the project folder.

- **Desktop-first.** 1920×1080, 1440×900 and 1366×768 are the target. Tablet
  works. Mobile shows a simplified icon-only UI — functional, not polished.

---

## 8. What is deliberately not built

Per the brief, none of these exist yet:

floor selection · unit selection · inventory · price filtering · apartment
walkthrough · amenities · sunlight simulation · lead tracking · AI behaviour
analysis · AI unit recommendations · CRM · personalised brochure

### The seams that are already in place

The architecture was built so these are additive, not a rewrite:

- **`selection` already carries a `level` field** (`'tower'` today). The reducer
  in `ViewerProvider.jsx` can grow a selection *stack* for Tower → Floor → Unit
  without touching the components that read it.
- **Tower detection returns `{ id, name, object }` pairs** from a generic prefix
  matcher. Floor and unit prefixes are a table addition in `modelUtils.js`, not
  new logic.
- **`EXPLORE TOWER`** in the info panel is present but disabled — the entry
  point for the drill-down.
- **Raycasting can be re-enabled per subtree.** The original `raycast` is
  preserved on `userData`, so floors inside a selected tower can be made
  hit-testable on demand.
- **`src/data/towerMetadata.js` is the single data seam.** Every piece of sales
  copy the panel renders comes from there and nowhere else. A CMS or CRM feed
  plugs in at exactly one place.

---

## 9. Options for Phase 2

Not a recommendation — these are the realistic directions, with their
tradeoffs, so you can choose.

### Option A — Floor and unit selection (the natural next step)

Extend the drill-down to Tower → Floor → Unit. Highest sales value, and the
architecture is already shaped for it.

- **Needs from the client:** a model with floors named inside each tower, or a
  decision to generate floor bands procedurally from the tower's bounding box.
- **Risk:** entirely dependent on model naming. Worth resolving before
  committing.

### Option B — Real project data instead of placeholders

Replace `towerMetadata.js` with real inventory: unit counts, availability,
prices, floor plans.

- **Decision needed:** hard-coded JSON, a CMS, or the first backend. Adding a
  backend changes the frontend-only constraint, so it is a deliberate call.

### Option C — Client-ready polish

Project branding, a logo, a proper intro sequence, a shareable build deployed to
a URL rather than run locally.

- **Lowest risk, fastest to demo.** Does not need a client model to proceed.

### Option D — Harden what exists

Handle a real client model end to end: naming conventions, optimisation guidance
(Draco compression, texture budgets), and a written spec you can hand to a
developer's 3D team so their model arrives ready to use.

- **Most valuable if a specific client is close.** Prevents the demo-day failure
  where the model simply is not selectable.

### Open question for you

The biggest unknown is **whether you have a real client model yet**. If one is
coming, Option D first will save the most pain. If this is still a speculative
pitch, Option C makes it presentable soonest, and Option A makes it most
impressive.
