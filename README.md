# Interactive Real Estate Experience

A frontend-only 3D project viewer for real-estate sales. Upload a `.glb` or
`.gltf` masterplan from your computer and explore it in the browser: orbit the
project, hover and click towers, fly the camera to a building, read its details,
switch between day and night, and inspect every object inside the file.

There is no backend, no database, no authentication and no upload. The model is
read into a blob URL with `URL.createObjectURL()` and never leaves the machine.

## Running it

```bash
npm install
npm run dev
```

Then open the printed URL and drag a GLB onto the upload screen.

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build
npm run lint      # oxlint
```

## Models to try

`samples/gurugram-masterplan.glb` is the demo project: a Gurugram-style
high-rise condominium — four residential towers on a parking podium around a
central green, plus a clubhouse, pool, tennis court, driveway and landscaping.
447 objects, 46 KB.

It is the only sample using the `Tower_` / `Block_` naming, so it is the one
that exercises detection, hover, click-to-focus and the info panel. Four towers
are picked up by the `Tower_` prefix and the clubhouse by `Block_`. Regenerate
it with:

```bash
node scripts/make-project-model.mjs
```

It is a representative massing model at masterplan scale, not a depiction of any
real building. No permissively-licensed 3D model of an actual Gurugram project
is available to download, which is why it is generated rather than sourced. The
sales copy in `src/data/towerMetadata.js` is illustrative too — only the
locality is real. Replace both before showing this as a client's own project.

`samples/downloaded/` holds real-world models used to test the loader against
files this project did not author (git-ignored; re-download if missing):

| Model | Source | What it proves |
| --- | --- | --- |
| `DamagedHelmet.glb` | Khronos glTF-Sample-Assets, CC-BY | Full PBR: base colour, normal, metallic-roughness, emissive |
| `LittlestTokyo.glb` | three.js examples, CC-BY | `KHR_draco_mesh_compression` decoding, 215-object hierarchy |
| `Sponza/` | Khronos glTF-Sample-Assets, CC-BY | Multi-file `.gltf`: 1 manifest + `.bin` + 69 textures, 50 MB |

None of them have `Tower_` names, so they also exercise the "no named towers
detected" fallback and the Model Inspector.

## How a model becomes interactive

After the file is parsed, the scene is traversed once and every object whose
name begins with `Tower_`, `Building_` or `Block_` becomes a selectable
building. So `Tower_A`, `Building_01` and `Block_A` are all picked up;
a matching object also claims its subtree, so a nested `Tower_A_Core` does not
compete with `Tower_A` for the same click.

If nothing matches, the app does not break. It says so and points you at the
Model Inspector, where the whole object graph is listed, searchable, and any
object can be clicked to fly the camera to it.

Sales copy for each tower lives in `src/data/towerMetadata.js`. Unknown names
fall back to a plain "Selected Building" panel rather than erroring.

## GLB vs GLTF

**GLB is recommended** — it packs geometry, materials and textures into one
file. A `.gltf` references external `.bin` and texture files; drop the whole
folder (or select all the files together) and they are wired up through blob
URLs. A `.gltf` dropped on its own will usually fail to load, and the error
screen says so.

Draco, Meshopt and KTX2 compressed models are supported. The decoders are served
from `public/` rather than a CDN, so the viewer works offline.

## Structure

```
src/
  App.jsx                     upload -> loading -> viewer, no routing
  state/
    viewerStore.js            the context object + useViewer hook
    ViewerProvider.jsx        reducer: selection, focus requests, time of day
  components/
    upload/ModelUploader.jsx  drag/drop, file picker, validation
    viewer/
      ProjectViewer.jsx       canvas + overlay layout
      UploadedModel.jsx       GLTF loading, hover and click handling
      CameraController.jsx    OrbitControls + every camera move
      LightingController.jsx  day/night, baked environments
      GroundShadow.jsx        shadow catcher under the project
      ViewerControls.jsx      day/night, reset, inspector, fullscreen
      TowerInfoPanel.jsx      right-hand sales panel
      ModelInspector.jsx      object tree, search, scene stats
      LoadingOverlay.jsx      progress screen
  hooks/
    useUploadedModel.js       blob URL lifetime
    useModelObjects.js        one traversal -> towers, tree, stats, bounds
    useFullscreen.js
  utils/
    modelUtils.js             bounds, detection, hierarchy, stats, disposal
    cameraUtils.js            fit, focus, GSAP flights, orbit limits
    materialUtils.js          non-destructive hover/selection highlighting
    envUtils.js               day/night palettes, baked environment maps
  data/towerMetadata.js       placeholder sales copy
```

### Notes on the implementation

- **Camera fit is computed, never hard-coded.** Bounds drive the framing
  distance, the orbit min/max distance, the near/far planes and the shadow
  frustum, so any model scale works.
- **Framing survives a resize.** Fit distance depends on aspect ratio, so the
  camera is re-scaled whenever the viewport changes — a window resize, a tablet
  rotation, or entering fullscreen. The user's orbit angle and zoom are kept;
  only the distance is corrected.
- **Camera work is imperative.** GSAP tweens `camera.position` and
  `controls.target` directly; a 1.5 second flight costs zero React re-renders.
  Hover highlighting and the cursor label are handled the same way.
- **Imported materials are never mutated.** Highlighting clones a material per
  mesh and caches it, so shared materials do not light up the whole model.
- **Only buildings are hit-testable.** Everything else opts out of raycasting,
  which keeps pointer moves cheap on large scenes. Shadows switch off above
  2,500 meshes.

## Demo project and walkthroughs

On the upload screen, two demo cards each open a complete project built from the
files in `public/demo/`. **Skyline Heights** is a single 35-floor tower (`skyline.glb`, about 7 MB) on its own plot, with streets, a forecourt, a podium roof garden with a pool, and neighbouring blocks. It reuses the 3BHK and bedroom walkthroughs. **Aravali Vista** is:

| View | Type | File |
| --- | --- | --- |
| Masterplan | 3D | `masterplan.glb`, with 4 towers and a clubhouse |
| Tower D Exterior | Image | `tower-d-render.png` |
| 3BHK Walkthrough | Walkthrough | `unit-3bhk.glb` (about 11 MB) |
| Amenities Walkthrough | Walkthrough | `amenities.glb` (about 8.7 MB) |

Demo files are bundled with the app, so the project restores itself after a
refresh. Your own uploads still don't persist.

**Masterplan → floor → unit → inside.**
1. Click a tower, then choose a floor from the grid or click the floor on the
   building. The floor lights up in brass and the camera moves to it.
2. The panel lists the homes on that floor, with status, super area, facing and
   price. Pricing is the tower's ₹/sqft × super area, plus a floor rise above
   the 4th floor.
3. **Walkthrough** opens the view linked to that unit type. In the editor, you
   can relink unit types under *Unit Type Links*.
4. Clicking the clubhouse offers **Explore Amenities**.

All tower, unit and pricing data in `src/data/towerMetadata.js` is illustrative.

**Inside a walkthrough.**
- Drag to look around. Move with WASD or the arrow keys, and hold Shift to go
  faster.
- Click the floor to walk to that spot.
- Jump to any room from the list or the plan.
- Toggle day and night; lamps come on at night.
- Walls and furniture block you, and you step up onto kerbs and decks.

### What a 360° tour manifest can carry

`tour.json` describes the rooms. Beyond `src`, `look` and `links`, it accepts:

- `variants` + per-room `srcs` — day/night, furnished/unfurnished, finish
  options. The toggle appears only when a project declares more than one.
- `plan` — a floor-plan JSON (the same one the walkthrough and unit drawer
  use). It draws a mini-map with a dot per camera and a cone showing which way
  the viewer is facing; clicking a dot walks there.
- `at: [x, z]` and `faceAt` per room — where that camera stands on the plan,
  and the plan-space angle it opens facing. Until a studio marks these, they
  are set by hand and the cone is approximate.
- `tags` — notes pinned in the room (`u`, `v`, `label`, `text`) for
  dimensions, ceiling heights, finishes. Closed they are a dot.

Rooms behind the doors you can see are fetched in the background, so walking
through one is instant. Fullscreen and phone-tilt controls sit beside the room
label.

### Photographic views: 360° Rotation and 360° Panorama

These work the way Panom does. The quality comes from real footage or real renders, and the app only adds an interactive layer on top.

**360° Rotation**
- **Upload:** a drone orbit or a render-animation video (mp4, webm or mov). The browser splits it into 96 frames, and you drag to turn it.
- **Demo manifest:** the demo instead uses a manifest, `orbit.json`, which adds:
  - two frame tiers: 640 px previews for dragging, and 1280 px frames that swap in when you stop;
  - a traced tower outline for every frame: glowing, clickable, and able to light up any floor.
- **Tracing:** `scripts/build-horizon.mjs` makes the outline. It starts from keyframes read by eye, then snaps the tower's edges to every frame using the image itself.
- **Clicking the tower** opens the same floor → unit → tour panel as the 3D viewer.

**360° Panorama**
- Takes equirectangular photos or renders.
- A manifest such as `tour.json` lists several rooms.
- You drag to look around and scroll to zoom.

**Horizon One**, the third demo, is the refined version.
- **Stop frames:** every 12th frame is a stop frame. A drag coasts and settles on one, and the outline, label and clickable floors fade in only there.
- **Tower card:** hovering the tower shows floors, homes and availability.
- **Floors:** switch to Floors to hover and pick floors directly on the building. A floor opens as a plan of its four homes.
- **Homes:** the inventory, where hovering a card lights its floor on the tower.
- **Amenities:** a strip of amenity renders.
- **Size:** `public/demo/horizon`, about 47 MB. The 1280 px frames load only at rest, and the 640 px previews total about 9 MB.

### Interactive Render (the Panom technique)

`showcase` views put a clickable layer on fixed renders, called stop views. Each stop can carry:
- a building outline;
- one outline per floor;
- one outline per flat, coloured by type;
- amenity pins.

Beside the render sits a filterable inventory: BHK, facing, floor, maximum area, available only, and a shortlist. Hovering a card lights its flat on the render, and hovering a flat scrolls its card into view.

Clicking a flat opens its details, price and interior renders. Scroll to zoom, drag to pan, and double-click to reframe.

**Maple Court** (`public/demo/maple`, about 9 MB) is the demo. Its 29 flat outlines follow the render's own slab lines and brick piers; see `scripts/build-maple.mjs`. For a real project, the studio's Object ID masks would replace the manual measuring. See `docs/PANOM-TEARDOWN-AND-CLIENT-REQUIREMENTS.md`.

### Walkthrough naming contract

Any `.glb`/`.gltf` added as a *Walkthrough* view works if its nodes follow
these names. glTF `extras` arrive as three.js `userData`.

| Node name | Meaning |
| --- | --- |
| `Room_*` / `Zone_*` | A walkable floor with its own identity. extras: `{ label, order, area?, view: { x, z, yaw } }` |
| `Walk_*` | A walkable floor with no identity, such as paths or steps |
| `Water_*` | Visible only: you can neither walk on it nor bump into it |
| `Spawn` | The starting position. extras: `{ yaw }` |
| `Light_*` | A night light. extras: `{ intensity, color, distance }` |
| `Ceiling_*`, `Ground_Far`, `Rug_*` | Passive: never block movement |
| anything else | A collider |

Yaw is in radians: 0 looks down −Z, and positive values turn toward −X.

### Bringing in a real interior (3ds Max, SketchUp…)

- **Raw exports work as-is.** A raw export with no names can go straight into a Walkthrough view. The app finds the flat surfaces near the floor, treats them as the walkable floor, and starts you at the most open spot.
- **Prepared files look better.** For a better result, run it through the preparation script:

```bash
node scripts/prepare-interior.mjs interior.glb public/demo/master-bedroom.glb "Master Bedroom"
```

The script:
- names the floor, the ceiling and the rugs by the contract above;
- removes site-sized ground planes;
- gives each kind of object a material;
- simplifies dense meshes to 25k triangles each.

It recognises objects by their shape and position, not their names. Check the result.

**Materials:** 3ds Max's glTF exporter drops V-Ray and Corona materials. For the designer's real finishes:
- convert the materials to Physical Material (Scene Converter) before exporting; or
- send the FBX with its textures folder.

**Reusing furniture:** `scene.piece()` in `scripts/lib/scene.mjs` lifts furniture out of such a file by bounding box, so other builds can reuse it. The 3BHK uses it for its bed sets.

### Rebuilding the demo assets

```bash
node scripts/fetch-polyhaven.mjs      # CC0 models/textures -> .cache/polyhaven
node scripts/prepare-interior.mjs <raw.glb> public/demo/master-bedroom.glb   # needs the raw export
node scripts/build-apartment.mjs      # -> public/demo/unit-3bhk.glb (uses master-bedroom.glb)
node scripts/build-amenities.mjs      # -> public/demo/amenities.glb
node scripts/make-project-model.mjs   # -> public/demo/masterplan.glb
node scripts/build-bignonia.mjs       # -> samples/bignonia-tower-b.glb
node scripts/build-skyline.mjs <Exterior folder>   # -> public/demo/skyline.glb
```

- The architecture is generated in code.
- Furniture, decor and textures come from Poly Haven. They are merged,
  simplified, instanced, re-compressed as WebP and Meshopt-compressed with
  gltf-transform.
- Credits are in `public/demo/CREDITS.md`.

## Making a tower clickable (the hotspot pipeline)

Floors, flats and balconies become clickable from a `hotspots.json` baked out
of the studio's camera and proxy geometry — not from image processing. The full
reasoning is in `docs/HOTSPOT-PIPELINE-PLAN.md`.

```bash
node scripts/mock-studio.mjs                              # a synthetic studio delivery
node scripts/check-delivery.mjs public/demo/mock          # is a delivery usable?
node scripts/build-hotspots.mjs public/demo/mock --solve --verify  # -> hotspots.json
node scripts/test-camera-match.mjs public/demo/mock        # the solver's own tests
node scripts/trace-masks.mjs public/demo/mock --compare    # the fallback producer, graded
node scripts/verify-hotspots.mjs public/demo/mock --frames 8 --only T1_F18
node scripts/build-mock-project.mjs                       # -> orbit.json for the viewer
```

- `mock-studio` renders a tower, an Object-ID pass, a camera path and a named
  proxy, so the pipeline can be proved without waiting for a studio.
- `check-delivery` is the gate a real delivery passes before the full render is
  ordered: camera sanity, naming convention, ID pass matched to `colors.csv`.
- `build-hotspots` projects the proxy through each frame, resolves occlusion by
  casting a ray through the overlap, and writes polygons in frame fractions.
  An object's outline is the union of its projected triangles, not a convex
  hull, and occlusion is decided per solid piece — so a flat built as two piers
  either side of a recessed balcony keeps its notch instead of swallowing the
  balcony. `--hull` restores the old, faster, convex-only behaviour.
  `--verify` samples inside every polygon and reads the ID pass underneath, so
  the accuracy claim is measured rather than asserted.
- **Always pass `--solve` on a real delivery.** The focal length a studio states
  is a starting guess: V-Ray, 3ds Max, FBX and glTF each derive it differently.
  The solver rasterises the proxy's silhouette against one Object-ID frame and
  searches for the lens that makes them coincide, catching a Z-up proxy and a
  centimetre proxy on the way. With a lens 14° out, an unsolved bake scores 8.7%
  precision; solved, the same delivery scores 97.8%.
- `trace-masks` is the second producer, for studios that cannot export a
  camera: it walks the boundary of every coloured region in the ID pass and
  writes the same file. `--compare` scores it against the projector's polygons
  as intersection-over-union, which is how the two methods check each other.
- `verify-hotspots` draws the result back onto the frames. `--against` overlays
  a second file, so two producers can be compared by eye.

### Drawing or correcting hotspots by hand

```
http://localhost:5173/?trace=/demo/mock/orbit.json
```

The third producer, and the reason a render delivery can never dead-end. It
opens any project's manifest, loads whatever hotspots already exist, and lets
someone click polygons onto the frame: pick a home, a room, or a floor, click
points, press Enter to close. Wheel zooms, shift-drag pans, the previous
frame's outlines show through as onion skin, Ctrl-Z undoes. **Save** writes a
`hotspots.json` in the same format the two machine producers write — it shares
`scripts/lib/hotspots.mjs` with them, so the three cannot drift apart.

Use it when a studio can supply neither a camera nor an ID pass, and to correct
a machine-made file where one flat came out wrong.

A manifest points at the file with `"hotspots": "/demo/<project>/hotspots.json"`.
When it is present the viewer uses those polygons; when it is absent it falls
back to floor bands derived from the tower's silhouette.

## Putting a project on a website

Any published project (one whose files ship in `public/demo` and is listed in
`src/experience/demoProjects.js`) can run inside an iframe on another site.

In the editor, **Embed on a Website** builds the snippet: which view it opens
on, the frame size, and whether the project name shows inside the frame. The
URL is the app's own address plus `?embed=<project>`:

```html
<iframe
  src="https://tours.example.com/?embed=horizon-one"
  title="Horizon One - virtual tour"
  style="width:100%;aspect-ratio:16 / 9;border:0"
  loading="lazy"
  allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
  allowfullscreen
></iframe>
```

Parameters: `embed` (required, the project id), `view` (open on a view other
than the start one), `brand=0` (hide the project-name plate).

An embed boots straight into the customer-facing experience — no editor, no
upload screen — and neither reads nor writes localStorage, so it cannot
disturb a project being edited in another tab.

The host page can follow the visit:

```js
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'arvr-embed') return
  // { type: 'ready' | 'view', viewId, viewType, title, subtitle }
})
```

That is the hook for a site's own enquiry form: when a buyer opens a home,
the page knows which one.

Uploaded projects cannot be embedded — their files are blob URLs that die with
the tab, so there is nothing for a visitor's browser to fetch. Publish them
into `public/demo` first.

## What Phase 1 deliberately did not do

(Kept for history. The demo project above now covers floor selection, unit
selection and walkthroughs.)


No floor selection, unit selection, inventory, pricing filters, walkthroughs,
CRM, analytics or AI. The seams are in place: `selection` in the viewer context
already carries a `level`, tower detection returns `{ name, object }` pairs, and
`Explore Tower` in the info panel is the entry point for the
Tower → Floor → Unit drill-down.
