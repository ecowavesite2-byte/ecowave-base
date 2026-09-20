# ECOWAVE Admin Dashboard — Implementation Plan

Status: **draft v1.0** — complete (surfaces, layout, phased plan, verification, MVP scope); pending user go-ahead.
Inputs: exp-4 content-model inventory, exp-5 runtime/infra inventory, lib-1 stack research (2026), des-1 UX spec (wireframe: `design/admin-wireframe/index.html`).

## 1. Goal & scope

A single-admin dashboard at `/admin` to **edit text and images on all pages in Korean and English**, plus board posts, site strings, and media — with draft/publish, a live preview at the site's real breakpoints, and zero regression to the pixel-parity frontend.

**In scope (v1)**
- Page content editing (text/HTML, images, buttons, galleries, spacers) for 19 pages × 2 locales.
- Board post CRUD: news, notices, products (3 boards).
- Site strings: navigation labels (ko/en), logos; footer lines via its real source.
- Media library: browse/search `public/images`, upload new images, alt-text management, usage list.
- Draft → preview → publish workflow with on-demand revalidation.

**Out of scope (v1)**
- Roles/permissions beyond a single admin account (slot reserved in Settings).
- Full version history (git commits + "Revert to published" are the safety net).
- Dark mode. WYSIWYG editing of crawled HTML (field-level inputs + HTML source instead).
- Analytics, charts, multi-site.

**Constraints that shape everything**
- Frontend is pixel-audited against the original (desktop 15/20 pages ≤3.2% diff); edits must not shift layout inadvertently → structural fields are quarantined, font sizes constrained to the real set.
- Every page is authored **twice** (ko/en, independent JSON) and **twice per viewport** (`pc_section mobile_hide` vs `mobile_section`).
- Content JSON is a **crawled DOM dump** (inline styles, crop math in `imgStyle`/`boxStyle`) — a CMS-style schema migration would destroy fidelity → files stay the source of truth.
- Self-hosted Node server (`next start --port 4517`), git-tracked `content/` + `public/`, Windows host, no CI.

## 2. Surfaces to include (what pages the admin manages)

### 2.1 Pages — 19 per locale (`content/{ko,en}/pages/*.json`)

| Group | Route | Page key / file | Notes for the editor |
|---|---|---|---|
| Home | `/` | `home.json` | Hero carousel (`visual[]`), sections, **news ticker** (first 4 news posts), footer section (renders the site footer) |
| Company | `/company` | `company.json` | Landing; currently identical body to `company.ceo.json` |
| | `/company/ceo` | `company.ceo.json` | CEO greeting |
| | `/company/about` | `company.about.json` | Product showcase carousel |
| | `/company/philosophy` | `company.philosophy.json` | Cover cards |
| | `/company/history` | `company.history.json` | Timeline + `aside` rows (desktop/mobile authoring split) |
| | `/company/organization` | `company.organization.json` | Org chart + HQ map embed (iframe inside HTML) |
| | `/company/global` | `company.global.json` | Offices + map embed |
| R&D | `/rnd` | `rnd.json` | Identical body to `rnd.technology.json` |
| | `/rnd/technology` | `rnd.technology.json` | |
| | `/rnd/patents` | `rnd.patents.json` | Document/certificate cards |
| | `/rnd/facilities` | `rnd.facilities.json` + `facilities-tabs.json` | Production process code block (largest HTML, 21.8K chars) + 3 image tabs |
| Products | `/products`, `/products/eco-wave`, `/products/clean-b`, `/products/flowell` | **board-backed only** | Page JSONs exist but are **dead** (never read by any route). **Decision: delete these 8 files in Phase 0**; the admin edits the boards instead. Hero/tabs are code-side (`ProductBoard.tsx`) |
| News | `/news` (+ `/news/[id]`) | `news.json` + `boards/news.json` | Page JSON = hero/around; list/details from board; detail is a template, not a page |
| Notices | `/notices` (+ `/notices/[id]`) | `notices.json` + `boards/notices.json` | Same pattern |
| Support | `/support` | `support.json` | Inquiry form (client-only today; labels from `lib/form-labels.ts`) |

Every page above has **both** ko and en files (en may be a separate authored copy; runtime falls back to ko only when an en file is missing).

Duplicated bodies (`company`==`company.ceo`, `rnd`==`rnd.technology`) are **real parity, not a bug** — they remain independent pages; the editor shows a “shared body with X” badge and offers a copy action (never alias).

### 2.2 Boards — 5 (`content/{ko,en}/boards/*.json`)

`news` (card grid), `notices` (line list), `products.eco-wave`, `products.clean-b`, `products.flowell`. Post fields: `idx` (immutable id), title, date, category (products), excerpt, thumbnail, `isNotice` (pin), body HTML, attachments (`files[]`).

### 2.3 Site strings (`content/{locale}/site.json` + code-side strings)

| Surface | Source | Editable? |
|---|---|---|
| Navigation labels (top + children) | `site.json nav[]` | Yes (ko + en side by side); **routes read-only**; labels also drive page hero titles + breadcrumbs (`lib/page-hero.ts`) — UI copy warns accordingly |
| Logos | `site.json logos[]` | Picker from media |
| Footer lines/copyright | `site.json footer` is **unused at runtime**; the real footer renders from the `home.json` footer section | Edit via the Home page's footer section; unused `site.json.footer` / body-font fields are hidden from the admin |
| Board UI labels | `lib/ui-strings.ts` | Yes (typed fields) |
| Inquiry form labels + consent text | `lib/form-labels.ts` | **Read-only** — auto-generated by `scripts/gen-form-labels.mjs` |
| Hardcoded strings (`PRODUCT_HERO`, category tabs, metadata) | code | Out of scope v1 (developer change) |

### 2.4 Media (`public/images/**` + `content/assets-manifest.json`)

538 existing files (66.5 MB) under `thumbnail/` + `upload/`; root-relative refs in JSON; nearly all `alt` empty. Admin gets browse/search, upload (new files → `public/images/upload/<yyyymmdd>/`), alt-text editing, usage list (which page/widget references the file), and fixed named crops that create sibling files.

## 3. Layout to implement (from des-1 spec)

- **Shell**: left rail 248px (icon rail 60px, `Alt+B`) → Dashboard · Pages · Boards · Media · Site strings · Settings (+ View site). Page tree is generated from `site.json nav[]` so it mirrors the real menu (Home, Company, R&D, Products, News, Notices, Support).
- **Locale model**: global scope switch `KO │ EN │ Both` (session-wide, drives lists + editor default) vs **editor locale tabs** `한국어 │ English` (per-editor only). Every page-list row shows translation coverage (`KO 100% · EN 82%`).
- **Page editor = 3 panes**:
  1. **Structure** (248–280px): section/widget tree with `PC / MOBILE / PC+MO` badges; simple mode flattens `1 row → 1 col` sections; a `⌗ Layout` chip reveals row/col tree (grid/h/pad) when irregular; drag-drop + keyboard reorder.
  2. **Inspector** (min 420px): one widget at a time with locale tabs, coverage chip, primary fields per type (rich text with a constrained toolbar; image Replace/Alt/Link; gallery layout + items; button; spacer; board/form pointers read-only), then collapsed groups: Display & size · Motion · Link & behaviour · **Advanced — raw styles** (quarantined, amber).
  3. **Preview** (520–680px): real route in an iframe with draft payload, **fixed device widths 1440 / 992 / 390** (site swaps section sets at 992), selected widget outlined, 800ms debounced refresh, permanent `draft content` chip, hidden-at-width warning with one-click device switch.
- **Board editor**: board list → post list (filters, bulk select, pin toggle) → 2-column post editor (title/date/category/pin/excerpt/rich body/attachments/thumbnail/translation panel).
- **Media library**: 160px tile grid, `Missing alt text` and `Unused only` filters, detail drawer with usage list + Replace, fixed named crops (sibling files), parallel uploads with per-file progress.
- **Save model**: autosave draft (900ms debounce) + explicit **Publish** (summary modal: publish both / Korean only); in-memory undo (50 ops) + `Revert to published`; save status single indicator; nav guard only for in-flight/failed saves.
- **A11y & tokens**: admin-only token layer (`accent #3465de`, `ink #212121`, `muted-2 #6b7280` for helper text — never `#959595`; focus ring 2px `accent/25`); tree = `role=tree` + roving tabindex + live-region selection announcements; badges always color + symbol + word; breakpoints degrade preview to overlay/modal below 1440 and keep boards/media usable on narrow screens.
- **Must-not-skip details**: middleware must exclude `/admin`; flatten 1r1c trees for display; surface the desktop/mobile split everywhere; constrain rich-text font sizes to 48/36/30/26/22/20/16; `form-labels.ts` read-only; drafts stored separately; widget `id` visible/stable; board widgets are pointers.

## 4. Implementation plan (phases)

**Architecture after oracle review** — changes vs. the initial recon: content stays file-backed, but production writes go to a **`CONTENT_ROOT` data dir** (repo `content/` remains the seed/backup); auth is an **iron-session signed cookie + one env credential** (no SQLite native module, no DB); the safety model is **explicit Save + automatic server-side revision snapshot per save** (autosave/draft/publish move to Phase 5); middleware keeps only a cookie-presence check, with authoritative session validation in `app/admin/layout.tsx` and every route handler.

Every phase gate: `npm run typecheck && npm run lint && npm run build` green → serve `:4517` → smoke the affected routes → audit regression (`scripts/audit/capture.mjs --side=local` + `diff.mjs`) vs the Phase-0 baseline. Rollback = git + `content/.history/` snapshots.

### Phase 0 — Safety net & foundations (blocker)
Create `lib/content/paths.ts` (key↔file resolution, slug allowlists, `CONTENT_ROOT` containment, Windows-safe name checks), `lib/content/schemas.ts` (Zod for Page/Board/Site + the untyped fields, `.passthrough()` so crawl-only keys survive), `scripts/content-validate.mjs` (validates all 53 files; fails closed), `data/` + `content/.history/` (gitignored).
Modify `middleware.ts` (matcher → `"/((?!_next/|images/|uploads/|media/|admin|api/|favicon.ico|robots.txt|sitemap.xml|.*\..*).*)"`), `next.config.ts` (`serverExternalPackages`), `.gitignore` (drafts, `.history/`, `data/`, `*.sqlite*`, `public/uploads/`, `.openchamber/`), `package.json` (`content:validate`, `verify` scripts).
Hygiene in the same phase: **delete the 8 dead product page JSONs**, **fix the board `name` data** (ko news=공지사항 / notices=뉴스; en news=Notice / notices=News), snapshot `content/` → `content/.history/baseline/`.
Acceptance: temporary `/api/health` returns 200 (not rewritten to `/ko/api/health`); `/admin` returns Next's 404 (not `/ko/admin`); `content:validate` passes; pixel audit unchanged.

### Phase 1 — Auth + admin shell
Create `lib/auth/session.ts` (iron-session config), `lib/auth/guard.ts` (`requireAdmin()` for RSC + route handlers), `app/admin/layout.tsx` + `app/admin/page.tsx` (dashboard) + `app/admin/login/page.tsx`, `app/api/admin/login/route.ts` + `logout/route.ts`, `app/admin/_components/AdminShell.tsx` (left rail per §3).
Acceptance: unauthenticated `/admin/*` → login; cookie httpOnly + SameSite=Strict + Secure in prod; login throttled + constant-time compare; logout clears; no public route changes.

### Phase 2 — Content store + save API + revalidation (no UI)
Create `lib/content/read.ts` (wraps/replaces `lib/content.ts`; CONTENT_ROOT, draft-aware, optional mtime cache), `lib/content/write.ts` (in-process mutex + atomic write + Windows retry/backoff + revision snapshot + optimistic hash), `lib/content/sanitize.ts` (style-preserving sanitize-html config), `lib/content/mutate.ts` (typed setters: text html, image src/alt, gallery captions, board fields), `lib/content/revalidate.ts` (file → routes: both locales incl. fallback, layout for nav/footer, board + detail), `app/api/admin/content/route.ts` (GET + PUT with `If-Match` hash → 409 on mismatch).
Modify `lib/content.ts` to re-export from `read.ts`; promote untyped fields to typed in `lib/types.ts`.
Acceptance: PUT persists text and image changes; invalid payload → 400 (Zod detail); `<script>`/`on*` stripped while inline styles survive; stale hash → 409; edited page reflects the change after `revalidatePath`; snapshot written per save; vitest suites for sanitize (payload corpus: `javascript:`, `onerror`, `expression()`, `url(data:)`), path containment (traversal + Windows reserved names), revalidate mapping.

### Phase 3 — Pages editor UI (MVP core)
Create `app/admin/pages/page.tsx` (tree from `site.json nav[]` + orphan pages), `app/admin/pages/[...key]/page.tsx`, `app/admin/_components/editor/{StructureTree,Inspector,WidgetFields,AdvancedGroup,PreviewPane,LocaleTabs}.tsx`, `app/admin/_lib/tree.ts` (section→row→col→widget walk; 1r1c flattening for display).
Acceptance: 3-pane editor per §3; KO|EN tabs + Translated/Inherited/Missing badges; Simple mode edits text HTML (textarea + preview), image `src`/`alt` picker over the existing 538 assets, gallery captions; PC/MOB badge; Advanced raw-styles group reachable but quarantined; explicit Save + “Revert to published/snapshot”; no autosave.

### Phase 4 — Boards editor
Create `app/admin/boards/page.tsx`, `app/admin/boards/[slug]/page.tsx`, `lib/content/boards.ts`. Post CRUD (title/category/excerpt/date/`isNotice`/thumb picker/body HTML), list filters + reorder, revalidate board + detail routes. (MVP ships the metadata portion only: title/excerpt/date/`isNotice`/thumb.)

### Phase 5 — Drafts + preview
Create `lib/content/drafts.ts` (`*.draft.json` overlay), `app/api/admin/draft/route.ts`, `app/api/draft/route.ts` (session-guarded `draftMode().enable()`, Node runtime), PreviewPane widths 1440/992/390 with the draft payload + `draft content` chip. Public output unchanged while a draft exists; publish promotes atomically; discard removes. Draft files gitignored and never served.

### Phase 6 — Media library + uploads
Create `app/admin/media/page.tsx`, `app/api/admin/upload/route.ts` (Node runtime: `file-type` sniff → reject SVG/ANI/non-png/jpeg/webp → sharp re-encode with `limitInputPixels` + metadata strip → content-hashed immutable filename, never overwrite), `lib/media/{store,index}.ts`, `content/media-index.json` (alt/crops/usage; leaves crawl-owned `assets-manifest.json` untouched), serve uploads via `app/media/[...path]/route.ts` (or gitignored `public/uploads/`). Media UI: grid, `Missing alt` / `Unused` filters, usage list, fixed named crops as sibling files.

### Phase 7 — Site strings
Create `app/admin/site/page.tsx`, `lib/content/site-strings.ts`. Edit nav labels (ko/en) + logo picker; routes read-only; warn that labels also change page hero titles/breadcrumbs; hide the unused `site.json.footer`/bodyFont/bodyColor/bodyBg fields; footer lines are edited via the Home page's footer section.

### Phase 8 — Hardening & ops
CSP (nonce) middleware; audit log (who/when/file, tied to snapshots); login rate-limit tuning; `content:backup` / `content:restore` scripts; `engines` pin; README ops runbook (build/stop/start order, CONTENT_ROOT, snapshot policy, never build while serving); optional Better Auth upgrade path if a second editor ever appears.

## 5. Verification & rollback

- **Per phase**: `npm run typecheck && npm run lint && npm run build`; serve `:4517`; smoke `/`, `/en`, `/company/ceo`, `/news`, `/notices`, and the edited page(s); `scripts/audit/capture.mjs --side=local --only=<touched pages>` + `diff.mjs` compared against the Phase-0 baseline — no unintended pixel drift.
- **Unit layer (new, vitest)**: `sanitize` (XSS corpus incl. style preservation), `paths` (traversal + Windows reserved names + containment), `revalidate` (file→paths incl. both locales), `mutate` (round-trip fidelity).
- **Security checks**: unauthorized route access matrix (direct URL, tampered/expired cookie, missing CSRF header); malicious upload corpus (polyglot, SVG, oversized, traversal filename); confirm `content:validate` blocks malformed writes at build time.
- **Rollback**: every save writes a revision snapshot under `content/.history/`; “Revert to published/snapshot” in the UI; repo-level rollback = `git checkout` of `content/**`; ops rule: stop `:4517` before `npm run build`.
- **Ops guardrails**: production writes go to `CONTENT_ROOT` (outside the git tree); uploads are content-hashed (no cache staleness); `.env.local` holds the session secret + admin credential hash (fail closed when unset).

## 6. Phase-1 MVP scope (recommended)

Ship **Phase 0 → 1 → 2 → 3**, plus **board post metadata** (Phase 4 partial: title, excerpt, date, `isNotice`, thumbnail picker — no HTML body editing).

- Surfaces: Pages (19 × ko/en) + Boards metadata; text and images chosen from the existing media library.
- Safety: explicit Save with per-save server-side revision snapshots (real undo/rollback); no autosave, no draft/publish two-tier.
- Phase 0 hygiene included: delete the 8 dead product JSONs; fix the board `name` data.
- Explicitly out of MVP: uploads/sharp, media library/crops, draftMode preview, site-strings editor, Advanced-field editing beyond read-only, rich-text WYSIWYG (field-level HTML textareas only), roles/multi-user, any database.

This delivers the core need (edit text + swap images, both languages, with rollback) with no new native dependencies, no new runtime namespaces, zero public-bundle/CSS impact, and full verifiability through the existing pixel audit.
