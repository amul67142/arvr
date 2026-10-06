# How Panom's showcase is built — and exactly what to ask a client for

Findings come from Panom's own public demo project, **Fortune Primero – Seven Sarjapur**. I opened it on 22 Sep 2026 and read the data its app loads (`api.panom.ai`), not only what's on screen. All numbers below come from that data.

---

## 1. The short answer

- **No live 3D.** Everything the buyer sees is a render or a photo made in advance by the developer's rendering studio.
- **An interactive layer on top.** Panom adds labels, outlines, pins, filters and pop-up cards.
- **The key trick is stop frames.**
  - The aerial orbit has 220 frames, and every frame exists as both a Day and a Night render.
  - Only 13 frames are "stop" frames, one roughly every 15–20 frames. When you let go, the rotation always settles on one of them.
  - All outlines (towers, flats, floors) are hand-drawn on those 13 stop frames only, and hidden while you're turning.
  - That's why they are perfectly clean. Nobody tracks the building frame by frame; the outlines exist only on frames where they were drawn exactly.
- **One outline per flat on the render, each linked to that flat's record.** The main orbit alone has 252 flat-type outlines: 39 2BHK, 182 3BHK and 26 4BHK. Each tower view adds its own per-flat and per-floor outlines on top of that (see section 2). Clicking an outline opens the flat's data.

**Why our Horizon One demo looked different:**
- **Tracked outline.** We had one real drone clip and one tracked outline, with floors spaced by a calculation, not a traced shape per flat.
- **Rooms from other homes.** Our 360° rooms were free photos from unrelated houses. In Panom, every room belongs to that unit type's own renders.

**Only the project's own renders produce the Panom result.**

---

## 2. Everything in the sample, screen by screen

The project holds **222 views**:
- 173 image sequences or single images;
- 46 unit-type views;
- 1 panorama;
- 1 map;
- 1 gallery.

**Side menu:** Home · Aerial 360 · Location Map · Master Layout · Exterior VT · Gallery · Contact Us · Search.

### A. Home: aerial orbit of the whole project

- **Frames:** 220 frames, counter-clockwise, each in Day and Night, with a Day/Night toggle.
- **Quality tiers:** each frame is stored as a preview, a medium and a high tier (4K).
  - The preview tier loads first, with a budget of about 2.5 MB for the whole preview set.
  - Sharper tiers load when you stop.
- **Stop frames:** 13 of the 220.
- **Overlay modes** (a variation set, "Tower / Type / Amenities"):

| Mode | What the buyer sees |
| --- | --- |
| **Tower** | 4 tower outlines (gold) and tower name tags: 52 tag hotspots, drawn vertical or horizontal |
| **Type** | Every flat outlined and coloured by BHK: 2BHK blue, 3BHK purple, 4BHK pink |
| **Amenities** | 34 amenity pins |

- **Clicks:** an outline either jumps to the tower's own view at a matching frame, or opens the record.
- **Other controls:** a compass (north is set per view), a hide-overlays toggle, fullscreen, and prev/next arrows.

### B. Tower view, one per tower (Tower 1–4)

- **Frames:** its own 220-frame close orbit of that tower, Day and Night.
- **Outlines** on the stop frames and the straight-on elevation:
  - **flat outlines:** 118 3BHK and 38 4BHK, one per flat per floor, clicking through to the flat;
  - **floor outlines:** 41, one per floor, clicking through to the floor;
  - **balcony-view outlines:** 24 that open a pop-up of the actual view from that height;
  - amenity pins and the clubhouse outline.
- **Mode switch:** Select Unit / Select Floor / Views.
- **Tower card:** tower name, total floors (41) and total flats (164).
- **Inventory panel,** shown beside the tower:
  - filters for BHK (slider), SBUA range (slider), facing (N/S/E/W) and interior tour;
  - flat cards showing flat number, BHK, SBUA, carpet area and facing, plus a favourite heart;
  - a count, for example "164 of 164 records". Hovering a card highlights the flat on the render, and hovering the render highlights the card.

### C. Floor plans: "typical plans", one image per floor type per tower

- **Floor types:** for example T1 1st, 7th, 19th, 28th, 41st and Typical, for each of the 4 towers.
- **On each plan:** each flat is an outline, linked to its record.

### D. Unit-type views, one per type (46 of them)

- **Naming:** by size, BHK and type, for example `1741sqft_3BHK_TYPE_5`.
- **The plan:** a floor-plan render with room labels such as "Living / Dining", and dimension markers (11 on that type).
- **Toggles:** furniture on/off, dimensions show/hide, specifications on/off.
- **Interior tour:** linked from the unit record.

### E. Exterior VT: a virtual walk around the site

- **Panoramas:** 96 360° panoramas, in Day and Night versions.
- **Mini-map:** a "radar" map of the site plan showing where you are and which way you face. Clicking a point on it jumps to that panorama.
- **Moving around:** hundreds of "go to" points link the panoramas, so you walk from one to the next. Drone panoramas are mixed in.

### F. Aerial 360: a drone panorama from above the site

- **Heights:** Bird's eye, 100, 200, 300, 400 and 500 ft. This is the view you'd get from different floors.
- **Place tags:** nearby places tagged by category (Hospitals 9, IT Parks 11, Schools & Colleges 9, Shopping 3, Transit 2), each backed by a record.
- **Tower outlines** inside the panorama, Day and Night.

### G. Location map

- **Map:** a Google-style road map with nearby places.
- **Travel info:** travel time and distance from the project ("map time & distance" feature).

### H. Master layout: the site plan

- **Layers** by level: outdoor, podium and terrace amenities.
- **Amenity pins:** 119, each jumping to that spot in the Exterior VT.
- **Type zones:** flat-type zones on the plan.

### I. Gallery, and Contact Us

### J. Platform features switched on for this project

- public share links;
- embedding on the developer's website;
- signed-in visitors;
- offline caching for the sales gallery;
- 4K resolution;
- image optimisation;
- video on hotspots;
- voiceover with music;
- variation sets (Day/Night, furniture, dimensions, construction updates by month);
- inventory management;
- channel-partner licences;
- smart search;
- map time & distance;
- Panom branding removed.

**On the paid tiers only** (Growth and Max): lead capture and CRM, analytics, AI chat, AI voice agent, video calls and call recording.

### K. The data behind it: a small built-in database

**Towers:** name, tower, total floors, SBUA, carpet area, total flats.

**Flats:**

| Field | Type | Buyers can filter on it |
| --- | --- | --- |
| Name / Flat No | Text | |
| BHK | Number | Yes |
| SBUA (super built-up area) | Number | Yes |
| Carpet area | Number | |
| Facing | Choice | Yes |
| SBUA range | Text | Yes |
| Series / stack no. | Text | |
| Interior VT | Text | Yes |
| Views | Link to views | |

**How the pieces connect:** every outline on every render is linked to one of these records. That link is what makes "hover a flat, see its card" work.

---

## 3. What to ask your client (or their rendering studio) for

Give this list to the client. Items marked ★ are essential for a Panom-level result.

### 3.1 Aerial orbit of the whole project ★

- **Frames:** 180–240 frames covering a full 360°, all from the same height and distance, camera aimed at the site centre, in one consistent direction.
- **Resolution:** 3840 × 2160 (4K), PNG or high-quality JPG.
- **Versions:** Day and Night, rendered from exactly the same cameras. Dusk is optional.
- **Stop frames:** 12–16 of them, evenly spaced (for example every 15th frame).
  - **Masks for stop frames** (Object ID or Cryptomatte render elements): one per tower, one per flat, one per floor. With these we generate every outline automatically and pixel-perfectly. Without them we trace by hand (see 4.2).
- **Camera file:** the camera path (FBX or .max camera). Optional, but useful.

### 3.2 Close orbit or elevations of each tower ★

- **Best:** a 180–240-frame orbit per tower, same specifications as 3.1, with masks on the stop frames. At minimum, a straight-on 4K elevation render of each facade (4 per tower), Day and Night.
- **Visibility:** every flat's facade must be visible and unobstructed by trees or labels.

### 3.3 Balcony and window views from height

- **What:** drone photos or drone 360° panoramas taken above the site at several heights, for example 50, 100, 150, 200, 300 and 400 ft. They're used for "view from your floor" and for Aerial 360.
- **Format:** 360° panoramas as equirectangular images at 8000 × 4000 or larger.

### 3.4 Master layout / site plan ★

- **Image:** a top-view render at 6000 px or wider. Separate layers or images for ground, podium and terrace, if there are amenities on several levels.
- **Amenity list:** each amenity's name and number as on the plan, plus one or two lines of description.

### 3.5 Floor plans ★

- **Typical plans:** one per tower per distinct floor type (ground, 1st, typical, refuge, podium, top/penthouse), as clean 4K images with flat numbers marked.
- **Masks:** a mask or CAD layer per flat helps; otherwise we trace.

### 3.6 Unit-type plans ★ (one set per unit type)

- **3D plan:** a furnished top-down 3D floor-plan render at 4K. An unfurnished version is optional.
- **2D plan:** with room names and dimensions (PDF or CAD).
- **Details:** carpet area, SBUA, balcony area, and a room list.

### 3.7 Interior virtual tours ★ (one set per unit type)

- **Panoramas:** one 360° render per room (living, dining, kitchen, each bedroom, each bath, each balcony, and utility), at 8000 × 4000 equirectangular.
- **Positions:** the position and facing of each panorama camera, marked on the 2D plan, so we can place "walk to next room" arrows and the mini-map.
- **Optional:** Day and Night, furnished and unfurnished, or specification variants.

### 3.8 Exterior walkthrough

- **Panoramas:** 360° renders along the site's paths (entrance gate, drop-off, lobby, clubhouse, pool, gardens, play area, sports), at 8000 × 4000.
- **Positions:** marked on the master layout. Panom's sample has 96; 20–40 is a good start.

### 3.9 Inventory sheet ★ (Excel, one row per flat)

| Column | Example |
| --- | --- |
| Tower | T1 |
| Floor | 12 |
| Flat no. | T1-1203 |
| Unit type | 3BHK Type 5 |
| BHK | 3 |
| Carpet area (sq ft) | 1072 |
| SBUA (sq ft) | 1741 |
| Balcony area | 96 |
| Facing | East |
| Series / stack | 03 |
| View category | Garden / Road / City |
| Base rate (₹/sq ft) | 12,500 |
| Floor rise and PLC charges | as per the price sheet |
| Status | Available / Booked / Sold / Hold |

**Also send:** tower details (total floors, total flats), the payment plan, and a note of how often the sheet will be updated.

### 3.10 Location

- **Coordinates:** project address and latitude/longitude.
- **Nearby places** the client wants highlighted, by category: schools, hospitals, IT parks, malls, metro and transit, airport. We work out travel time and distance.

### 3.11 Brand and legal

- logo (SVG or large PNG), brand colours and fonts;
- project name and tagline;
- RERA registration number and the disclaimer text ("visuals are artistic representations…");
- the domain the showcase will be embedded on.

### 3.12 Extras (nice to have)

- a walkthrough video, a brochure PDF and gallery images;
- a specifications list;
- monthly construction-progress photos;
- a voiceover script or recording with background music.

### 3.13 For enquiries and bookings

- sales contact numbers, email, and WhatsApp;
- the CRM in use (for sending leads);
- if online booking is wanted: the payment gateway account (Razorpay KYC) and the booking amount.

---

## 4. What we build on our side

### 4.1 Already built in our app

- a drag-to-rotate frame player with preview and full-resolution tiers;
- a 360° panorama viewer;
- floor → flat → tour panels with pricing;
- 3D masterplans and walkthroughs;
- demo projects.

### 4.2 Needed to match Panom

1. **Stop frames:** the rotation settles on stop frames, and outlines appear only there, using drawn outlines, not tracking.
2. **Outlines from the studio's masks:** if the studio sends Object ID or Cryptomatte masks, a script converts every tower, floor and flat mask into clean outlines automatically.
3. **An outline editor for when there are no masks:** click points around a flat on a stop frame, and link it to a flat record. Panom's team does this by hand too.
4. **Overlay modes:** Tower / Type / Amenities, with type colours.
5. **Inventory panel:** filters (BHK, area range, facing, status), flat cards and favourites, with card hover linked to render hover.
6. **Day/Night switch** on the frame sequences.
7. **Floor-plan views** with per-flat outlines, and unit-type views with dimension markers and furniture/dimension toggles.
8. **Tours:** interior and exterior virtual tours with a mini-map, "walk to next panorama" points and warp transitions.
9. **Aerial 360:** a heights switch and nearby-place tags.
10. **Location map:** with travel time and distance.
11. **Inventory import:** from the client's Excel, so status and price updates need no code.
12. **Sharing:** share link and embed code, plus enquiry and booking capture.

---

## 5. The one-line summary for the client

> *"Send us your aerial orbit renders (Day and Night, with object-ID masks on the stop frames), tower elevations, typical floor plans, a 3D plan and 360° interior renders for each unit type, 360° exterior renders along the site, drone panoramas at a few heights, your master layout, your inventory Excel and your branding. We turn them into an interactive showcase where buyers turn the project, pick a tower, floor and flat, and walk through it."*
