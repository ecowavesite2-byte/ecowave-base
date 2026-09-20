# ECOWAVE — Next.js rebuild

Pixel-faithful migration of the ECOWAVE corporate site (Korean + English) from the
imweb.me page builder to a self-owned stack: **Next.js (App Router) · TypeScript ·
TailwindCSS v4**. Stage 1 is fully static — all content is served from local JSON
snapshots, no database, no forms, no auth. See `PLAN.md` for the full plan, scope
decisions and deferred stages (Prisma/Neon, admin, forms, Vercel deploy).

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
npm run start
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
| `/newsroom`, `/news` (+ detail) | Newsroom / News |
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
