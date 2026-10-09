# ECOWAVE — client feedback (PPT) analysis & action plan

> Source: `에코웨이브 웹사이트.pptx` (11 slides, KakaoTalk download).
> Each slide pairs the original site (**"Prev. Ver"**, almost always the Korean
> imweb original) with the rebuild (**"New Ver"**, almost always the **English**
> site) and carries the client's handwritten English remark.
> Scope of this doc: decode each remark → map it to a route/component → give a
> fix + verification. It is a _plan_, not an implementation.
> Companion: `PLAN.md` (master doc), `README.md` (content model / ops),
> `design/audit/DEEP-UI-AUDIT.md` (parity detail).

---

## 0. TL;DR

The 11 slides reduce to **8 distinct issues across 7 pages**:

| #    | Route                     | Remark (client)                                  | Bucket                 |
| ---- | ------------------------- | ------------------------------------------------ | ---------------------- |
| 1    | `/` (+ `/company/global`) | "The sizes are different / main / Small size"    | Layout sizing          |
| 2    | `/company/about`          | gallery slider moves differently (hover + speed) | Behaviour              |
| 3–4  | `/company/philosophy`     | "Missing text"                                   | EN content gap         |
| 5    | `/company/global`         | "Text cannot be converted" (map)                 | i18n / 3rd-party       |
| 6    | `/rnd/technology`         | hover effect gone ("no movement")                | Effect regression      |
| 7    | `/rnd/facilities`         | "Missing text" (heading)                         | Heading hidden         |
| 8    | `/rnd/facilities`         | hover colour area gone                           | Effect regression      |
| 9–10 | `/products/eco-wave`      | "The image order is different"                   | Content order          |
| 11   | `/products/flowell`       | "All parts are different" (KO)                   | Content order / parity |

**Structural finding (important):** the Korean content matches the **live
original exactly** — verified against the live `/`, `/37` (eco-wave) and `/36`
(flowell) boards, whose titles _and_ order match `content/ko/boards/*.json`
verbatim. So issues **9/10/11 are not "the crawl is stale"**; they are almost
certainly **KO↔EN locale-parity gaps** (the KO and EN boards carry different
item sets/orders) plus the client reviewing the **EN** pages. Several "missing
text" items (3–4, 7) are EN-side gaps or an intentionally hidden heading.

See the **recon pass** below: 7 of the 9 issue-groups reproduce on the current
build; 1 does not (a stale PPT screenshot); 1 needed a target (now confirmed).
**Fixes for items 1, 3–4, 7 and 8 are implemented and verified** (see §6); items
6, 2 and 5 needed no change; 9–11 are admin/data tasks.

---

## Recon pass (2026-10-09) — what reproduces

Run against the existing production server on `:4517` (build `3zraFMQk`, newer
than the content, so it reflects current data), 1440×900, via Playwright.
Two capture gotchas worth knowing:

- The **reveal animations leave content at `opacity: 0` in headless** until they
  fire. Emulating `prefers-reduced-motion: reduce` resolves them (the build is
  reduced-motion-safe) → capture with that on.
- The **hover effects are gated behind `prefers-reduced-motion: no-preference`**
  (`globals.css` `[data-hover-scale]:hover img`), so hover checks must turn the
  emulation back **off**. Headless "blank" sections are also a lazy-image timing
  artifact — `<img loading="lazy">` never loads until scrolled; the files
  themselves are fine (verified 200 + natural 728×837).

| #    | Item                      | Reproduces?                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Home solution card sizes  | **✅ yes (KO too) — fixed §6** | Pillars 1–2: image renders 477×548 (cropped, fills the 548 box). Pillar 3 (`w20250812aea22580e7e86`): image renders **327×376 centred with 86px margins** in the same 548 box → visibly smaller/shorter. The renderer treats it as a "fit small card" (`fitSmallCard`, `SectionRenderer.tsx`) because the crawl authored it `width:327px;height:376px;margin:86px auto` while the other two are `height:100%` crops.                       |
| 2    | `/company/about` slider   | **— already matches**          | Pause-on-hover/focus/press is already implemented (`GallerySlider.tsx` `paused`, `autoplayMs`/`continuousMs`). Only the **speed** needs to match the original.                                                                                                                                                                                                                                                                             |
| 3–4  | Philosophy "missing text" | **✅ yes (EN)**                | `/en/company/philosophy` has no `경영이념` / `Management ideology` / `비전` / `Vision` text at all (body-text scan → none). KO content **has** them as `aside` `_lbl` widgets.                                                                                                                                                                                                                                                             |
| 5    | Global map                | **— already satisfied**        | EN map iframes byte-identical to KO (`…!5e0!3m2!1sko!2skr`). Client wants ONE shared, admin-editable map for both locales.                                                                                                                                                                                                                                                                                                                 |
| 6    | `/rnd/technology` hover   | **❌ does not reproduce**      | The 5 feature images carry `data-hover-scale="1"` and `globals.css` implements `:hover img { transform: scale(1.1) }` (≥768px). Deep-dived against the live `/22`: the original has the same 5 `hover_scale` widgets, and `site.css`'s rule is `.widget.image.hover_scale:hover img { transform: scale(1.1); transition: all 0.4s ease-out }` — matching ours. Already implemented in parity wave 13; the client's screenshot predates it. |
| 7    | Facilities "missing text" | **✅ yes**                     | `Production facilities` heading is in the DOM at y≈938 but wrapped in `<div style="visibility:hidden">` by `hideFirstText()` in `FacilitiesTabSection.tsx`.                                                                                                                                                                                                                                                                                |
| 8    | Facilities hover colour   | **✅ yes (confirmed)**         | Deep-dived against the live `/24`: the original has 4 `tableHover` tables and 0 `hover_scale` widgets, and `site.css` defines `table.tableHover > tbody > tr:hover { background-color: rgba(128,128,128,0.1) }`. Our CSS had the `tableHover` padding rules but no hover rule, so rows never highlighted. **Fixed** (globals.css).                                                                                                         |
| 9–10 | Eco-wave order            | **✅ yes**                     | KO page order = live original (`서비스 점검 키트, 기능성 필터, 자가관리 키트, 에코웨이브 필터 시스템, Bidet ×2`); EN page order = `Functional filters, Eco-wave, Magic bidet ×2, three-step, Service Check Kit`. Differ.                                                                                                                                                                                                                   |
| 11   | Flowell set               | **✅ yes**                     | KO = 3 (`플로웰 POE 시스템 필터 / 직수 정수기 / Electrode Water sterilizer`); EN = 6+ stand/hydrogen purifiers. Completely different sets.                                                                                                                                                                                                                                                                                                 |

**Extra structural finding:** product boards are **database-backed** —
`getResolvedBoard` (`lib/content/resolved.ts`) prefers `board_post` rows over the
crawled JSON. So the EN order/wordings the client saw come from DB rows, and
order/titles are already editable in the dashboard once a board is materialized
(see `app/admin` board editor). This matches the client's expectation that the
product fixes can be done in the admin UI.

Home content otherwise matches the live original (pillar captions etc. verified
against the live `/`).

---

## 1. How the slides decode

| Slide | Page / route                                   | Prev. (left) | New (right) | Client remark                                                                   |
| ----- | ---------------------------------------------- | ------------ | ----------- | ------------------------------------------------------------------------------- |
| 1     | home `/` + `/company/global`                   | KO           | EN          | "The sizes are different", "main", "Small size"                                 |
| 2     | `/company/about` — "건강한 생활 솔루션" slider | KO           | EN          | "moves even when the mouse is over it" (prev) vs "stops on hover, faster" (new) |
| 3     | `/company/philosophy` (§ 사명/건강한 약속)     | KO           | EN          | "Missing text" (left aside label gone)                                          |
| 4     | `/company/philosophy` (§ IDEA/Quality/TIME)    | KO           | EN          | (continuation of slide 3)                                                       |
| 5     | `/company/global` — Google map                 | —            | KO/EN       | "Text cannot be converted"                                                      |
| 6     | `/rnd/technology` (보유기술)                   | KO           | EN          | hover effects gone                                                              |
| 7     | `/rnd/facilities` (생산설비)                   | KO           | EN          | "Missing text" (heading)                                                        |
| 8     | `/rnd/facilities` (gallery)                    | KO           | EN          | "hover colour area" gone                                                        |
| 9     | `/products/eco-wave`                           | KO           | EN          | "The image order is different"                                                  |
| 10    | `/products/eco-wave` (Filter tab)              | KO           | EN          | "The image order is different"                                                  |
| 11    | `/products/flowell`                            | KO           | EN          | "the Korean version's Flowell products are different — all parts are different" |

Decode note: the 4 slide-1 images are (top) home KO vs EN and (bottom) global KO
vs EN; the "main"/"Small size" text boxes annotate the two rows.

---

## 2. Per-item plan

### 1) Home + Global — card sizing ("The sizes are different", "main"/"Small size")

- **Symptom (New/EN):** on `/` the three "지속 가능한 미래" solution cards render
  at unequal sizes (the last card is shorter/narrower than in the KO original);
  the client also annotates a "Small size" card row on `/company/global`.
- **Where:** `components/content/SectionRenderer.tsx`
  - home solution band: `SOLUTION_SLIDER_SECTIONS`, `solutionSlides()`,
    `HOME_CARDS_SECTIONS`, `HOME_CARD_MOBILE_ALIGN` (L2124–2341)
  - card geometry: `ImageWidget` L261–687 (`fitSmallCard` L465, `desktopSized`
    L442, `BOX_DESKTOP_HEIGHT`/`BOX_MOBILE_HEIGHT` L1694–1706)
  - global cards: `globalContact` / `GLOBAL_CONTACT_SECTION_IDS` L2049
- **Cause hypothesis:** the EN crawl's three pillar widgets carry slightly
  different authored widths/heights than the KO ones and the renderer lets each
  keep its own size instead of enforcing the equal-cell layout. (The KO↔EN home
  parity pass is documented as done, so this is likely a per-widget sizing edge.)
- **Fix:** pin the solution/pillar card cells to the equal width the KO original
  authors (mirror the EN twins onto the KO size), and confirm the global cards
  use the same target size as KO.
- **Verify:** `npm run start`; screenshot `/` and `/en` at 1440 and 390 for the
  solution band and compare card widths to the live original (the client's
  measurement point). Use `scripts/audit/section-diff.mjs`.

### 2) `/company/about` — slider behaviour

- **Symptom:** the "건강한 생활 솔루션" (EN "EcoWave's Healthy Living Solution")
  image rail behaves differently: per the client, prev kept auto-scrolling even
  under the cursor; new pauses on hover and runs faster.
- **Where:** `content/{ko,en}/pages/company.about.json` (the section with the
  rail) → `components/content/GallerySlider.tsx` (`paused` state L105, the rAF
  `tick` L313, `onPointerDown`/`finishDrag`).
- **Cause:** the rebuild's `GallerySlider` pauses on hover and uses its own
  autoplay speed; the original's is different.
- **⚠ Intent unclear.** The wording ("stops when the cursor moves up and the
  speed is fast") reads like a _description_ of the new behaviour, not
  necessarily a complaint. **Confirm with the client whether they want parity
  with the original (keep moving under the cursor) or to keep the new
  pause-on-hover/faster behaviour.** Only then change `GallerySlider`.
- **Verify:** the repo already has a slider autoplay knob (opt-in `autoplayMs`,
  reduced-motion aware) added in parity wave 8 — reuse it.

### 3–4) `/company/philosophy` — "Missing text"

- **Symptom (New/EN):** the left `side_left` column labels (KO: `경영이념`, `비전`)
  are absent.
- **Where / evidence:** `content/ko/pages/company.philosophy.json` **has** an
  `aside` with `_lbl` code widgets (`w202508119eca72dc669e0lbl` = 경영이념,
  `w202508280e68f158799c2lbl` = 비전). A search of
  `content/en/pages/company.philosophy.json` finds **no `aside` and no `_lbl`
  key at all** → the EN philosophy page was ported without the aside band.
- **Rendered by:** `SectionRenderer.tsx` → `AsideColumn` (L2497, desktop-only
  `hidden min-[1280px]:block`; L2814 / L2860).
- **Fix (content, not code):** add the two EN aside label widgets to
  `content/en/pages/company.philosophy.json` (mirror the KO structure), and make
  sure the registry exposes them for editing (`npm run content:registry`).
- **Verify:** load `/en/company/philosophy` at ≥1280 and confirm the two left
  labels appear; `npm run content:validate`.

### 5) `/company/global` — "Text cannot be converted" (map)

- **Symptom:** the Google Maps embeds still render Korean/Chinese chrome and
  place labels on the EN page.
- **Where / evidence:** the EN iframes are byte-identical to KO —
  `content/en/pages/company.global.json` L392/L526/L580 use `!5e0!3m2!1sko!2skr`
  (Korean `hl`). Same for the KO file.
- **Fix:** for the **EN** locale, rewrite the embed URLs to English
  (`hl=en`, `!1sen!2s…`). Note this is a _partial_ fix — Google still shows the
  native-script place name (e.g. the Chinese address) because it comes from the
  place ID, not the language param. Document the residual as a known limitation
  and, if the client wants full control, offer a static map image instead.
- **Verify:** load `/en/company/global` and confirm the map UI text is English.

### 6) `/rnd/technology` — hover effect gone

- **Symptom:** the two feature photos had a hover effect on the original; the
  rebuild shows none ("no movement").
- **Where / evidence:** `content/ko/pages/rnd.technology.json` image widgets
  carry `"hoverBg"` **equal to `"src"`** (e.g. L469, L527, L647, L705), so the
  `ImageWidget` hover overlay (`SectionRenderer.tsx` L555–559,
  `group-hover:opacity-100`) paints the _same_ image → invisible.
- **Cause hypothesis:** the original's effect is the shared **`hover_scale`
  zoom** (`transform: scale(1.1)`, 0.4s, ≥768px) that the crawler drops the
  class for. The stop-gap id list `HOVER_SCALE_WIDGET_IDS` (L823) covers home +
  about but **not** these technology widgets.
- **Fix:** add the technology widget ids to `HOVER_SCALE_WIDGET_IDS` (or, the
  durable path already sketched in the code comments: teach the crawler to
  persist `hoverScale: true`). Confirm which of the technology images are the
  ones the client means.
- **Verify:** the audit hover probe — `node scripts/audit/state-probe-content.mjs`
  (or the `hover_scale` check in `design/audit/company-philosophy-audit.md §8`).

### 7) `/rnd/facilities` — "Missing text" (heading)

- **Symptom (New/EN):** the big centred section heading is gone; only the intro
  paragraph + tab pills remain.
- **Where / evidence:** `components/content/FacilitiesTabSection.tsx`
  `hideFirstText()` (L45–61) deliberately wraps the section's first text widget
  in `visibility:hidden` "because the live original hides it". The EN content
  **does** contain the 48px `"Production facilities"` widget
  (`content/en/pages/rnd.facilities.json` L346).
- **Cause hypothesis:** the "the original hides it" measurement may be stale (or
  the client recently un-hid it). The client's Prev screenshot _shows_ the
  heading, so the rebuild hiding it is the defect.
- **Fix:** re-measure the live original `/24` (§2 heading visibility). If it is
  visible, drop/replace `hideFirstText` (and re-check the section height parity);
  if it is truly hidden on the original, this is a deliberate parity choice and
  the client wants the text restored anyway — treat as a client-approved
  deviation.
- **Verify:** screenshot `/rnd/facilities` vs live `/24` and check the §2 band
  height in `section-diff.mjs`.

### 8) `/rnd/facilities` — hover colour area gone

- **Symptom:** an area that changed colour on hover no longer does.
- **Where:** the gallery/tab band — `components/content/FacilitiesTabs.tsx` and
  `FacilitiesTabSection.tsx`; the underlying image widgets in
  `content/ko/pages/rnd.facilities.json` (the `hoverBg` same-as-src pattern).
- **Fix:** same family as item 6 — restore the hover effect (scale or a real
  `hoverBg` overlay) for the affected gallery cells.
- **Verify:** hover probe on `/rnd/facilities`.

### 9–10) `/products/eco-wave` — "The image order is different"

- **Symptom:** the product cards' order under 전체/필터 differs from what the
  client expects.
- **Where / evidence:** order = array order in
  `content/{ko,en}/boards/products.eco-wave.json`, rendered by
  `components/products/ProductBoard.tsx` after
  `filterPostsByCategory` (`product-tabs.ts` L69 — a **stable filter, no sort**).
  - KO order: `서비스 점검 키트, 기능성 필터, 자가관리 키트, 에코웨이브 필터
시스템, Bidet ×2, 3단계 필터` — **matches live `/37` exactly.**
  - EN order: `Self-care kit, Service Check Kit, Magic bidet ×2, three-step,
Eco-wave Filter system, Functional filters` — **different** from KO.
- **Cause:** the KO and EN boards are not index-aligned (violates the README
  locale-parity rule). The client is comparing KO ↔ EN order.
- **Fix:** reorder the EN board posts to mirror the KO order (and confirm the
  client wants KO order as canonical). If the client instead wants the KO order
  changed, capture their target order.
- **Verify:** diff the two board JSONs for index alignment; `npm run
content:validate`.

### 11) `/products/flowell` — "All parts are different" (KO)

- **Symptom:** the client says the KO Flowell products are entirely different.
- **Where / evidence:**
  - KO `content/ko/boards/products.flowell.json`: 3 posts —
    `플로웰 POE 시스템 필터 / 플로웰 직수 정수기 / Electrode Water sterilizer`
    → **matches live `/36` exactly.**
  - EN `content/en/boards/products.flowell.json`: 11 posts (Stand-type
    purifiers, Radio-Free, Hydrogen, Direct, POE, Electrode…) — a completely
    different, larger set.
  - The client's "Prev" screenshot shows the **Stand-type** purifiers with
    **Korean** captions — i.e. it matches the **EN board's** items rendered in
    Korean, _not_ the current KO board. This is the same KO↔EN divergence as
    item 9.
- **Cause:** KO and EN Flowell boards are structurally different sets (not a
  parity pair).
- **Fix:** decide the canonical set with the client (the current KO original
  shows only POE/직수/sterilizer). Either (a) align both locales to the KO set,
  or (b) if the KO original is meant to also carry the newer products, have the
  client add them on imweb and **re-crawl the board**. Do **not** hand-edit the
  boards to guess.
- **Verify:** compare both board JSONs against the live `/36` and
  `en.ecowavekorea.co.kr` flowell board after any re-crawl.

---

## 3. Cross-cutting workstreams

1. **Locale parity reconcile (products + philosophy).** The root of 3–4, 9, 10,
   11 is KO↔EN divergence. Add a check (extend `scripts/content-validate` or a
   new `scripts/audit/measure-board-parity.mjs`) that asserts both locales'
   boards carry the same item set in the same order, and surface it in CI
   (`npm run verify`).
2. **Crawler durable fields.** Items 6/8 (and the earlier `animDir`,
   `hover_scale` notes) share one root cause: the crawler drops the widget class
   list, so `hover_scale`/hover state isn't persisted. Implement the planned
   durable path (`hoverScale: true` written by the crawler) instead of more
   id-lists, then delete the stop-gap maps.
3. **Re-measure the live original for item 7.** Confirm whether `/24`'s §2
   heading is visible or `visibility:hidden` before touching `hideFirstText`.
4. **Take a clean KO-vs-KO and EN-vs-EN capture set.** The PPT mixes locales,
   which is why several "differences" are just translation. Produce a
   like-for-like capture (build KO vs live KO; build EN vs mirror EN) so future
   client screenshots are unambiguous.

---

## 4. Client decisions (2026-10-09)

1. **Slider (2):** keep the **stop-on-hover** behaviour and **match the
   original's speed** (measure the original's auto-advance interval/`smartSpeed`
   and set `autoplayMs`/`continuousMs` accordingly).
2. **Products (9–11):** fix order and wordings through the **admin dashboard**;
   "update the backend to match the data and items." Source of truth = the
   **original website**. (Boards are already DB-backed — verify the board editor
   supports reordering and title edits, then set both locales to the original.)
3. **Facilities heading (7):** the original **does** have the title — it appears
   via an animation. **Stop hiding it**, and account for the appear animation in
   deep comparisons (settle it before capturing).
4. **Map (5):** the map — and the **overlay text** — must be **the same for both
   languages** and **editable in the admin dashboard** (one shared field, not
   per-locale content).
5. **Card sizing (1):** all slides/cards must be the **same size (width and
   height)**, with the **image inside shown properly** (not shrunk/cropped oddly).

---

## 5. Suggested sequence (updated after the recon + decisions)

1. ~~Recon pass~~ — **done** (see the recon table above).
2. **Layout/behaviour (client-decided):**
   - item 1 — make the three home solution cards equal size with the image shown
     properly (drop the `fitSmallCard` shrink for pillar 3);
   - item 7 — remove/guard `hideFirstText()` so the facilities heading shows;
   - item 2 — measure the original gallery speed, then set `autoplayMs`/`continuousMs`.
3. **Content fixes (admin):** items 3–4 (EN philosophy aside band),
   9–11 (board order + wordings — set both locales to the original via the
   dashboard). Then `npm run content:validate`.
4. **Item 5 (map + overlay text):** make the map a single shared,
   admin-editable field used by both locales.
5. **Investigate/confirm:** item 8 (point at the hover area — likely the
   equipment-table row highlight); item 6 (confirm the exact effect vs the
   original — a zoom already exists).
6. **Hardening:** add the board-parity check (§3.1) and the crawler
   `hoverScale` field (§3.2) so these classes of drift stop recurring.

---

## 6. Implementation log (2026-10-09)

All changes below passed `npm run verify` (typecheck + lint + content:validate +
build) and were re-checked on the rebuilt `:4517` server.

| Item | Change                                                                                                | Files                                                                           | Verified                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1    | Home §solutions card 3 normalized onto the sibling fill-crop (box 548, image 477×548, centre-cropped) | `components/content/SectionRenderer.tsx` (`EQUAL_CARD_FIX`, `EQUAL_CARD_BOX_H`) | KO + EN, 1440 and 390: all three cards equal (477×548 / 360×360)                             |
| 3–4  | Added the EN philosophy `aside` bands (`Management Ideology`, `Vision`) mirroring KO's structure      | `content/en/pages/company.philosophy.json`                                      | `/en/company/philosophy` now renders both labels (left column, x=80)                         |
| 7    | Stopped hiding the facilities §2 heading (`hideFirstText` removed)                                    | `components/content/FacilitiesTabSection.tsx`                                   | `/en/rnd/facilities`: 0 hidden elements, `Production facilities` heading visible             |
| 8    | Added the `tableHover` row-hover rule                                                                 | `app/globals.css`                                                               | served CSS contains `.rich-text table.tableHover>tbody>tr:hover{background-color:#8080801a}` |

**No change needed** (verified already-correct):

- **2 — slider:** the about gallery already uses the original's config
  (`continuousAutoplay`, one page / 10 s) and pauses on hover, which is what the
  client asked for. Visually confirm on `/company/about`.
- **5 — map:** the embeds are already admin-editable (the `company.global`
  `locations` editor exposes `mapSrc` per branch) and byte-identical across
  locales, so "same for both languages + editable" already holds.
- **6 — technology hover:** confirmed implemented (zoom matches the original).

**Remaining (admin action / client decision — not code):**

- **9–10 — eco-wave order:** the EN board is DB-backed (`board_post`) and its
  order differs from KO. Reorder via the admin boards editor (the up/down
  controls already exist in `app/admin/_components/boards/BoardEditor.tsx`) to
  the KO order. KO already equals the live `/37`.
- **11 — flowell set:** KO (3 items) vs EN (6+ items) diverge. Decide the
  canonical set with the client, then align in the admin. KO already equals the
  live `/36`.

Note: `npm run content:registry` reported no drift after the EN-philosophy edit
(the aside labels are `code` widgets, exactly as in KO — not registry-editable).

### Round 2 (2026-10-09, after client re-review)

| Item                            | Change                                                                                                                                                                                                                                                                                                                                                                            | Files                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Slider "should not stop"        | Removed the hover/focus pause; the strip now keeps auto-advancing (the original owl carousel does not set `autoplayHoverPause`). Drag still pauses.                                                                                                                                                                                                                               | `components/content/GallerySlider.tsx`                                                         |
| Facilities filter text overflow | Desktop pills are now `min-w-[250px] w-auto whitespace-nowrap px-[20px]` (short labels stay 250, long EN labels widen instead of overflowing).                                                                                                                                                                                                                                    | `components/content/FacilitiesTabs.tsx`                                                        |
| Map language + zoom             | Both locales: embed `1sko!2skr` → `1sen!2sus` (English UI/hint) and the camera distance `!1d` halved (≈2× zoom).                                                                                                                                                                                                                                                                  | `content/{ko,en}/pages/company.global.json` (+ regenerated `lib/content/registry.ts` defaults) |
| Hover‑scale coverage            | Extended `HOVER_SCALE_WIDGET_IDS` with 8 widgets found by a full‑site scan of the original's page custom CSS (`#w… .widget.image.hover_scale`): home ECOWAVE band + 773×427 band, company.about feature photo + band, company.organization org chart, company.history era photos ×3.                                                                                              | `components/content/SectionRenderer.tsx`                                                       |
| Products match the original     | Reordered the EN boards to the original (KO) order — eco‑wave: `Service Check Kit, Functional filters, Self‑care kit, Eco‑wave Filter system, Magic bidet ×2, three‑step filter`; flowell leads with the original's 3 (`POE System Filter, Direct Water Purifier, Electrode sterilizer`). Applied to the JSON seed **and** the DB `sortOrder` (non‑destructive; no rows deleted). | `content/en/boards/products.eco-wave.json` + `board_post` DB (`sortOrder`)                     |

Verified after rebuild: EN eco‑wave order matches `/37`; map serves `1sen!2sus` with halved `!1d`; facilities pill class carries `min-w-[250px] w-auto whitespace-nowrap`; `data-hover-scale` present on the extended widgets; `npm run build` + **356 tests pass**.

**Not changed (needs a client call):** the map's _scroll hint text_ ("지도를 … Ctrl를 느린 채 …") is Google's own iframe UI — it follows the `hl` param only; it cannot be restyled or replaced without swapping the Google embed. The EN Flowell board still carries 8 extra rows beyond the original's 3 (left in place, sorted after); deleting them is destructive and left for the admins.

### Round 3 (2026-10-09 — root-cause fixes for the re-reported items)

The earlier "already fixed" claims for two items were wrong. Both root causes are now found and fixed:

| Item                            | Real root cause                                                                                                                                                                                                                                       | Fix                                                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home card 3 not full height** | The crawl's `margin: 86px auto` shorthand expands to `margin-top`/`-bottom: 86px` (auto is skipped). The equal-card normalization deleted only the left/right margins, so the image sat **86px down** inside the 548px box and was clipped to ~462px. | `equalCard` now deletes all four margins. Verified: all three cards `boxTop 3077 == imgTop 3077`, `imgH 548`. `SectionRenderer.tsx`                                                                                       |
| **R&D hover scale missing**     | `HOVER_SCALE_WIDGET_IDS` held only the **KO** widget ids. The EN crawl assigns **different** ids to the same images, so no EN page ever got `data-hover-scale` → no zoom.                                                                             | Added the EN twins (5 in `rnd.technology`, 1 in `company.philosophy`). Verified: EN `/rnd/technology` now has 5 `[data-hover-scale="1"]` and the served CSS has `[data-hover-scale="1"]:hover img{transform:scale(1.1)}`. |

Also this round:

- **About slider → 5 s/page:** `transitionMs: 10000 → 5000` on the caption gallery (both locales).
- **Map language per locale:** KO `1sko!2skr`, EN `1sen!2sus` (the hint swaps with the language).

**Task 2b — the 5 images as a component (NOT done).** Identified the exact target: on `/company/about`, the section **after** the slider is **"EcoWave's Total Solution for Clean Water"** (`깨끗한 물을 위한 에코웨이브의 토탈 솔루션`) with **5 PNGs** (`c798df4385130.png`, `d69e16cad888c.png`, `941e13ebf8647.png`, `f0ec521b79f7b.png`, `730678990350e.png`). The client wants these rendered by a real TSX component with a transparent background and edited as **text** (not image uploads). This needs a new content kind (registry def + merge applier + admin editor + a `TotalSolutionCards` component) — scoped but not implemented yet.

Verified: `npm run content:registry`, `npm run build`, **356 tests pass**.

### Round 4 (2026-10-09 — home §2 cards, slider 15 s, about section)

| Item                                    | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home §2 nav cards — entrance            | All four cards (both locales, 8 ids) now enter **from the left** (`fadeInLeft`) instead of the alternated Left/Right. `ANIM_DIR_OVERRIDES`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Home §2 nav cards — hover               | Added the client-requested hover: a translucent **bluish veil** (`#274DAC80`, the original's `:hover .hover_overlay` value) with a soft `backdrop-blur`, and the card **lifts** (`translateY(-8px)`). The veil sits at `z-[1]` under the `z-[2]` text. `SectionRenderer.tsx`.                                                                                                                                                                                                                                                                                                                                                           |
| Home §2 nav cards — text                | **Not a defect:** the cards DO render their text — EN `Company / R&D / Products / News`, KO `Company+회사소개`, `R&D+연구개발`, … plus the “+” icon (verified in the DOM and in a screenshot). The EN crawl authors an empty `top-t` sub-label, so EN shows only the title — if the client wants the sub-label on EN, the crawl default needs filling.                                                                                                                                                                                                                                                                                  |
| Home §2 nav cards — container width     | **Not a simple fix.** At a **1440 viewport the original and our rebuild match exactly** (cards 238×319, row 1070). The original is **fluid** (`inside = 100vw − 400px`: 1040 @1440, 1520 @1920) while our rebuild caps at **1280**, so on a wider monitor ours is smaller. Making the site fluid is a layout-architecture change — flagged, not done.                                                                                                                                                                                                                                                                                   |
| About slider                            | `transitionMs: 5000 → 15000` (15 s/page) on the caption gallery, both locales.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| About “Total Solution” section (item 3) | **Not implemented.** The section is **5 `text` widgets**, each an HTML box (`#f8f8f8`, `border-radius:20px`) containing a **JPG** product photo + `<h6>` title + description (e.g. `w20250919eb33a28196229` 정수기, `w20250919a06813f5e869d` 정수 필터, `w202509196d95887d0ea56` 비데 필터, `w2025091937ef9567e5c28` 샤워·비타민 필터 …). Turning this into a component + admin editor is a multi-file feature; see the message for the proposed design and the one blocker (the photos are JPGs — a component can't make a JPG background transparent; it needs transparent PNG/SVG assets or a `mix-blend-mode: multiply` treatment). |

Verified: `npm run content:registry`, `npm run build`, **356 tests pass**; home serves 4 `fadeInLeft` + the `#274DAC80` veil; about serves `15000`.

### Round 5 (2026-10-10 — EN completeness, fluid layout, philosophy EN, Total-solution component)

| Item | Change | Files |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------────────────────--------- | ----------------------------------------------------------------------------------------------------------- |
| 1 — EN empty translations | (a) EN home §2 nav-card sub-labels (`<div class="top-t">`, authored empty in the EN crawl) filled from KO: `Company / R&D / Products / PR Center`. (b) EN product boards' `page.subtitle` filled from KO (`에코웨이브`/`에코웨이브`/`플로웰`). (c) Added a systematic audit `scripts/audit/empty-en-report.mjs`; it finds **no** other ordinary empty-vs-KO field — the remaining diffs are structural (EN `support` is an older crawl with 8 sections vs KO's 6; EN `notices` is a different board) and need re-translation, not value copying. | `content/en/pages/home.json`, `content/en/boards/products.*.json`, `lib/content/__tests__/product-page.test.ts` |
| 2 — Fluid layout (cover larger screens) | imweb `extend_section` sections fill `100vw − 400px` with **no cap** (measured 1520 @1920, 2160 @2560). Implemented for the only sections carrying the class (home ×6, company.organization ×1): `max-width = --row-w + (100vw − 1440px)` at ≥1350 (exact for both the 400px- and 280px-gutter sections), `100vw − 30px + 2·--row-pad` at 1024–1350. Non-extend sections keep the 1280 cap (matches the original). Home §2 cards get an aspect-ratio height (`HOME_CARD_DESKTOP_SIZE`, 238:319) at ≥992 so they scale with the fluid width instead of staying 319 tall. | `components/content/SectionRenderer.tsx` (`data-extend`, `data-row-top`, home-card aspect), `app/globals.css` |
| 3 — `/company/philosophy` §3단계 EN icons | The P1 radius + P4 icon-centering rules were keyed to **KO** widget ids only, so the EN cards' 88px icons were left-aligned/unrounded. Re-scoped to `section[data-philcard="1"]` (already emitted for both locales) — no per-locale ids. | `app/globals.css` |
| 4 — `/company/about` "Total solution" circles | Replaced the 5 authored JPGs (painted inside the gallery's white item boxes) with a TSX `TotalSolutionCircles` component: 5 circles on a darker `#d9e0ea` fill (they no longer blend into the `#eef1f5` band), text from each item's `title`+`desc`. Admin-editable **as text** — the block now exposes `fields: ["title","desc"]` (image control hidden), the merge parser/save validator accept text-only items, and the JSON seeds carry the KO (EN name + KO name + KO desc) and EN texts. | `components/content/SectionRenderer.tsx`, `scripts/gen-content-registry.mjs`, `lib/content/merge.ts`, `lib/content/save.ts`, `app/admin/_components/registry/GalleryField.tsx`, `content/{ko,en}/pages/company.about.json` |
| 6 — hover-scale EN parity (follow-up) | Added the remaining EN twins (`home §ECOWAVE band`, `home §7 HQ band`, `about §2 photo`, `about §HQ band`, `organization` org chart) so EN hover counts now equal KO on home/about/organization/rnd. | `components/content/SectionRenderer.tsx` (`HOVER_SCALE_WIDGET_IDS`) |

**Verified** (rebuilt `:4517`): home §2 nav row/card = 1070 / 238×319 @1440, 1550 / 358×479 @1920, 2190 / 518×694 @2560 (original: 1070/238×319, 1550/358×480, 2190/518×695); full-page height delta vs original +3 @1440, +29 @1920 (home) and 0 @both (organization); philosophy §3단계 icons at x 249/676/1103 in **both** locales; `/company/about` §토탈 솔루션 renders the 5 dark circles (section 659px = original); facilities filter pills 250px with no overflow; `data-hover-scale` 5/5 on `/` & `/en`, 3/3 about, 1/1 organization, 5/5 rnd.technology. `npm run verify` + **356 tests pass**.

**Not changed (structural / needs the admins):** the EN `support` page is an older crawl and the EN `notices` board is a different board — these need re-translation rather than value-copying, so they are left for the admins (the audit script reports them). The EN Flowell board still carries extra rows beyond the original's 3 (destructive delete pending client OK).

---

## Appendix — evidence index

- Live originals checked: `/` (home), `/36` (flowell), `/37` (eco-wave). Their
  titles/order match `content/ko/**` exactly (so the KO snapshot is current).
- **Recon pass (2026-10-09):** local prod server `:4517`, Playwright at
  1440×900, reduced-motion emulated for reveal-flat captures and disabled for
  hover checks. Confirmed: items 1, 3–4, 5, 7, 9–10, 11 reproduce; item 6 does
  not (already fixed); item 8 needs the exact target.
- Section ids / widget ids referenced above all live in
  `components/content/SectionRenderer.tsx` or `components/products/*`.
- PPT slide images were extracted read-only; no project files were modified
  while producing this plan. Recon screenshots were temporary and deleted.
