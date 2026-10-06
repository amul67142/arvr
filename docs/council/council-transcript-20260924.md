# Council transcript — "Am I on the right path?"

**Date:** 24 September 2026
**Counciled:** the render-driven real-estate sales platform (D:\ar and vr) and the
Trident Realty proposal.

---

## The framed question

A solo-founder agency in Gurugram (Artors / Spacetrans) is building a
render-driven interactive real-estate sales platform (React + three.js,
frontend-only, no backend) that mimics Panom.ai: drag-to-turn tower orbit,
clickable floors, per-flat inventory, 360° interior tours, walkable 3D flat. A
working demo exists using real drone footage with auto-tracked tower edges and
silhouette-divided floor bands.

He has proposed to developer Trident Realty: Phase 1 = unit-listing website +
inventory + leads (7–8 weeks); Phase 2 = immersive layer + on-the-spot
token-amount booking via payment gateway for salespeople on tablets (10–12
weeks). Phase 2 quality depends on the client commissioning expensive renders:
180–240 4K orbit frames, Cryptomatte / Object-ID mask passes on 13–20 stop
frames, 8000×4000 equirectangular interiors, unit GLBs, plans — with a pilot
batch first.

His fear: renders cost lakhs and take weeks; if the pipeline fails when the
assets land, it is humiliating and the deal and the reputation are lost.

Questions put to the council: is this the right path technically and
commercially; what are the biggest risks of the render-dependent approach; what
must be validated before renders are commissioned; is the Cryptomatte mask
pipeline sound or is camera + proxy projection or pure 3D better; is bundling
token payment collection wise for a small agency (RERA, PCI, refunds,
double-booking); and what would a hard-nosed advisor change?

---

## Advisor responses

### The Contrarian  *(anonymised as Response C)*

The mask pipeline does not exist. A search of the codebase finds zero code that
reads a Cryptomatte EXR, decodes an Object-ID pass, or converts a mask into
polygon hotspots. The render brief tells the studio "a script converts every
tower, floor and flat mask into clean outlines automatically." That script has
not been written. The only outline code (`build-horizon.mjs`) does
luminance-gradient edge detection on drone footage — a different technique that
cannot parse Cryptomatte data. He is selling a pipeline he has never tested
against real mask renders.

The pilot batch is the only safety net and it is too vague: "run the whole
pipeline on that" is undefined in code. If the pilot arrived tomorrow he would
be writing the converter under time pressure — debugging EXR parsing
(Cryptomatte encodes object hashes in float channels, not trivial),
anti-aliasing artefacts at mask boundaries, and whether V-Ray vs Corona vs
Redshift produce compatible output. That is weeks of R&D, not a day's
validation.

The payment scope is reckless for a solo founder: no backend, no database, no
auth today, yet Phase 2 needs atomic transactional booking with concurrency
locks, webhook signature verification, refunds, RERA audit trails and
PCI-adjacent security — while simultaneously building the mask pipeline, the
stop-frame system, the inventory panel and salesman mode.

Build the mask-to-polygon converter this week against synthetic masks made in
Blender; do not wait for the studio. Strip payments to Phase 3. He is stacking
every hard unsolved problem into one delivery window, and when one slips they
all slip.

### The First Principles Thinker  *(anonymised as Response D)*

He is asking the wrong question. It is not "am I on the right path" but "what am
I actually selling, and do I control it?"

What he is selling is a render pipeline, not software. Strip away the React app,
the three.js viewer, the inventory engine — commodities. The differentiation is
the claim that renders go in and interactive experiences come out. But the
mask-to-polygon converter — the one piece that justifies asking a client to
spend lakhs on Cryptomatte passes — does not exist. There is a document
describing it and a view type declared in code. The converter is not built.

This is the only thing that matters right now: not the payment gateway, not the
admin panel, not RERA compliance. The single existential question is whether he
can take a Cryptomatte EXR, extract regions, convert them to screen-space
polygons and overlay them on the corresponding orbit frame, reliably, at
production quality. Everything else is a known-solvable problem.

Stop writing proposals. Build the mask pipeline this week using synthetic test
renders: take the existing Horizon One frames, create fake Cryptomatte passes in
Blender, prove the chain. Then show the client a demo where you click a specific
balcony on a specific floor and it responds. That demo is the proposal.

Drop payments entirely — a solo founder adding PCI, RERA, refunds and
double-booking prevention to a property transaction for a Razorpay integration
fee is an absurd liability-to-revenue ratio. Let the client's existing payment
flow handle money. The job is making buildings interactive.

### The Expansionist  *(anonymised as Response A)*

This is not a services project. It is a platform play disguised as a client
engagement, and he is underpricing what he has. The working demo already does
what Panom charges lakhs per project for. Trident is not the destination — it is
the first deployment of a product. Thousands of RERA-registered projects launch
annually; incumbents charge per-project SaaS fees he could undercut while
earning multiples of a services contract.

The render dependency everyone fears is actually a moat: once the
mask-to-hotspot pipeline works with one studio, it is a repeatable integration
pattern. Package it — documented render brief, pilot validation, processing
pipeline — and studios become channel partners who recommend the platform
because it makes their renders interactive.

The payment integration is not scope creep, it is lock-in: the moment Trident's
sales team closes a booking through the system, switching cost becomes infinite,
and every competitor demo without a Book Now button looks like a toy. Build it.

Price Trident as a flagship deployment with a per-project recurring licence, not
a one-time build fee; offer Phase 1 near cost to get in fast; make real money on
Phase 2 recurring plus every subsequent Trident project at configuration
pricing. Then sign two more developers this year on the Trident case study. The
Cryptomatte pipeline, pilot validation and embed architecture are product
features, not project deliverables. File the IP. Build the docs. This is a
company, not a contract.

### The Outsider  *(anonymised as Response E)*

Read as someone who has never heard of him, Artors, Panom or Cryptomatte: he is
selling a two-phase project where Phase 2 is the entire point, yet Phase 2
cannot be priced, cannot be scheduled, and depends on assets he does not
control. A client sees a clear Phase 1 website — every agency sells those — and
a Phase 2 that says "trust us, the magic works, but we need your render studio
to produce a very specific technical deliverable we have never actually
processed from a real client before." The pilot batch idea is good but buried in
an appendix the decision-maker will never read.

The mask pipeline is untested with production renders: he divided a silhouette
by floor count for the demo, has never ingested a Cryptomatte pass, never parsed
Object IDs into polygons, never handled the edge cases he himself lists as
failure modes (curved facades, podiums, setbacks). The gap is not "will the
renders arrive" but "will he know what to do with them when they do."

The payment scope is a distraction: a solo founder with a working 3D viewer
bolting on a gateway, refunds, RERA compliance, PCI and audit logging is an
entirely separate product, and if anything goes wrong with money even once, the
relationship is over.

And a home buyer would ask: "why can I not just watch a video walkthrough on
YouTube?" The proposal never answers that. The immersive case is obvious to him
and invisible to the person signing the cheque.

### The Executor  *(anonymised as Response B)*

Monday morning, there is exactly one thing to prove and one thing to cut.

**The thing to prove: the mask-to-hotspot pipeline.** He has a beautiful render
brief and zero lines of code that ingest a Cryptomatte EXR, extract contours and
produce per-flat SVG polygons matched to frame numbers. `rotationGeometry.js`
does floor-band maths by dividing a silhouette; it has never touched a mask
file. Before any renders are commissioned, build a script that takes a single
test Cryptomatte or Object-ID PNG, runs connected-component extraction (OpenCV,
or sharp plus flood-fill), names each region, and outputs the polygon JSON the
existing viewer already consumes. Test with a mock: one old stop frame with
masks from any project, or a fake one made in Photoshop with flat colour
regions. If it produces pixel-accurate clickable outlines within a week,
proceed; if not, he knows before anyone spends money.

**The thing to cut: payment collection.** No backend exists today. Payments mean
PCI-DSS, RERA rules, double-booking atomicity, refunds, GST invoicing, disputes
— a company's worth of liability for a solo founder. Even with money settling to
the developer's account, he still writes the webhook handler, the atomic status
flip and the receipt generator. One bug and credibility is gone. Let the
salesman block the unit and generate the cost sheet, then hand off to the
developer's existing payment process — 90% of the wow factor.

Three gates before renders are ordered: pipeline test on a dummy frame, artist
confirms Cryptomatte / Object-ID with named objects, pilot batch processed end
to end. Also request the FBX camera alongside the masks as option B insurance.

---

## Peer reviews

Anonymisation map: **A** = Expansionist · **B** = Executor · **C** = Contrarian ·
**D** = First Principles · **E** = Outsider.

### Review 1 — general

**Strongest: D.** It asks the right question ("what am I actually selling, and do
I control it?"), correctly identifies the mask-to-polygon converter as the
single existential risk, and gives the most focused prescription.

**Biggest blind spot: A.** It tells a solo founder with an unbuilt core pipeline
to file IP, price as a platform and sign channel partners. Following A means
spending weeks on business strategy while the engineering risk that could kill
the deal sits unaddressed.

**All five missed the manual fallback.** Hotspot polygons can be hand-traced over
rendered stop frames by a designer in hours, and many production real-estate
platforms ship exactly this way. The Cryptomatte pipeline is an automation play
for scale, not a prerequisite for a working demo. That reframes it from
existential risk to efficiency optimisation, and gives a credible Plan B to
present alongside the pilot batch.

### Review 2 — commercial lens

**Strongest: C.** It names the exact technical gap and connects it to a concrete
timeline risk: debugging EXR parsing under delivery pressure.

**Biggest blind spot: A.** It ignores that the core pipeline is unbuilt and leaps
to platform strategy, recurring licences, IP filing and channel partnerships.

**All five miss the client's decision timeline.** None ask when Trident needs to
launch sales or what their booking season looks like. Developers work against
RERA registration deadlines, possession dates and market windows. If Trident
needs a sales tool in eight weeks for a site launch, the phasing debate is moot —
the client's calendar dictates scope. Nobody mentioned competitor bids either.

### Review 3 — rendering / computer-vision lens

**Strongest: D**, with C equally sharp on the technical gap.

**Biggest blind spot: A**, which assumes the pipeline works and advises filing IP
on code that has never ingested a single mask frame.

**All five missed the obvious alternative that eliminates Cryptomatte entirely.**
The studio already has the 3D scene with per-unit geometry. Export the camera
path plus a low-poly proxy mesh (one box per flat) as glTF, and project that
proxy in three.js at every frame using the matched camera. That gives
pixel-accurate hotspots at arbitrary rotation angles — not just 13–20 stop
frames — with zero computer-vision code. Cryptomatte is designed for
compositing, not interactive region extraction: it encodes object hashes in
float channels with manifests, needs EXR parsing the browser cannot do natively,
and anti-aliased boundaries produce fractional coverage that needs thresholding,
creating gaps between adjacent units. Camera-plus-proxy is standard in
architectural-viz interactives and should be the primary pipeline, with
Cryptomatte as the fallback.

### Review 4 — Indian real-estate market lens

**Strongest: C.** Precise on the technical gap and the scheduling risk.

**Biggest blind spot: A.** It romanticises the situation into a platform play and
calls payment integration "lock-in" while ignoring that one failed transaction
with a buyer's lakhs destroys the relationship permanently.

**All five missed the market reality.** Indian developers do not buy software
from solo founders through proposal documents — they buy through relationships
with the VP Sales or the MD's office, often via a channel-partner introduction,
after someone saw a demo on a phone. Token amounts (₹1–5 lakh) are typically
collected by cheque or RTGS into the developer's designated RERA account, not on
a tablet through Razorpay. And every mid-tier developer already runs a CRM
(Sell.do, LeadSquared, In4Velocity) that handles inventory blocking, cost sheets
and payment tracking. The unasked question: does this plug into that CRM's API,
or does the salesperson now maintain two systems?

### Review 5 — founder-capacity lens

**Strongest: C**, for naming Cryptomatte's specific failure modes and the
schedule-stacking problem.

**Biggest blind spot: A**, for treating the demo as proof the product works and
encouraging payment integration for a founder with no backend and no team.

**All five missed what happens when Phase 1 ships late** — likely, given three
concurrent projects and no team. Phase 1 is the boring website that earns the
trust to commission expensive renders for Phase 2. If it slips, the client never
orders renders and Phase 2 never starts. Split attention is the
highest-probability failure mode, not the mask pipeline. Nobody said: reduce
other commitments or bring in a delivery partner for Phase 1.

---

## Chairman's verdict

### Where the council agrees

1. **The direction is right; the proof is missing.** Four of five advisors led
   with the same finding: the mask-to-polygon converter does not exist. The
   render brief promises a studio something the code cannot yet consume.
2. **Validate before the client spends.** Build the converter now against
   synthetic assets you generate yourself — do not wait for the studio's pilot.
3. **The pilot batch is currently a paragraph, not a procedure.** "Run the whole
   pipeline on it" is undefined in code.
4. **Cut token payment collection from Phase 2.** Four of five call it liability
   without proportionate revenue for a solo founder with no backend.

### Where the council clashes

- **Payments.** The Expansionist calls a Book Now button the lock-in that makes
  every competitor look like a toy. Everyone else calls it the fastest way to
  destroy the relationship. Both are right about the direction; they disagree on
  timing. The resolution is sequence, not principle.
- **Project versus product.** The Expansionist wants recurring per-project
  licensing, IP and channel partners now. The Contrarian and Executor want
  ruthless focus on one unbuilt script. The productisation instinct is correct —
  and premature by exactly one successful delivery.
- **Primary hotspot technique.** The brief treats Cryptomatte masks as the main
  ask and camera + proxy as the alternative. The technical reviewer argues the
  order should be flipped: proxy projection works at every frame, needs no EXR
  parsing in the browser, and avoids anti-aliasing gaps between adjacent flats.

### Blind spots the peer review caught

1. **Manual tracing is a Plan C that always works** — a designer can trace 13–20
   stop frames in hours. The automation is an efficiency play, not a
   prerequisite. This alone defuses the "what if it does not work" fear.
2. **Camera + proxy should probably be the primary pipeline**, not the fallback.
3. **The client's calendar rules.** Nobody asked Trident's launch date, RERA
   deadline, or whether this is a competitive bid.
4. **Indian market mechanics.** Tokens usually move by cheque or RTGS into a
   designated account; developers already run a CRM that blocks inventory; the
   buyer is reached through relationships, not documents.
5. **Founder capacity is the highest-probability failure**, not the mask
   pipeline. If Phase 1 slips, renders are never ordered and Phase 2 never
   happens.

### The recommendation

**Right path, wrong order.** The render-driven approach is correct and the demo
already proves most of it. But the proposal currently sells a capability whose
central mechanism has never been executed once. Fix that this week, at your own
cost, on synthetic assets — before a rupee of the client's render budget is
committed.

Specifically: make **camera + proxy projection the primary** hotspot technique
and Cryptomatte the fallback; keep **manual tracing** as the declared Plan C so
no render delivery can ever produce a dead end. **Strip token collection** out of
Phase 2 into a later, separately priced phase — Phase 2 ends at "unit blocked,
cost sheet generated, payment handed to the developer's existing process."
Before pricing anything, ask Trident two questions the proposal never asks:
what is your launch date, and which CRM do you already use?

### The one thing to do first

**Build the hotspot pipeline this week against a synthetic scene you make
yourself.** Model a crude tower, render one beauty frame plus an object-ID pass,
export the camera, and make one specific balcony on one specific floor clickable
in the existing viewer, end to end. That single clickable balcony de-risks the
entire engagement — and it is a better proposal than the proposal.
