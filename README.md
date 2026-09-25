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
`lib/content/registry.ts` (auto-generated, one def per editable field, emitted in page document
order) plus the Postgres `page_content` override store (one row per key + locale; an empty value
deletes the override). `DATABASE_URL` is required for saving.

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
  copy only.
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
- **Video** — the source accepts a YouTube/embed URL **or** an uploaded file; `.mp4/.webm/.ogv/.mov`
  sources render as a native `<video>`. Upload caps: video ≤ 50 MB (images have a smaller cap);
  uploads need `BLOB_READ_WRITE_TOKEN`.

**Not editable by design:** links (`href`) are hard-coded; alt text (outside the overlay editor);
`code` blocks; the mobile back-to-top band. Sections whose text widgets are markup-only (no text
nodes) are excluded from the registry.

### Payload contracts

`slides`, `cards` and `picks` are structured JSON: `lib/content/save.ts` validates them at the API
boundary (malformed/empty → 400) and the appliers in `lib/content/merge.ts` re-validate stored
payloads, silently no-oping on garbage. Malformed overrides can never break rendering.

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

- Home is **single-source**: the canonical desktop sections render at every width; the old
  mobile-only variant sections were dropped. Mobile layout comes from responsive CSS/TSX
  (breakpoints 992/1024 in `globals.css` + `SectionRenderer`).
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
node scripts/audit/verify-home-editor.mjs       # admin + runtime E2E (writes & reverts overrides)
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

