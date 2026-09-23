# ECOWAVE — Next.js rebuild

Pixel-faithful migration of the ECOWAVE corporate site (Korean + English) from the
imweb.me page builder to a self-owned stack: **Next.js (App Router) · TypeScript ·
TailwindCSS v4**. Content is served from crawled JSON snapshots; the admin dashboard (below)
edits them via atomic file writes with revision snapshots. See `PLAN.md` for the project master
doc (scope, routes, parity program, remaining work) and `design/audit/DEEP-UI-AUDIT.md` for the
UI-parity audit detail.

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

Quality checks: `npm run typecheck` · `npx eslint .`

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
lib/                      content loaders, route map, i18n helpers, UI strings
content/{ko,en}/          crawled site content (site.json, pages/, boards/)
public/images/            mirrored media from the original CDN
scripts/crawl/            Playwright crawler + validators (see below)
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

The app is locale-ready: routing, header language selector, per-locale UI strings
(`lib/ui-strings.ts`) and per-locale board data. English **page content** is not
ported yet — pages fall back to the Korean snapshot until the EN content pass
(deferred per plan).

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

