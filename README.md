# Interactive Real Estate Experience — Phase 1

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

## What Phase 1 deliberately does not do

No floor selection, unit selection, inventory, pricing filters, walkthroughs,
CRM, analytics or AI. The seams are in place: `selection` in the viewer context
already carries a `level`, tower detection returns `{ name, object }` pairs, and
`Explore Tower` in the info panel is the entry point for the
Tower → Floor → Unit drill-down.
