# ECOWAVE Website Migration Plan — Stage 1 (Static Migration)

> **STATUS (Stage 1 implemented):** ✅ Phases 0–6 complete and validated.
> Scaffold + crawler + content snapshot (KR/EN) + 523 mirrored assets + pixel-close rebuild of
> all 20 pages × 2 locales + boards as static JSON + 301 redirects + sitemap/robots/404.
> `tsc` ✅ · ESLint ✅ · `next build` ✅ (101 static pages) · side-by-side metrics vs original in `design/metrics.json`,
> rebuilt screenshots in `design/rebuilt/`.

**Source:** https://imweb8701032505.imweb.me (Korean, imweb.me page builder) + EN mirror https://en.ecowavekorea.co.kr
**Target folder:** `E:\Projects\ecowave`
**Stage 1 stack:** Next.js (App Router) + TypeScript + TailwindCSS — **no database, no forms, no auth, no deployment yet**
**Approved decisions:**

1. Two locales (KR + EN) with language selector at the **end of the header** — EN text content comes later; EN falls back to KR content for now.
2. No admin. All pages static.
3. No form actions (skipped; DB + admin + forms in a later stage).
4. Vercel + Neon confirmed for the future; env vars added later.
5. No deployment work in this stage — copy content, semantic routing, static rendering.
6. Client owns the content (confirmed).
7. No auth/member logic (imweb chrome excluded).

---

## 1. Site Inventory (verified by crawl)

### 1.1 Sitemap & semantic routing

| #   | Source | Page (KR)                                                        | New route                          |
| --- | ------ | ---------------------------------------------------------------- | ---------------------------------- |
| 1   | `/`    | 메인 (hero, vision, business pillars, global map, notice ticker) | `/`                                |
| 2   | `/15`  | 에코웨이브 (company landing)                                     | `/company`                         |
| 3   | `/16`  | ceo인사말                                                        | `/company/ceo`                     |
| 4   | `/17`  | 회사소개                                                         | `/company/about`                   |
| 5   | `/18`  | 경영철학                                                         | `/company/philosophy`              |
| 6   | `/19`  | 회사연혁                                                         | `/company/history`                 |
| 7   | `/31`  | 조직도                                                           | `/company/organization`            |
| 8   | `/20`  | 글로벌지사 (KOR/CHN/KHM)                                         | `/company/global`                  |
| 9   | `/21`  | 연구개발 (R&D landing)                                           | `/rnd`                             |
| 10  | `/22`  | 보유기술                                                         | `/rnd/technology`                  |
| 11  | `/23`  | 국내외 특허                                                      | `/rnd/patents`                     |
| 12  | `/24`  | 생산설비                                                         | `/rnd/facilities`                  |
| 13  | `/32`  | 제품소개 (products landing)                                      | `/products`                        |
| 14  | `/37`  | 에코웨이브 제품 게시판                                           | `/products/eco-wave` (+ `/[id]`)   |
| 15  | `/38`  | 크린비 제품 게시판                                               | `/products/clean-b` (+ `/[id]`)    |
| 16  | `/36`  | 플로웰 제품 게시판                                               | `/products/flowell` (+ `/[id]`)    |
| 17  | `/26`  | 뉴스룸                                                           | `/newsroom` (redirects to `/news`) |
| 18  | `/29`  | 뉴스 게시판                                                      | `/news` (+ `/news/[id]`)           |
| 19  | `/28`  | 고객지원                                                         | `/support`                         |
| 20  | `/27`  | 공지사항 게시판                                                  | `/notices` (+ `/notices/[id]`)     |

- **Every numeric source URL (`/15`, `/27`, `/32`, …) becomes a proper Next.js page route with a semantic path** (see table above) — no numeric URLs in the new site. A 301 redirect map preserves inbound links from the old URLs.
- Board posts (`?idx=…&bmode=view`) → `/news/[id]`, `/notices/[id]`, `/products/{category}/[id]`.
- Excluded: imweb login/member/alarm chrome, privacy-policy boilerplate pages (imweb templates), platform footers.

### 1.2 Content types

1. **Static corporate pages** — text, images, tables (history timeline, org chart, patents, facilities).
2. **Boards** — News, Notices, 3 product catalogs: lists (title/date/views/pagination) + rich-HTML detail posts. In Stage 1 these render **from static JSON**, exactly matching the original look.
3. **i18n structure** — `[locale]` routing with `ko` default (no URL prefix) and `en` (prefixed). UI strings translated now; **page content EN port deferred** (EN falls back to KR content until then).

### 1.3 Assets

- All media on public CDN `cdn.imweb.me` → downloaded into `public/images/…`, served via `next/image`.
- Scraper requests the largest available variant of each asset; a URL→local-path manifest drives content rewriting.

---

## 2. Target Architecture (Stage 1)

```
ecowave/
├─ app/
│  ├─ [locale]/                      # en (prefixed); ko handled via root rewrite
│  │  ├─ page.tsx                    # Home
│  │  ├─ company/{ceo,about,philosophy,history,organization,global}/page.tsx
│  │  ├─ rnd/{technology,patents,facilities}/page.tsx
│  │  ├─ products/page.tsx
│  │  ├─ products/[category]/page.tsx          # eco-wave | clean-b | flowell
│  │  ├─ products/[category]/[id]/page.tsx
│  │  ├─ news/page.tsx   news/[id]/page.tsx
│  │  ├─ notices/page.tsx  notices/[id]/page.tsx
│  │  └─ support/page.tsx
│  ├─ sitemap.ts, robots.ts, not-found.tsx, layout.tsx, globals.css
├─ components/
│  ├─ layout/   (Header w/ language selector at end, Footer, MobileMenu)
│  ├─ ui/       (SectionTitle, BoardList, Pagination, Breadcrumb, PageHero, …)
│  └─ sections/home/ (Hero, Vision, QuickLinks, Pillars, GlobalMap, NoticeTicker)
├─ content/
│  ├─ ko/… en/…                      # per-page structured JSON from crawler
│  └─ boards/{news,notices,products}/*.json
├─ scripts/crawl/                    # crawler + asset downloader + report
├─ lib/ (i18n.ts, content.ts, seo.ts)
├─ messages/ (ko.json, en.json)      # UI strings only
└─ public/images/…
```

- All pages are **RSC**, content loaded from `content/` JSON at build time (fully static, no DB).
- Board pagination in Stage 1: static path segments (`?page=` handled client-side or via generated segments) — exact behavior decided by what matches the original UX best.
- Prisma/Neon added in the **next stage** (schema draft retained at the bottom of this file for reference).

---

## 3. Execution Phases (Stage 1)

### Phase 0 — Scaffold

- `create-next-app` (TS strict, App Router, Tailwind v4, ESLint/Prettier), Git init, folder skeleton, i18n wiring stubs, `env.example` placeholder.

### Phase 1 — Crawl & extract (the "copy" step)

- `scripts/crawl/` (Node + Playwright):
  - Crawl all ~40 URLs per locale (19 pages × 2 + board pages + every post detail).
  - Extract structured JSON per page (headings, paragraphs, images+alt, tables, timelines, org chart) with de-duplication of imweb's responsive DOM clones.
  - Extract all board posts incl. rich HTML + attachments → `content/boards/…`.
  - Download every referenced asset (largest variant) into `public/images/…` + manifest; rewrite content references to local paths.
- **Deliverable:** full `content/` snapshot (ko + en), mirrored assets, crawl report (URLs, assets, misses).

### Phase 2 — Design system & global layout

- Design tokens (colors, typography w/ Korean web font via `next/font` — Pretendard or Noto Sans KR, spacing, breakpoints) derived from the original.
- `Header`: full nav dropdowns (에코웨이브/연구개발/제품소개/뉴스룸/고객지원), mobile drawer, **language selector at the end of the header** (KR ⇄ EN).
- `Footer`: company info block + sitemap columns, exactly as original.
- Shared: `PageHero` (per-section banner), breadcrumbs, `SectionTitle`.

### Phase 3 — Static pages (KR, pixel perfect)

- Implement all corporate/R&D/product-landing pages from extracted JSON, faithfully matching layout: hero banners, section titles, history timeline, org chart, patents, facilities gallery, global offices.
- Homepage: hero carousel, vision, quick links, business pillars, global locations, notice ticker.
- **Validation gate:** Playwright side-by-side screenshots vs. original at 1440px + 390px for every page.

### Phase 4 — Boards as static content

- Board list pages (news / notices / 3 product categories) + detail pages rendered from `content/boards/*.json` — visually identical to the original (list rows, view counts, detail layout, prev/next navigation).
- 301 redirect map from old numeric URLs.

### Phase 5 — i18n wiring (structure only)

- `[locale]` routing active; language selector switches locale; UI strings translated (`messages/ko.json`, `en.json`); page content resolves locale → falls back to `ko` until EN port (deferred).

### Phase 6 — SEO & polish

- Per-page metadata + OG, `sitemap.ts`, `robots.ts`, favicons, 404, `next/image` everywhere, Lighthouse pass, dead-link check.

### Deferred (next stages, per your decisions)

- Prisma + Neon Postgres (schema draft in §4), seeded from Stage-1 content JSON.
- Admin panel, inquiry/contact form, view counters.
- EN content port (texts for all pages).
- Vercel deployment + domain.

### Validation (continuous)

- `tsc --noEmit` + ESLint + `next build` green at each phase end.
- Playwright side-by-side screenshots (1440px / 390px) vs. original for every page.
- E2E smoke: nav menus, board pagination, post detail, language switch, numeric-URL redirects.

---

## 4. Reference — future Prisma schema (NOT in Stage 1)

```prisma
model Post {
  id          Int       @id @default(autoincrement())
  board       Board     // NOTICE | NEWS | PRODUCT
  category    String?   // "eco-wave" | "clean-b" | "flowell" (PRODUCT only)
  locale      String    @default("ko")
  title       String
  content     String    @db.Text
  excerpt     String?
  thumbnail   String?
  isPinned    Boolean   @default(false)
  views       Int       @default(0)
  publishedAt DateTime
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([board, category, locale, publishedAt])
}
```

---

## 5. Risks & Mitigations

| Risk                                                                           | Mitigation                                                                                         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| imweb page-builder DOM is noisy (duplicated responsive widgets, inline styles) | Crawler extracts semantic content; pages rebuilt clean in Tailwind — visually faithful, code clean |
| CDN serves resized thumbnail variants                                          | Scraper requests largest available variant of each asset                                           |
| Board posts contain rich/inline HTML & attachments                             | Stored as HTML in JSON, rendered with typography preset; attachments mirrored                      |
| Korean web font performance                                                    | `next/font` self-hosting, `display: swap`, subsets                                                 |
| Hotlinked CDN URLs inside post HTML                                            | Rewritten at crawl time to local paths via manifest                                                |

---

## 6. Out of Scope (Stage 1)

- Database/Prisma, admin panel, forms, view counters, auth/member system, e-commerce, Vercel deployment, EN page content.
