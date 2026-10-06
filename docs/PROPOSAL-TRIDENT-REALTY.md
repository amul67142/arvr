# Proposal — Trident Realty project website with an immersive booking experience

**Prepared for:** Trident Realty
**Prepared by:** _[your company name]_
**Date:** 23 September 2026
**Version:** 1.0

---

## 1. What we are proposing, in one page

A website for the project that does two jobs.

**Job one — sell to the visitor who found you online.** Every unit in the
project, listed, filterable and priced, with plans, availability and a clean
enquiry path. This is Phase 1, and it goes live on its own.

**Job two — close the buyer sitting in front of your sales executive.** The
same inventory, now wrapped in an immersive tour: the buyer turns the tower,
picks a floor, sees which flats are free on it, opens the floor plan, walks
their own flat in 360° — and books it on the spot by paying the token amount,
before the emotion of the tour wears off. This is Phase 2.

The second half is the point. A virtual tour that ends in "please fill this
enquiry form" wastes the moment it just created. Ours ends in a blocked unit,
a paid token and a receipt on the buyer's phone, with the unit marked sold the
instant the payment clears — so no two executives can sell the same flat.

**Why us:** the immersive engine is already built and running. Tower orbit,
floor selection, live inventory, floor plans, 360° interiors and a walkable
3D flat all work today in our demo. We are not prototyping that from zero for
Trident — we are configuring it with Trident's renders and inventory.

---

## 2. Phase 1 — The project website (inventory-led listing)

A fast, mobile-first site whose job is to present the project honestly and
capture qualified leads.

### 2.1 Pages

| Page | What it holds |
| --- | --- |
| Home | Project hero, positioning, key numbers, RERA line, primary CTA |
| Overview | Location, connectivity, approvals, possession timeline, developer note |
| Unit listing | **Every unit in the project** — filter by tower, BHK, floor, facing, area, budget, availability |
| Unit detail | Plan, area break-up (carpet / built-up / SBUA), facing, floor, indicative price, status, enquire / call-back |
| Floor plans | Typical floor plates per tower, unit plans per type |
| Amenities | Gallery of amenity renders with descriptions |
| Gallery | Exterior and interior renders, site progress photos |
| Location | Map, distances, landmarks |
| Contact | Site address, sales numbers, WhatsApp, enquiry form |
| Legal | RERA details, disclaimers, privacy policy, terms |

### 2.2 The inventory engine (the part that matters)

- One source of truth for every unit: tower, floor, flat number, type, carpet
  area, SBUA, facing, price basis, status.
- Bulk upload from the sales team's existing Excel sheet; re-upload updates
  prices and availability without a developer.
- Status model: Available → Blocked → Booked → Sold, plus Hold and Not for
  sale. Status changes are logged with who and when.
- Availability shown publicly at the level Trident chooses — full detail, or
  only "available / sold out" per type. Prices can be public, on-request, or
  visible only to logged-in sales staff.

### 2.3 Lead capture

- Enquiry forms with phone OTP verification, so the sales team stops chasing
  junk numbers.
- Every lead records what the visitor was looking at — which tower, floor and
  unit — so the first call starts from something real.
- Instant WhatsApp / SMS / email acknowledgement to the buyer, instant alert
  to the assigned executive.
- Leads land in an admin dashboard and, if Trident wants, are pushed into the
  existing CRM (see §5.3).

### 2.4 Admin panel

- Inventory upload and inline editing, price list management, status changes.
- Lead inbox with assignment, status, notes and export.
- Content editing for gallery, amenities, FAQs and legal text.
- Roles: Admin, Sales Head, Sales Executive, Finance, Marketing (read-only).

### 2.5 Also included in Phase 1

- SEO foundation (titles, schema markup for the project and units, sitemap),
  Google Analytics 4 / GTM, Meta Pixel, and call-tracking numbers if supplied.
- Performance target: largest-contentful-paint under 2.5 s on 4G mobile.
- Accessibility to WCAG 2.1 AA for the content pages.
- Responsive from a 360 px phone to a sales-lounge display.

---

## 3. Phase 2 — The immersive experience and direct booking

### 3.1 The buyer's journey

1. **The tower.** A drone or render orbit the buyer drags to turn. The
   building is outlined; hovering shows the project's numbers.
2. **The floor.** Floors are individually highlighted on the building. Hover
   one and it shows "4 of 4 homes available, from ₹X Cr". Click it.
3. **The homes on that floor.** The floor plate opens, cut into its flats and
   coloured by type, sold ones greyed. A list beside it carries flat number,
   type, area, facing, status and price.
4. **The home.** A panel with the full detail, the floor plan drawn to scale,
   interior renders, and the price break-up.
5. **The tour.** From that panel the buyer enters a 360° walk-through of that
   flat type — room to room through doorway arrows — or a walkable 3D model of
   it, or a view from that floor's balcony height.
6. **The booking.** A **Book this home** action, live in the same screen.

Steps 1 to 5 are working software today. Step 6 is what Phase 2 adds, along
with replacing our demo renders with Trident's.

### 3.2 Salesman mode — the tool your team actually uses

A logged-in mode of the same site, built for a tablet or the sales lounge
screen, because this is where the booking is captured.

- **Presentation view:** full screen, no browser clutter, tour controls large
  enough for a finger.
- **Live inventory:** what the executive sees is what the system has this
  second; a flat booked in another office turns grey in front of them.
- **Block a unit:** a one-tap soft hold with a visible countdown
  (configurable, e.g. 30 minutes). Held units cannot be sold by anyone else.
  Holds expire automatically and release the unit.
- **Cost sheet on screen:** base price, floor rise, PLC, parking, club and
  maintenance charges, statutory charges, GST — computed from the rate card,
  not typed by hand. Printable and shareable as PDF.
- **Collect the token.** See §3.3.
- **Post-sale handoff:** on success the unit's status, the buyer's details and
  the payment reference reach the CRM and the finance team without re-entry.
- **Per-executive dashboard:** tours given, units blocked, tokens collected,
  conversion — by day, by executive, by tower.

### 3.3 Taking the token payment — exactly how it works

```
Executive blocks the unit  →  buyer's details captured (phone OTP verified)
        →  cost sheet shown and agreed  →  token amount confirmed
        →  system creates a payment request against that unit
        →  buyer pays on their OWN phone (UPI QR / payment link by SMS+WhatsApp)
        →  gateway confirms to our server by signed webhook
        →  unit flips to "Booked — token received", atomically
        →  receipt PDF auto-generated; SMS/WhatsApp/email to buyer
        →  CRM + finance notified; sales head sees it live
```

Principles we will not compromise on, and which you can state to your
compliance team:

- **Money moves directly into Trident Realty's own merchant account.** We
  never hold, route or touch funds. The gateway settles to Trident on its
  normal cycle.
- **The buyer pays on their own device.** The executive never types a card
  number, CVV, UPI PIN or OTP. This protects the buyer, the executive and
  Trident, and keeps the system out of PCI-DSS scope: no card data ever
  reaches our servers or the tablet.
- **The unit is never double-sold.** The booking is written in a single
  database transaction with a lock on that unit. Two executives pressing
  "book" on the same flat at the same second produce one booking and one
  clear "this unit was just taken" message.
- **No money, no booking.** The status only changes on the gateway's signed
  server-to-server confirmation, never on what the browser says. A failed,
  abandoned or timed-out payment releases the hold and returns the unit to the
  market automatically.
- **Everything is auditable.** Every hold, release, payment attempt, status
  change and refund is logged with user, time, IP and gateway reference, and
  is exportable for audit.
- **Refunds and cancellations** are performed by Finance from the admin panel
  against Trident's published policy, with a reason and an audit trail. We
  will not automate refunds without Trident's finance sign-off.

Payment methods: UPI (QR and intent), net banking, debit and credit cards,
and — where the gateway supports it and Trident enables it — NEFT/RTGS
reference capture for larger tokens. Gateway options: Razorpay, PayU or
Cashfree; the choice is Trident's, and we integrate one.

### 3.4 Legal and regulatory wrapper (to be finalised with Trident's counsel)

The booking screen will carry, before the pay button:

- RERA registration number of the project and the agent, and the RERA website
  link.
- A plain statement that the token is an **expression of interest / booking
  amount**, that it does not constitute an allotment, and that allotment is
  subject to Trident's acceptance and execution of the application and
  agreement to sell.
- The cancellation and refund policy, with timelines, shown and ticked.
- That prices, areas, and images are indicative and subject to change, and
  that renders are artist impressions.
- GST treatment of the token, and the invoice/receipt that will follow.
- Consent for data processing under the DPDP Act 2023, and the privacy policy.

**Trident supplies the legal text; we build the flow around it and keep a
versioned record of which text each buyer accepted.**

---

## 4. What we need from Trident Realty

Nothing below is optional for the phase it sits in. The project's timeline
starts from the date these arrive, not from the date of signing.

### 4.1 For Phase 1

| # | Item | Detail |
| --- | --- | --- |
| 1 | Inventory sheet | Excel, one row per unit: tower, floor, flat no., type, carpet, built-up, SBUA, balcony area, facing, base rate, floor rise, PLC, parking, status |
| 2 | Rate card / cost-sheet formula | How a final price is computed, including all charges and GST |
| 3 | Floor plans | Typical floor plate per tower and per floor type; unit plan per type, with dimensions. PDF or CAD preferred over images |
| 4 | Master / site plan | Top view, with amenities numbered and named |
| 5 | Renders and photography | Exterior, interiors, amenities, site progress. Highest resolution available |
| 6 | Project content | Specifications, approvals, possession dates, USPs, developer profile |
| 7 | Legal text | RERA numbers, disclaimers, privacy policy, terms of use |
| 8 | Brand assets | Logo files, fonts, colour codes, brand guidelines |
| 9 | Domain and DNS access | Or authority to a staging subdomain until go-live |
| 10 | Contact points | Sales numbers, WhatsApp business number, enquiry recipients, escalation |
| 11 | Sign-off owner | One named person empowered to approve content and design |

### 4.2 Additional, for Phase 2

| # | Item | Detail |
| --- | --- | --- |
| 12 | Tower orbit renders | 180–240 frames, full 360°, 4K, day (night optional). **Delivered as numbered frames, not video** |
| 13 | ID / Cryptomatte mask passes | On 13–20 stop frames of that orbit, one ID per flat, per floor and per balcony. **This is what makes each floor and flat clickable to the pixel** |
| 14 | Camera file | The orbit camera as FBX/Alembic, plus a simple massing model — an alternative to (13) |
| 15 | 360° interiors | Equirectangular, exactly 2:1, 8000 × 4000, one per room, camera at 1.5 m, one set per unit type, camera positions marked on the 2D plan |
| 16 | Unit 3D model | GLB/FBX in metres, under ~300k triangles, PBR materials, rooms named — for the walkable flat |
| 17 | Views from height | 360° panoramas at several floor heights, per facing (optional, strong seller) |
| 18 | Payment gateway account | Trident's own merchant account, KYC complete, test and live API keys, settlement account confirmed |
| 19 | Token amount policy | Amount or formula per unit type, and whether it is editable by the executive |
| 20 | Booking T&C and refund policy | Legally approved text, in the exact words to be displayed |
| 21 | Sales team list and roles | Who may block, who may book, who may refund, approval limits |
| 22 | CRM details | Which CRM, and API access or a named contact at the CRM vendor |

**A detailed technical brief for items 12–17, written for the rendering
studio, is attached as `RENDER-BRIEF-FOR-ARTIST.md`.** It specifies frame
counts, resolutions, mask passes, camera settings, naming and folder
structure, and asks for a small pilot batch before the full render, so nothing
is wasted. Handing that document to the studio directly will save a round of
rework.

### 4.3 Decisions Trident needs to make before Phase 2 starts

1. Are prices public, on request, or sales-login only?
2. Is live availability public, or only per unit type?
3. Token amount: fixed, percentage, or per unit type? Editable in the field?
4. Hold duration before an unblocked unit returns to the market.
5. Who can override a hold or cancel a booking?
6. Which payment gateway.
7. Does the buyer get a digital application form and e-signature now, or in a
   later phase?

---

## 5. Scope of work

### 5.1 Phase 1 — deliverables

- Discovery: one workshop, inventory and content audit, sitemap, success
  metrics.
- Design: wireframes for every template, then visual design for home, unit
  listing, unit detail and one content page; the rest built to the system.
- Build: responsive website with all pages in §2.1.
- Inventory module: schema, Excel import, validation, status model, admin UI.
- Lead module: forms, OTP verification, notifications, dashboard, export.
- Admin panel with roles.
- Integrations: analytics, pixels, WhatsApp click-to-chat, email/SMS provider.
- Testing on the browsers and devices agreed in §8, with a test report.
- Deployment, DNS cut-over, SSL, backups, monitoring.
- Handover: admin training session (recorded), user manual, source code.

### 5.2 Phase 2 — deliverables

- Immersive experience configured with Trident's renders: tower orbit,
  clickable floors, floor plates, unit panels, 360° interiors, walkable 3D
  flat for the primary unit types.
- Processing pipeline for the studio's deliverables: frame optimisation,
  mask-to-hotspot conversion, plan digitisation, model optimisation for web.
- Embedding: the experience runs inside the Phase 1 site, and can equally be
  embedded on a microsite or a portal listing.
- Booking engine: hold, cost sheet, buyer capture with OTP, payment request,
  gateway integration, webhook handling, atomic status change, receipt
  generation, refund action for Finance.
- Salesman mode: tablet-optimised presentation, login, live inventory,
  per-executive dashboard.
- Notification set: buyer receipt and confirmation, executive alert, sales
  head alert, finance daily digest.
- Reconciliation report: every payment against every unit, exportable.
- Security review of the payment flow and a penetration test of the booking
  endpoints before go-live.
- Training for the sales team (on-site, one session per office) and a
  one-page field guide.

### 5.3 Phase 3 — optional, priced separately

- Two-way CRM/ERP integration (Salesforce, Sell.do, In4Velocity, Farvision or
  similar), so inventory and leads live in one place.
- Digital application form with e-signature (Digio / Leegality / NSDL).
- Channel-partner portal: partner logins, their own inventory view,
  attribution of the booking to the partner, commission reporting.
- Multi-project rollout: the same platform, more Trident projects, one admin.
- Construction-progress module and customer login for payment schedules.
- Multi-language, and a Hindi voice-over guided tour.
- VR headset build of the walkthrough for the experience centre.
- AR: place the tower on the site plan through a phone camera.

---

## 6. Technical approach

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React + Next.js, server-rendered | SEO for the listing pages, speed on mobile |
| Immersive layer | Our existing React + Three.js engine, embedded | Already built and proven; runs in any page as an iframe with a message channel back to the host |
| Backend | Node.js API, PostgreSQL | Transactional integrity — the property of the database that makes double-booking impossible |
| Media | Object storage behind a CDN | Orbit frames and 360° panoramas are large; they must stream from the edge |
| Payments | Razorpay / PayU / Cashfree, hosted checkout | Funds settle directly to Trident; no card data touches our systems |
| Hosting | Managed cloud in an Indian region | Data residency, latency, DPDP alignment |
| Auth | Role-based, OTP for buyers, password + 2FA for staff | |

Non-functional commitments: encrypted in transit and at rest; daily automated
backups with a tested restore; uptime monitoring with alerting; rate limiting
and bot protection on forms and payment endpoints; a full audit log; and an
architecture that carries Trident's other projects without a rebuild.

---

## 7. Timeline

Indicative, in working weeks, assuming the inputs in §4 arrive on time and
feedback returns within 3 working days.

| Phase | Stage | Weeks |
| --- | --- | --- |
| 1 | Discovery and content/inventory audit | 1 |
| 1 | Design | 2 |
| 1 | Build and inventory module | 3 |
| 1 | Content load, QA, UAT | 1 |
| 1 | Launch | 0.5 |
| | **Phase 1 total** | **≈ 7–8 weeks** |
| 2 | Render processing and hotspot generation _(starts when the studio's pilot batch is approved)_ | 2 |
| 2 | Immersive experience configuration | 3 |
| 2 | Booking engine and gateway integration | 3 |
| 2 | Salesman mode and dashboards | 2 |
| 2 | Security review, UAT with real sales staff, training | 2 |
| | **Phase 2 total** | **≈ 10–12 weeks**, partly parallel to Phase 1 |

The single biggest risk to this timeline is the renders. If the studio's orbit
and mask passes arrive late, Phase 2 waits — which is why we recommend
briefing the studio in week 1 of Phase 1, not after it.

---

## 8. Assumptions, exclusions and responsibilities

**Assumptions**

- Content, renders, plans, photography and legal text are supplied by Trident
  or its studio; we process and present them, we do not author them.
- One project, with up to the tower and unit count declared at kick-off.
  Additional projects are priced separately.
- Browser support: current versions of Chrome, Edge, Safari and Firefox, plus
  iOS and Android; the immersive layer needs WebGL 2, present on every device
  sold in the last six years.
- Up to two rounds of revision per design deliverable; further rounds are
  chargeable.
- English only in Phases 1 and 2.

**Excluded unless separately agreed**

- Copywriting, translation, 3D rendering, photography and videography.
- Paid media, SEO content programmes and social media management.
- Third-party costs: domain, hosting, CDN, SMS/WhatsApp credits, payment
  gateway fees and their transaction charges, e-sign credits, CRM licences.
- Custom development inside Trident's existing CRM or ERP.
- Any handling, holding or disbursement of buyer funds by us.

**Trident's responsibilities**

- A single empowered point of contact and a named decision-maker for legal and
  finance questions.
- Timely supply of everything in §4, and of the sales team for UAT and
  training.
- Its own merchant account, KYC and legal approval of the booking terms.

---

## 9. Commercials

| # | Item | Amount (INR) |
| --- | --- | --- |
| 1 | Phase 1 — project website, inventory and lead engine | |
| 2 | Phase 2a — immersive experience configured with Trident's assets | |
| 3 | Phase 2b — booking engine, payment integration, salesman mode | |
| 4 | Render processing (per unit type / per tower) | |
| 5 | Annual maintenance and support (from month 2 after launch) | |
| 6 | Hosting, CDN and third-party services (at actuals, or estimated annually) | |

**Payment schedule:** 40% on signing, 30% on design sign-off, 20% on UAT
sign-off, 10% on go-live — per phase.

**Support:** 60 days of warranty after each go-live covering defects at no
charge. After that, an annual support retainer covering uptime monitoring,
security patching, backups, inventory support and a bank of change hours.

**Validity:** this proposal is valid for 30 days from the date above.

---

## 10. Why this works commercially for Trident

- **A shorter path from interest to commitment.** The buyer decides while
  standing in their own living room, not two weeks later on a follow-up call.
- **Token collection at the moment of maximum conviction**, on the buyer's own
  phone, with a receipt in seconds.
- **No double-sold flats,** and no evening spent reconciling three
  spreadsheets from three offices.
- **A sales team that looks equipped.** The executive with a live, interactive
  tower on a tablet outsells the one with a printed price list.
- **Every tour is measured** — which towers get explored, which floors, which
  units get blocked but not paid — so marketing spend follows evidence.
- **The platform outlives the project.** The second Trident project is a
  configuration, not another build.

---

## 11. Next steps

1. Trident confirms the phasing and the decisions in §4.3.
2. We issue the studio brief (`RENDER-BRIEF-FOR-ARTIST.md`) so rendering
   starts in parallel — this is the long pole.
3. Kick-off workshop; inventory sheet and content handover.
4. Phase 1 design begins.

We would also be glad to walk the Trident team through the working demo of the
immersive engine — tower, floors, units, plans and a 360° tour — on a call or
at your office, so the experience is judged as a working thing rather than a
description of one.

---

## Appendix A — Glossary for non-technical readers

- **Orbit frames:** a set of still renders of the building taken every degree
  or two around it. Played back as the buyer drags, they make the tower turn.
- **Stop frame:** a frame the rotation is allowed to come to rest on. Only
  these need the clickable layer, which is why masks are needed on a handful
  of frames rather than all of them.
- **ID / Cryptomatte mask:** an extra, cheap render pass where each flat,
  floor and balcony is a flat colour. It is what lets the software know
  exactly which pixels belong to flat 12B.
- **Equirectangular panorama:** a 360° image in a 2:1 rectangle, the format a
  viewer wraps around the buyer to create a room they can look around.
- **Webhook:** a message the payment gateway's server sends our server
  directly to confirm a payment — trusted, unlike anything the buyer's browser
  claims.
- **Soft hold / block:** a temporary reservation on a unit, with a timer, so
  it cannot be sold twice while a buyer decides.

## Appendix B — Open questions for Trident

1. How many towers and units are in scope for Phase 1?
2. Does Trident already use a CRM, and should leads go there from day one?
3. Is there an existing brand site this must sit inside, or is this
   standalone?
4. How many sales offices and executives will use salesman mode?
5. Is an experience-centre display (large screen or VR headset) in scope?
6. Who is the rendering studio, and what has already been rendered?
7. Which payment gateway does Trident's finance team prefer?

---

## Appendix C — INTERNAL, DELETE BEFORE SENDING

**Pricing guidance.** Leave §9 blank until these are settled:

- Phase 1 is a well-understood build; price it on weeks, not on features.
- Phase 2a is configuration of an engine we already own, plus asset
  processing. Its cost scales with the number of unit types and towers, not
  with the size of the project.
- Phase 2b (payments) carries disproportionate liability and testing effort —
  price it accordingly and do not discount it to win the deal.
- Recurring revenue lives in §9 line 5. Aim for the AMC to cover a developer
  day a month.
- Gateway fees are typically ~2% + GST on cards and much lower on UPI, paid by
  Trident to the gateway directly. Make sure the client knows this is not our
  charge, and put it in writing.
- Renders are the client's cost and the client's risk. Never absorb them, and
  never promise a Phase 2 date that is not conditional on render delivery.

**Things to be careful about in the meeting.**

- Do not promise CRM integration before seeing the CRM's API documentation.
- Do not promise that a booking is legally binding — it is an expression of
  interest until Trident says otherwise. Their counsel writes that language.
- Do not agree to hold buyer funds in any account of ours, ever.
- If they ask for Phase 2 first: possible, but the inventory engine from Phase
  1 is a prerequisite, so the phases overlap rather than swap.
- Our engine's current demo uses third-party sample renders for testing only.
  Never show them as Trident's, and never publish them.
