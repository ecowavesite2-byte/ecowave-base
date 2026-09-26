# ECOWAVE — Next.js rebuild

Pixel-faithful migration of the ECOWAVE corporate site (Korean + English) from the
imweb.me page builder to a self-owned stack: **Next.js (App Router) · TypeScript ·
TailwindCSS v4**. Content is served from crawled JSON snapshots; the admin dashboard (below)
edits them through two lanes: the file-backed boards/settings store (atomic writes with
revision snapshots) and the **content registry** lane (auto-generated field defs +
Postgres `page_content` overrides). See `PLAN.md` for the project master doc (scope,
routes, parity program, remaining work), the "Content model & admin editing rules"
section below, and `design/audit/DEEP-UI-AUDIT.md` for the UI-parity audit detail.

- Original KR: <https://imweb8701032505.imweb.me>
- Original EN mirror: <https://en.ecowavekorea.co.kr>

## Getting started

```bash
npm install
npm run dev        # http://localhost:4000 (Korean) — English lives under /en
```

Production:

```bash
npm run build
npm run start      # http://localhost:4517 (audit scripts default here)
```

Quality checks: `npm run verify` (typecheck + lint + content:validate + build) · `npx vitest run` ·
the probes under `scripts/audit/` (see “Content model & admin editing rules” below).

## Routes

Korean is the default locale (no URL prefix); English is served under `/en/...`.
Old numeric imweb URLs (`/15`, `/29/?idx=…`) are 301-redirected to the semantic routes.

| Route | Page |
|---|---|
| `/` | Homepage |
| `/company` + `/ceo` `/about` `/philosophy` `/history` `/organization` `/global` | Company |
| `/rnd` + `/technology` `/patents` `/facilities` | R&D |
| `/products` + `/products/{eco-wave,clean-b,flowell}` (+ post detail) | Products |
| `/news` (+ detail) | News (old `/newsroom` 301-redirects here) |
| `/support`, `/notices` (+ detail) | Customer support / Notices |

## Project layout

```
app/[locale]/…            pages (locale = ko | en; ko handled via middleware rewrite)
components/layout/        Header (nav + language selector), Footer
components/content/       generic crawled-section renderer + page shells
components/ui/            PageHero, board list/detail components, RichText
lib/content/              content loaders + the registry/merge/save override lane
app/admin/…               dashboard; _components/registry/ = the content editor island
prisma/                   Postgres schema + migrations (page_content override store)
content/{ko,en}/          crawled site content (site.json, pages/, boards/)
public/images/            mirrored media from the original CDN
scripts/crawl/            Playwright crawler + validators (see below)
scripts/audit/            parity/E2E probes (capture, overflow, locale, editor E2E)
```

## Crawler / tooling (`scripts/crawl/`)

All scripts run against the live imweb source; outputs land in `content/` (data),
`public/images/` (assets) and `design/` (screenshots/metrics, git-ignored).

```bash
node scripts/crawl/crawl.mjs --locales=ko,en --only=globals,pages,boards   # content + assets harvesting
node scripts/crawl/crawl.mjs --locales=ko,en --only=assets                 # download + rewrite asset URLs
node scripts/crawl/crawl.mjs --locales=ko,en --only=shots                  # design-reference screenshots
node scripts/crawl/fix-nav.mjs && node scripts/crawl/fix-footer.mjs        # structured nav/footer patch
node scripts/crawl/measure.mjs                                             # desktop metrics of the original
node scripts/crawl/compare.mjs                                             # side-by-side vs original
node scripts/crawl/shoot-rebuilt.mjs                                       # screenshots of this rebuild
```

## i18n status

Both locales are served — Korean is prefixless (default), English lives under `/en/...` — and
page/board content is ported **per locale** in `content/{ko,en}/` (the old "EN falls back to the
KO snapshot" note no longer applies). The field-level content editor covers both locales.

**Locale parity rule:** never key behaviour to one locale's crawl ids (they differ between the two
crawls). The home chrome is detected structurally/content-based, per-widget feature maps must list
both locales' ids, and edits to either crawl must keep the two files index-aligned with mirrored
layout metrics. See "Content model & admin editing rules" below and the parity probe
`scripts/audit/measure-home-locales.mjs`.

## Content model & admin editing rules

The dashboard's **Content** page (`/admin/content?group=…`) edits the *content registry*:
`lib/content/registry.ts` (auto-generated, one def per editable field, emitted in nav/route order —
`Object.keys(PAGE_KEY_TO_ROUTE)` then board-only slugs; document order is preserved *within* a page)
plus the Postgres `page_content` override store (one row per key + locale; an empty value
deletes the override). `DATABASE_URL` is required for saving. Registry section labels are
**content-derived** (first visible text → menu title → image alt/file → type fallback → page/board
name): no `PC ·`/`모바일 ·` breakpoint prefixes, never empty, with ` (2)`, ` (3)` appended to
duplicate labels within a page.

### Regenerate / check the registry

```bash
npm run content:registry                      # regenerate registry.ts from content/{ko,en}/
node scripts/gen-content-registry.mjs --check # drift check (no write)
npm run content:health                        # dangling defs + dangling override keys
npm run content:validate                      # crawl structure + asset references
```

### What is editable (and how it behaves)

- **Text (`lines`)** — one line per styled run (a run = one text node in the authored markup).
  A line may be plain text **or** contain inline HTML: lines holding real tags are inserted
  verbatim while bare `<`/`&` are escaped per segment (`pH < 7` stays text). Text is injected into
  the authored markup, so sizes/colours/line-heights are **fixed by the crawl** — editors change
  copy only. Runs are detected from visible text only: zero-width characters are stripped, so
  invisible fillers never create phantom lines.
- **`title` / `desc`** — home text blocks split into the first run (`title`) and the rest (`desc`).
- **Hero slides (`slides`)** — JSON `[{ bg, title, subtitle }]` with add/remove/reorder; `title` is
  the big text, `subtitle` the smaller one. Each slide reuses the authored styling for its index;
  slides added beyond the crawl clone the last authored slide's template.
- **Image-card overlays (`overlay`)** — label + title for the home pillar cards. The stored value is
  the image `alt` overlay markup; the editor parses/serializes it via `lib/content/overlay-alt.ts`.
- **Location cards (`cards`)** — JSON `[{ lines: [...] }]` with add/remove/reorder. Applying a cards
  override restructures the cloned card nodes in the section; the renderer is unchanged.
- **Ticker picks (`picks`)** — JSON `{ board: "news" | "notices", idxs: [...] }`. The ticker renders
  the picked posts in order, links follow the chosen board, and an empty/stale selection falls back
  to the latest 4 news.
- **Images** — upload to Vercel Blob (content-hashed public names; requires `BLOB_READ_WRITE_TOKEN`)
  or set a path; a **reset** button clears the override back to the crawled default. There is no
  alt-text field.
- **Nested media in rich text** — images and iframes inside a `text` widget are editable per locale
  as `img[n].src` (image) and `iframe[n].src` (embed), addressing the nth tag in the markup.
- **Embeds (`embed`)** — a per-locale iframe/embed URL, validated as `http(s)`; the URL is injected
  into the authored `<iframe>` (the global-network maps now live in the `locations` payload's `mapSrc`).
- **Video** — the source accepts a YouTube/embed URL **or** an uploaded file; `.mp4/.webm/.ogv/.mov`
  sources render as a native `<video>`. Upload caps: video ≤ 50 MB (images have a smaller cap);
  uploads need `BLOB_READ_WRITE_TOKEN`.
- **Shared company intro** — the company intro band is edited **once** on the CEO greeting page
  (`company.ceo`, in the `company` group; label "회사 소개 인트로 (모든 회사 페이지 공통)"),
  badged in the editor, and applied to all `/company*` pages. The same shared-def mechanism powers the
  R&D intro band (see "Shared R&D intro" below).
- **Company root alias** — `/company` (the crawled root `company` pageKey) serves the CEO greeting
  subpage's content with no redirect; it is an alias, not an independently editable page. Only the
  six real subpages (`ceo → about → philosophy → history → organization → global`) appear in the
  admin group, and `/company` renders the first subpage.
- **R&D root alias** — `/rnd` (the crawled root `rnd` pageKey) serves the `rnd.technology` subpage's
  content with no redirect, via the same mechanism as `/company` → `company.ceo`. The crawled `rnd`
  page emits no registry defs, so only `rnd.technology`, `rnd.patents` and `rnd.facilities` appear in
  the admin R&D group.
- **History eras (`eras`)** — the `company.history` timeline is a structured list: add, remove or
  reorder era blocks, each carrying a year range, tagline, image and an ordered per-year milestone
  list (add/remove years, one milestone per line).
- **Global locations (`locations`)** — the `company.global` network is ONE dynamic list: the first
  item is the locked HQ band (no move/remove) and the rest are branch cards (add, remove, reorder).
  Every item carries badge/city/address/phone/fax/email/mapSrc; the map input accepts a Google Maps
  **embed** URL and shows an inline preview plus an "open in Maps" address link.
- **About-page galleries (`gallery` / `aboutCards`)** — the `/company/about` media blocks are
  structured: add/remove/reorder items, one image upload serves both the list thumbnail and the
  viewer original (`org = thumb`), and each block fixes its own editable text fields and max item
  count. Block-8 location pins are fixed (no upload); the slide galleries auto-scroll slowly and
  pause on hover/focus/drag.
- **R&D galleries (`gallery`)** — the investor-USP icon grid on `rnd.technology` §7 (also served at
  `/rnd`) is an image-only gallery capped at 5 items. The `rnd.patents` §4 certification area is no
  longer a `gallery` — it is the `patentSections` editor below, and the superseded per-item §4 gallery
  keys are folded by the migration pass.
- **Facilities tabs (`facilityTabs`)** — the `rnd.facilities` production-facility tabs edit the tab
  labels and their image lists (1–3 tabs; add/remove images). Defaults come from the crawled
  `content/{ko,en}/facilities-tabs.json`, edits are stored as a Postgres override, and an invalid
  stored payload falls back to the defaults at render time. The admin preview renders this section
  through the same shared component as the public page, so it shows the real tab pills and gallery.
- **Technology blocks (`techFeatures`)** — ONE def (anchor
  `rnd.technology#s202509091799d895b62ea/techFeatures/techFeatures`) edits the `rnd.technology` §4/§5/§6
  blocks (admin label "기술 블록") as THREE fixed block groups in page order: block 1 친환경·프리미엄 (§4),
  block 2 OEM·검사 (§5), block 3 스마트·살균·대량생산 (§6). Each block keeps its current page layout
  (block 1's left-heading table; blocks 2–3 top-heading cards) and its own dynamic item list
  (add/remove/reorder: an image + a multiline heading + an ordered list of label/body rows). Items flow
  two per row — a lone item renders full width, two render 50/50. Caps per block: 1–12 items, 1–30
  rows. One save updates all three blocks. Replaces the old per-widget image/text fields for those
  sections.
- **Certification sections (`patentSections`)** — the `rnd.patents` §4 certification area is a dynamic
  list of sections (admin label "인증 섹션 목록"): each section is one title + an ordered image list
  with editable per-image captions (the authored trailing empty slot is dropped). Caps: 1–12 sections,
  1–60 images per section.
- **Equipment tables (`facilitiesTable`)** — the `rnd.facilities` §5 four production-capacity tables
  are structured with fixed 2 columns (admin label "설비 표"): the two header labels are editable and
  the rows are a dynamic list of two-cell rows (add/remove/reorder). Caps: 1–100 rows.
- **Shared R&D intro (sub-hero banner)** — the white banner at the top of every R&D subpage
  ("첨단 설비와 철저한 관리로 …" / "Advanced facilities …") is edited **once** on `rnd.technology`
  (also served at `/rnd`; admin label "연구개발 소개 인트로 (모든 R&D 서브페이지 공통)"), badged in the
  editor, and applied to `rnd.patents` and `rnd.facilities` too. The former per-page copies are dead
  (no defs); editing the shared band updates all R&D subpages.

**Not editable by design:** links (`href`) are hard-coded; alt text (outside the overlay editor);
`code` blocks (the R&D facilities tab chrome stays non-editable — its tab labels and image lists are
editable via `facilityTabs`, and the §5 capacity tables via `facilitiesTable`); the mobile back-to-top
band. Plain markup-only text widgets are excluded from the registry unless they carry editable embedded
media (`img[n].src` / `iframe[n].src`).

### Payload contracts

`slides`, `cards`, `picks`, `eras`, `locations`, `gallery`, `aboutCards`, `facilityTabs`,
`techFeatures`, `patentSections` and `facilitiesTable` are structured JSON: `lib/content/save.ts`
validates them at the API boundary (malformed/empty → 400; per-block field config, shape and
`maxItems` are enforced and normalized, strings trimmed, internal newlines preserved; `facilityTabs`
accepts 1–3 `{ name, images }` tabs; `techFeatures` is `{ blocks: [...] }` with exactly 3 `{ items }`
blocks, each holding 1–12 `{ image, heading, rows }` items with 1–30 rows each; `patentSections` 1–12
`{ title, images }` sections with 1–60 captioned images each; `facilitiesTable` 1–100 two-cell rows) and stored payloads are re-validated at render time —
`lib/content/merge.ts` silently no-ops on garbage, and the `facilityTabs` reader falls back to the
file defaults. Applying an unchanged default payload reproduces the authored rendering. Malformed
overrides can never break rendering.

### Structured override migration (existing databases)

Superseded per-widget keys are folded into the structured payloads by
`scripts/content-migrate-structured.mjs` (dry-run by default; `--apply` writes): history era
label/years fields, the global HQ name/contacts/map widgets, about-page gallery items/cards, the
block-8 pins and the R&D USP gallery items (including legacy `rnd`-page keys onto the
`rnd.technology` target) all become `eras` / `locations` / `gallery` / `aboutCards` overrides. The same
pass also folds the superseded R&D per-widget keys into `techFeatures` / `patentSections` /
`facilitiesTable` (image `src` + `lines` runs → technology blocks / equipment tables; heading
`lines` + gallery items → certification sections — the `rnd.patents` §4 certificate keys fold here,
not as `gallery`), folds the retired per-page R&D banner override keys onto the canonical shared-R&D-intro
key (the canonical value wins; the first non-empty dead value is adopted only when the canonical is
empty; the dead keys are then deleted), and folds the superseded `techFeatures` v1 per-section keys
plus legacy per-widget keys into the single v2 key (the v1 value wins per block, per locale).
Run-count/shape mismatches (and `techFeatures` v1→v2 block mismatches) are skipped with a warning and
their legacy rows are kept (not deleted). Run it once when deploying onto a database that may hold old
overrides; a database with no overrides is a no-op.
Also run `npx prisma migrate deploy` on deploy — the `company_root_alias` migration moves legacy
`company#…` override keys onto the alias target (`company.ceo#…`).

### Locale rules (KO ↔ EN)

- The two locales are **separate crawls with different ids** — never key behaviour to one locale's
  ids. Home chrome is detected structurally: the ticker by its embedded `newest` widget
  (`isNoticeTickerSection`) and the footer via the content-based `isFooterSection`.
- Per-widget/section maps (`MOBILE_IMAGE_SRC`, `MAP_HOLDER_SECTION_IDS`, `HOVER_SCALE_WIDGET_IDS`,
  `HOME_TYPE_SECTION_IDS`, …) must list **both** locales' ids when the feature applies everywhere.
- When editing either crawl, keep the two files index-aligned and mirror layout-bearing metrics
  (row heights, `bgFixed`, image sizing/margins, type scales) so sections render identically.
- Parity probe: `node scripts/audit/measure-home-locales.mjs` (writes
  `design/audit/locale-sections.json`) — section counts and heights should match; remaining deltas
  must be copy-length driven only.

### Layout rules (responsive)

- The site is **single-source**: the canonical PC sections render at every width; the old
  mobile-only variant sections were removed for the company channel (about/history/global) and are
  dead elsewhere. Mobile layout comes from responsive CSS/TSX (breakpoints 992/1024 in
  `globals.css` + `SectionRenderer`). History era photos surface on mobile via the responsive
  asides + `MOBILE_IMAGE_SRC` portrait renditions.
- Desktop (≥992) is the reference — a responsive change must not alter it (compare with
  `scripts/audit/capture-home-viewports.mjs --label=…`).
- Wide bitmaps whose captions are baked into the pixels need a curated portrait mobile rendition
  (`MOBILE_IMAGE_SRC`) to stay legible at 390/768.
- No horizontal overflow at 390/768 — gate with
  `node scripts/audit/check-home-overflow.mjs --label=…` (measures frozen layout; ignores clipped
  and off-canvas chrome).

### Verify before committing

```bash
npm run verify                                  # typecheck + lint + content:validate + build
npx vitest run                                  # registry/merge/save/text-runs unit suites
node scripts/gen-content-registry.mjs --check   # registry drift
npm run content:health                          # dangling defs / override keys
node scripts/audit/verify-home-editor.mjs            # admin + runtime E2E (writes & reverts overrides)
node scripts/audit/verify-company-editor.mjs         # company content E2E: registry shape + gallery/eras/locations round-trips
node scripts/audit/verify-rnd-editor.mjs             # R&D content E2E: structured round-trips + shared band + preview smoke
node scripts/audit/capture-company-viewports.mjs     # company captures: mobile/desktop overflow, portraits, band parity
node scripts/audit/capture-structured-viewports.mjs  # structured overrides applied → captured → reverted
node scripts/audit/capture-rnd-viewports.mjs         # R&D captures: structured overrides applied → captured → reverted
node scripts/audit/probe-about-carousel.mjs          # about slider autoplay + pause-on-interaction probe
```

## Admin dashboard & ops runbook

The admin dashboard lives at `/admin` (login at `/admin/login`). It is guarded by
an iron-session cookie and is unreachable without the admin env vars.

### Environment (`.env.local`, never committed)

| Var | Purpose |
|---|---|
| `SESSION_SECRET` | iron-session signing/encryption secret (≥ 32 chars). |
| `ADMIN_EMAIL` | The single admin login email. |
| `ADMIN_PASSWORD_HASH` | scrypt 64-byte digest, lowercase hex (128 chars). |
| `ADMIN_PASSWORD_SALT` | scrypt salt, hex. |
| `CONTENT_ROOT` | Optional content data dir (prod writes outside the git tree). |
| `MEDIA_ROOT` | Optional uploaded-media dir (default `data/media/`). |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for the content-editor uploads (images/video). |
| `ADMIN_LOGIN_MAX_FAILS` / `ADMIN_LOGIN_WINDOW_MIN` | Login throttle (defaults 5 / 15). |

See `.env.example`. `next build`/`next start` fail closed when the auth vars are unset.

### Build / stop / start (dedicated port 4517)

**Never run `next build` while the server is running** — the build overwrites `.next`
underneath the live process. Order:

1. stop the server (`Ctrl-C` the `next start` process);
2. `npm run build`;
3. `npm run start` (port **4517**).

### Data roots & write model

- Repo `content/` is the seed; production writes go to `CONTENT_ROOT` when set.
- Field-level content edits (the registry lane) are stored as overrides in Postgres
  (`page_content`, needs `DATABASE_URL`); an empty value deletes the row and the code default
  applies again.
- Uploaded media is content-hashed under `MEDIA_ROOT` (`data/media/`) and served
  read-only via `/media/...`; `public/` is never written at runtime.
- Saves are atomic (`write-file-atomic`, Windows retry/backoff) and write a
  revision snapshot under `content/.history/<ISO>/`; an append-only audit log is
  kept at `content/.history/audit.log` (actor + file + hashes per write).

### Backup / restore

```bash
npm run content:backup                                    # data/backups/<ISO>.tar (content/ + data/media/)
npm run content:restore -- data/backups/<ISO>.tar --yes   # DESTRUCTIVE; stop the server first
```

Restore extracts into a staging dir, validates it with `content:validate`, takes a
safety backup, then swaps; the replaced state is kept under
`data/restore-staging/replaced-<ISO>/` for rollback.

### Optional: Better Auth upgrade path

The dashboard is deliberately a single-admin, cookie-only design. If a second
editor or per-user audit/roles are ever needed, replace `lib/auth/*` with a
provider such as Better Auth: keep the existing `requireAdmin`/`requireAdminApi`
call sites (they already gate every page and route handler), map the session to the
same `actor` field the audit log consumes, and move the credentials out of the
`.env.local` admin vars. The file-backed content store and the save/hash/snapshot
pipeline stay unchanged.

