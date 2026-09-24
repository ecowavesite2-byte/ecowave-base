# ECOWAVE — project master doc

> Consolidated from the former `PLAN.md` (Stage 1 migration), `FIX-PLAN.md` (pixel-parity program) and
> `ADMIN-PLAN.md` (admin dashboard). Those files are removed; git history retains them.
>
> Companion docs: **`README.md`** — getting started, environment, admin ops runbook, build/serve rules.
> **`design/audit/DEEP-UI-AUDIT.md`** — the detailed UI-parity audit + fix progress (git-ignored
> `design/` folder; regenerated artifacts live next to it).

**Source of truth:** <https://imweb8701032505.imweb.me> (Korean, imweb.me page builder) +
EN mirror <https://en.ecowavekorea.co.kr>
**Stack:** Next.js (App Router) + TypeScript + TailwindCSS v4 · self-hosted Node
(`next start --port 4517`) · content = crawled JSON snapshots (no DB for the site; admin writes files)
**Locales:** `ko` (default, no prefix) and `en` (`/en/*`) — language selector at the end of the header.

---

## 1. Status

| area | status |
| --- | --- |
| Stage 1 — static migration (20 pages × 2 locales, boards, redirects, SEO) | ✅ implemented & validated |
| Admin dashboard (`/admin`, content editing, drafts/publish, media, audit log) | ✅ implemented |
| Pixel-parity program (audit pipeline + fix waves 1–6, commits `3eb57bc`…`cede0bc`) | ✅ desktop at parity; mobile residuals documented |
| Deployment | ⏳ not started — Vercel + Neon confirmed for the future |

---

## 2. Routes

| Route | Page | Old imweb URL |
| --- | --- | --- |
| `/` | Home | `/` |
| `/company` + `/ceo` `/about` `/philosophy` `/history` `/organization` `/global` | Company | `/15`–`/20`, `/31` |
| `/rnd` + `/technology` `/patents` `/facilities` | R&D | `/21`–`/24` |
| `/products` + `/products/{eco-wave,clean-b,flowell}` (+ post detail) | Products | `/32`, `/37`, `/38`, `/36` |
| `/news` (+ detail) | News (old `/newsroom` 301→ here) | `/29`, `/26` |
| `/support`, `/notices` (+ detail) | Support / Notices | `/28`, `/27` |

Old numeric URLs 301-redirect to the semantic routes (`next.config.ts`). Content lives in
`content/{ko,en}/pages/*.json` (19 pages/locale), `content/{ko,en}/boards/*.json` (5 boards),
`content/{ko,en}/site.json`; assets under `public/images/`.

---

## 3. Stage 1 — static migration (done)

- Crawler (`scripts/crawl/`) snapshots the original DOM/CSS into content JSON (inline styles preserved —
  a CMS-style schema migration would destroy fidelity), mirrors 523 assets, and records metrics.
- Rebuild renders the crawled sections via `components/content/SectionRenderer.tsx` with imweb's
  per-breakpoint channels (`pc_section mobile_hide` vs `mobile_section`), 992px breakpoint.
- Boards (news/notices/products) render from static JSON; rich-HTML posts via `BoardDetailShell` +
  `PostDetail`.
- Decisions: no member/auth logic from imweb; client owns content; EN content was later ported
  (`content/en/`).

---

## 4. Admin dashboard (done)

Single-admin dashboard at `/admin` (login `/admin/login`, iron-session cookie; fails closed without the
admin env vars). Built in phases 1–8: auth + shell → content store + save API + revalidation → pages
editor → boards editor → drafts + preview → media library/uploads → site strings → hardening/ops.
Writes are atomic with revision snapshots + an append-only audit log; uploaded media is content-hashed
and served read-only via `/media/...`.

**Operations, environment variables, backup/restore, and the build/serve order are documented in
`README.md`** (the runbook). Key rule: never run `next build` while `next start` is serving — stop,
build, start.

---

## 5. Pixel-parity program (done, with residuals)

### Method

- **Source of truth = the live original.** Both sides captured with the same procedure
  (`scripts/audit/capture.mjs`; 1440×900 desktop / 390×844 mobile; reveal/lazy settle; JS freeze on the
  original).
- Full-page pixel diff (`diff.mjs`, 32 bands), per-section diff (`section-diff.mjs`, crops),
  computed-style probes (`style-probe.mjs` + `style-diff.mjs` + `style-diff-summarize.mjs`), verified
  hover/active probes (`state-probe-nav.mjs`, `state-probe-content.mjs`), mobile interaction probe
  (`mobile-interaction-probe.mjs`), detail-page audit (`details-capture.mjs`), plus targeted DOM
  root-cause probes (`hot-probe*.mjs`, `residual-probe.mjs`).
- Every fix is measured against the original before/after; "mobile-only"/"desktop-only" scoping via
  breakpoint classes and per-section hooks (`data-vgutter`, `data-mh6`, `data-rtm`, `data-mapholder`).

### Starting point (2026-09-19 baseline)

Desktop worst pages: newsroom/news 62.7 %, support 57.3 %, rnd.facilities 51.4 %, products 51.2 %,
news 48.0 %, home 25.5 %. Mobile worst: newsroom 70.0 %, news 60.2 %, home 59.7 %, facilities 56.1 %,
organization 51.6 %. Root causes were structural (missing in-flow header, dropped mobile section
channels, widget CSS gaps, board/detail template differences).

### Fix waves (commits `3eb57bc` → `cede0bc`)

1. **Wave 1** — detail templates (`BoardDetailShell`: board banner, notices inquiry form, product tabs),
   SectionRenderer core (fixed-overlay back-to-top, mobile card overlay labels + crop centring, desktop
   overlays at rest, button size, rnd table scrolling), board-card geometry, shell/motion states
   (nav active hover, dropdown, language, mobile drawer), facilities pills, product tabs/pagination.
2. **Wave 2** — board card exact geometry (172.5×238, 7.5px gutter, 131px thumb, natural wrap),
   home ticker, PostDetail board view, galleries (dot cap removed, mobile 2-up, arrows hidden),
   reveal-trigger refuted as a probe artifact.
3. **Wave 3** — mobile widget bands + gutter-0 `.spacer` hook, board header `<em>`, products sibling nav.
4. **Wave 4** — scoped `data-mh6` 48px line-height, patents cert-grid + facilities mobile geometry,
   hero `[&_p]` white, **Tailwind candidate-mangling fix** (static class + `${…}` adjacency silently
   dropped `min-[992px]:auto-rows-…` → desktop patents +36px).
5. **Wave 5** — home mobile section bands (`MOBILE_SECTION_BAND` allowlist; §2/§3/§4 exact),
   `_hiddenXs` flag, desktop-scoped rich-text typography (−40.5 % desktop TYPE signatures, 0 height
   change), EN rnd §2 band id.
6. **Wave 6** — scoped philosophy mobile downscale (`data-rtm`), home §7 holder box model
   (`data-mapholder`; §7 exact 864), EN home §3 zero-placeholder image fix (−670 px).
7. **Wave 7 — home motion parity** — hero text `visualAnimation` on load and every slide change
   (desktop-only, 1.5s, delays 0.5s/0.8s, re-triggered, reduced-motion safe), hero slide fade
   1s→700ms, pillar cards `fadeInUp`→`fadeInLeft` (crawler-dropped direction; `ANIM_DIR_OVERRIDES`
   stop-gap + the durable `animDir` path), `Reveal` Left/Right travel ±100%→±60%. Audit + acceptance
   criteria: `design/audit/home-motion-audit.md`.
8. **Wave 8 — home motion, remaining sections** — §7 holder cards and the §8 ticker "+" button corrected
   to `fadeInRight` (same crawler-dropped direction; id map extended), §5 mobile slider autoplay added
   (opt-in `autoplayMs`, 5000ms, looping, reduced-motion aware), §8 ticker cards' spurious staggered
   `fadeInUp` removed (the original has none). Audit + acceptance criteria: `home-motion-audit.md`
   Part B.
9. **Wave 9 — header motion** — first-pixel scroll pin (`>0`), background transition
   `color/background/border-color 0.3s ease-out`, solid-state shadow removed, "더보기" + nested flyout
   `all 0.3s ease`, mobile drawer accordion animated via `grid-template-rows` 350ms (collapsed-state
   padding floor fixed with `minmax(0,·fr)`), z-index 999/998/997, mobile logo transition restored.
   Audit + acceptance criteria: `design/audit/header-motion-audit.md`.
10. **Wave 10 — remaining-pages motion sweep** — 15 crawled-dropped direction widgets remapped
   (`ANIM_DIR_OVERRIDES`; company.about 10, philosophy 2, history 3), company.about's plain slide
   gallery autoplay wired (opt-in 5000 ms), `Reveal.fadeInDown` travel −100% → −60%, and the subpage
   page-title `fadeDown` entrance reproduced (desktop-only, reduced-motion safe). Audit + acceptance
   criteria: `design/audit/pages-motion-audit.md`.
11. **Wave 11 — company.about** — gallery drag + infinite loop + hidden scrollbar + pointer cursors;
   the R&D grid's static caption band; address-card radius/shadow/hover; intro radius; §8 icon-grid
   geometry (desktop 1260×278 flush, mobile 365 gap-0). Audit: `design/audit/company-about-audit.md`.
   Queued: §6 정수기 +441px (mobile), §9 card x-offsets, §8 ~10px y-offset.
12. **Wave 12 — company.philosophy** — per-widget radii (banner/cover/vision), the vision margin/holder
   box model (desktop), the rtm mobile downscale additions (24→16 + h6 lh 1.2), centered §3단계 icons,
   and the `data-ph48` promise-band line-height hook. Desktop **6.14 → 2.77**; mobile 16.19 → 20.55
   (the corrected elements exposed the pre-existing mobile content deficit — queued). Audit:
   `design/audit/company-philosophy-audit.md`.
13. **Wave 13 — vision hover scale** — opt-in `hover_scale` image widgets now zoom `scale(1.1)` on hover
   (0.4s ease-out, clipped, ≥768px only) via a `data-hover-scale` hook + the measured 9-widget stop-gap;
   the crawler's class drop is the same family as `animDir` (durable path: persist `hoverScale`).
   Verified: both sides' hover values match, mobile static, no idle change. Audit:
   `design/audit/company-philosophy-audit.md` §8.

### Final verified metrics (closing build; diff % of differing pixels)

**Desktop 1440** — home **13.15** · philosophy 6.14 · about 5.41 · company/ceo 4.02 · patents 3.38 ·
facilities 3.25 · rnd/rnd.technology 2.80 · organization 2.48 · notices 2.40 · global 2.10 ·
history 1.90 · news/newsroom 1.72 · products.flowell 1.16 · products/eco-wave 1.14 · support 1.01 ·
products.clean-b 0.94.

**Mobile 390** — home **25.42** · history 18.22 · philosophy **16.19** · news/newsroom 16.07 ·
facilities 15.71 · rnd/rnd.technology 15.19 · about 13.54 · company/ceo 9.68 · notices 6.85 ·
organization 6.82 · global 5.91 · patents **5.61** · products.flowell 5.22 · support 4.85 ·
products/eco-wave 3.73 · products.clean-b 3.33.

**Board detail pages** (pre-fix → final): desktop news 63.8→**4.2**, notices 61.2→**2.2**,
product 44.4→**1.8**; mobile 57.8→**10.5**, 56.2→**6.8**, 24.6→**5.6**.

**Interactive states**: computed MOTION diffs 0 on both viewports; hover/active probes 8/8 MATCH on
content targets; nav T1/T3/T4/T5 MATCH; drawer MATCH.

### Known capture artifacts (not defects)

Carousel-phase mismatches (home hero/§5 slider, gallery bands — the original's JS is frozen mid-rotation
while local timers run); `background-attachment: fixed` non-paint in full-page captures (home §3);
fixed elements painted into full-page shots; font-family fallback-chain signatures (inert);
reveal/animation end-state normalization.

### Remaining work (documented with measurements)

1. Home ±24 px compensation items (page body now +14 vs original); §5 slider + hero bands remain
   carousel-phase artifacts.
2. Mobile coordinated typography for the excluded pages (about/history/rnd/patents/facilities) — the
   per-element-correct set moves those page heights beyond the ±10 px guard and needs per-page
   section-aware application.
3. `rnd` §2 +4 px — crawler row-partition artifact (extra padding widget) interacting with the global
   `.spacer` formula; needs a crawler-side fix.
4. EN channel: remaining band ids / EN philosophy downscale need an EN-side validation pass.
5. Header probe-pairing signature items (empty logo anchor vs the original's dropdown anchor) — inert.

Full detail, evidence index and per-wave validation tables live in `design/audit/DEEP-UI-AUDIT.md`.

---

## 6. Operations

```bash
npm run dev          # dev server (ko default, /en prefix)
npm run build        # production build  — STOP the running server first
npm run start        # production server on :4517 (audit scripts default here)
npm run verify       # typecheck + lint + content:validate + build
npm run test         # vitest (88 tests)
```

Content & audit tooling (all output to `content/`, `public/images/`, `design/` — the latter is
git-ignored):

```bash
node scripts/crawl/crawl.mjs --locales=ko,en --only=globals,pages,boards  # content harvest
node scripts/audit/capture.mjs --side=local --viewport=both               # screenshots
node scripts/audit/diff.mjs --viewport=both                               # full-page diff
node scripts/audit/section-diff.mjs --vp=both --top=12                    # per-section diff + crops
node scripts/audit/style-probe.mjs --side=local --vp=both                 # computed styles
node scripts/audit/details-capture.mjs                                    # detail pages
```

Admin ops, environment variables, backup/restore and the build/serve rules: see `README.md`.

---

## 7. Repo layout

```
app/[locale]/…            pages (ko | en), admin under /admin
components/layout/        Header, SiteFooter
components/content/       SectionRenderer (+ FacilitiesTabs, GallerySlider), BoardPageShell
components/ui/            PageHero, Boards (BoardCardGrid/PostDetail), Reveal, RichText
components/products/      ProductBoard
components/boards/        BoardDetailShell
lib/                      content loaders, route map, i18n, admin auth/store
content/{ko,en}/          crawled site content (pages, boards, site.json)
public/images/            mirrored + uploaded media
scripts/crawl/            crawler + validators
scripts/audit/            parity audit pipeline + probes
design/                   audit artifacts, snapshots, reference shots (git-ignored)
```

---

## 8. History

- Stage 1 migration: phases 0–6 (scaffold, crawl, design system, pages, boards, i18n, SEO) — original
  `PLAN.md` (now in git history).
- Admin: phases 1–8 — original `ADMIN-PLAN.md` (now in git history).
- Parity program: baseline 2026-09-19 → fix waves → final verification 2026-09-23 (commits `3eb57bc`,
  `a7ddcd6`, `1d98449`, `d02bbe1`, `e59bcc5`, `cede0bc`) — original `FIX-PLAN.md` (now in git history).
