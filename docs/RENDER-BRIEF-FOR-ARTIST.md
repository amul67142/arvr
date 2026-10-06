# Brief for the render artist

What to ask for in the meeting, and why each item exists. The client-facing
checklist is in `PANOM-TEARDOWN-AND-CLIENT-REQUIREMENTS.md`; this one is the
production spec — the sheet you hand to the person actually pressing render.

**What we are building.** The buyer turns the building with a drag, hovers a
floor and sees what is available on it, opens a flat, reads its plan, then
walks that flat in 360°. Nothing is modelled by us on the fly: every screen is
the studio's render with a clickable layer on top.

---

## 1. The one thing that decides quality of the clickable layer

The renders decide how it *looks*. A second, almost free render pass decides
how *exact* the clickable parts are — the difference between "roughly the 12th
floor" and "flat 12B's balcony, outlined to the pixel".

Three ways to get there, best first.

### A. ID mask passes — ask for this

On the stop frames only (not all 240), render an extra pass where every thing
we must be able to click is its own flat colour:

- **Cryptomatte** (V-Ray, Corona, Redshift, Arnold, Blender all have it), or
- **Object ID / MultiMatte / Material ID** render elements.

One ID per clickable thing, named in the 3D scene so the ID carries a name:

```
T1_F12_A_Facade      the flat's facade
T1_F12_A_Balcony     its balcony      ← this is what makes balcony hover work
T1_F12_Slab          the floor band
Amenity_Pool         amenity pins on the site render
```

We turn each colour region into a polygon automatically. The hotspot then
matches the render pixel for pixel, at every angle, including odd shapes — a
curved balcony, a cut-back corner, a flat half-hidden behind another tower.

Requirements for the mask pass: same camera, same resolution, same frame
numbers as the beauty; **no** motion blur, depth of field, or glare on that
pass; PNG (or EXR for Cryptomatte), lossless. It costs the artist minutes —
no lighting, no GI.

### B. Camera + proxy geometry — nearly as good, no mask files

Give us instead:

- the animated camera as **FBX or Alembic**, with focal length, film gate and
  render resolution, and
- a **low-poly proxy** of the building (boxes are fine) with objects named as
  above.

We then compute the outlines ourselves, for *every* frame rather than only the
stop frames, so the highlight can follow the building while it turns.

### C. Nothing — what we do today

We read the tower's silhouette out of the footage and divide it by the floor
count. Fine for a plain extruded tower, and it is what the current Horizon One
demo does. It breaks on setbacks, podiums, crowns and curved facades, and it
can never give you balcony- or room-level hover.

**Ask the artist:** *"Can you give me Cryptomatte or MultiMatte elements on
selected frames, and the camera as FBX?"* If the answer is yes to either, we
are in Panom's league. If both, better than Panom.

---

## 2. The exterior orbit — the hero asset

- **Motion:** one full 360° turntable around the building, constant radius,
  constant height, camera aimed at the building's centre. No zoom, no focal
  change, no height change mid-orbit.
- **Frames:** 240 frames (1.5° apart) or 180 (2° apart). Numbered
  `orbit_day_0001.jpg` … — **frames, not a video file.** We come to rest on
  exact frames and draw on them; video compression and frame-seeking make that
  unreliable.
- **Resolution:** 3840 × 2160 minimum, 16:9, JPEG quality 90+ (or PNG).
- **Consistency:** locked exposure, white balance and sun position across the
  whole sequence. No motion blur, no depth of field, no lens distortion, no
  baked vignette — they smear the edges we trace against.
- **Variants:** Day and Night from *identical* cameras, so they can be swapped
  with a toggle. Dusk optional.
- **Stop frames:** every 12th–16th frame (13–20 of them). Those get the ID
  masks from §1.
- **Clean facades:** on stop frames, no tree, crane, label or foreground prop
  may cover a flat. If the landscaping does, send the same stop frames again
  with foreground vegetation hidden.

Per tower, if the project has several: the same again, closer in, one orbit
per tower — or at minimum four straight-on 4K elevations per tower (N/S/E/W),
Day and Night, with masks.

---

## 3. Interiors in 360° — one set per unit type

One panorama per room: living, dining, kitchen, each bedroom, each bathroom,
each balcony, utility.

- **Projection:** true equirectangular (spherical camera), **2:1 exactly**,
  full 360 × 180. Not a cropped or "little planet" projection, not stereo.
- **Resolution:** 8000 × 4000 or larger. (The samples we tested with were
  2000 × 1000 preview copies — soft when a buyer looks up close.)
- **Camera:** 1.5 m above the floor, perfectly level, the *same* height in
  every room, placed where a person would stand when entering.
- **Match between rooms:** same exposure, white balance and time of day, so
  moving room to room does not flash bright/dark.
- **Clean nadir:** no tripod, no camera artefact below.
- **With it:** each camera's position and facing marked on the 2D plan — that
  is how we put the doorway arrows in the right place.
- **Variants (optional):** furnished / unfurnished, day / evening, finish
  options. Each variant must reuse the same camera positions.
- **Naming:** `3bhk_living.jpg`, `3bhk_master_bedroom.jpg`, …

---

## 4. Plans

- **Typical floor plate** per tower, per distinct floor type (ground, typical,
  refuge, podium, top), 4K image **and** a vector version (PDF/DWG/SVG) with
  flat numbers on it. Vector means we can make each flat clickable exactly.
- **Unit plans**, one set per type: a furnished top-down 3D plan at 4K, plus
  the 2D plan with room names and dimensions, plus carpet / SBUA / balcony
  areas and a room list.
- **Master site plan**: top view, 6000 px wide or more; separate images or
  layers for ground, podium and terrace levels; the amenity list numbered as
  on the plan.

Flat numbers on the plans must match the inventory sheet exactly — that is the
join between the picture and the price.

---

## 5. Views from height (optional, strong seller)

360° panoramas shot/rendered from the balcony height of several floors — say
every 10th floor, or at 50/100/150/200/300/400 ft — one per facing.
Equirectangular, 8000 × 4000. This is what lets a buyer on the 31st floor look
out of *their* window.

---

## 6. If they can give 3D as well

For the walkable version of a flat (our 3D walkthrough view):

- **Format:** GLB or FBX. Real-world scale, in metres. Z-up or Y-up, just say
  which.
- **Budget:** under ~300k triangles for a flat; textures ≤ 2K, JPEG/PNG.
- **Materials:** standard PBR (base colour, roughness, metalness, normal).
  V-Ray/Corona-only materials do not survive the export — ask for a converted
  copy.
- **Names:** rooms named `Room_Living`, `Room_Master_Bedroom`, …; walls,
  doors and glass separate objects. We use those names to build the
  walkthrough's navigation automatically.

---

## 7. Naming and folders

```
project/
  orbit/day/orbit_day_0001.jpg … 0240.jpg
  orbit/night/orbit_night_0001.jpg …
  orbit/masks/orbit_stop_0013.exr …        (Cryptomatte or ID pass)
  towers/T1/elevation_north_day.jpg …
  interiors/3bhk/3bhk_living.jpg …
  plans/typical_T1.pdf, unit_3bhk_2d.pdf, unit_3bhk_3d.jpg
  site/master_plan.jpg, site/amenities/*.jpg
  camera/orbit_camera.fbx
  inventory.xlsx
```

Consistent, zero-padded numbers. No spaces in file names.

---

## 8. Ask for a pilot before the full render

Before the studio burns farm hours on 240 frames × 2 times of day:

> 10 orbit frames, **one** of them a stop frame with its mask pass and the
> camera file, one interior 360, one unit plan.

We run the whole pipeline on that and confirm the outlines land correctly. A
day's wait that protects the whole budget.

---

## 9. Checklist to run through in the meeting

1. Which renderer and version? Can you output **Cryptomatte** / MultiMatte?
2. Can you export the **camera** (FBX/Alembic) and a low-poly proxy?
3. Can the orbit be an exact turntable — fixed radius, height and focal length?
4. Day and night from the same cameras?
5. Are the facades clean of trees/props on stop frames, and can you send a
   no-foliage version if not?
6. Spherical camera for interiors at exactly 2:1, 8K wide, 1.5 m height?
7. Will you mark the 360 camera positions on the 2D plans?
8. Do the flat numbers on plans match the client's inventory sheet?
9. Delivery as numbered frames, not a video?
10. Timeline, revision rounds, and how files are delivered (drive/WeTransfer).
11. Who owns the renders and what we may publish — get it in writing.

## 10. If the budget is tight, this is the order

1. One orbit, day only, 180 frames at 4K, with masks on 13 stop frames.
2. Typical floor plate + unit plans for the top-selling types.
3. 360° interiors for one unit type.
4. Night orbit.
5. Per-tower orbits, views from height, amenity 360s, exterior walkthrough.

Items 1–3 already give the full flow: turn the tower → pick a floor → pick a
flat → read the plan → walk it in 360°.
