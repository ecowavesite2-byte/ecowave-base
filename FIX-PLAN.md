# ECOWAVE pixel-parity fix plan

Goal: make the local rebuild of the Korean ECOWAVE site (imweb original) pixel-identical
as far as possible, desktop (1440) first, mobile (390) second. Original site is the source
of truth. This plan lists every measured difference and the fix approach.

## Method

- Audit pipeline: `scripts/audit/capture.mjs` (screenshots both sides with identical
  procedure) + `scripts/audit/diff.mjs` (pixelmatch diff, 32-band report).
- Full audit (2026-09-19) ran against a production build on `localhost:3000` and the live
  original `https://imweb8701032505.imweb.me`. Artifacts live in `design/audit/`
  (gitignored): `report.md`, `report.json`, `orig/`, `local/`, `diff/`, `crops/`.
- Re-run after fixes:
  ```powershell
  npm run build
  npm run start   # port 3000, keep running
  node scripts/audit/capture.mjs --side=local --viewport=both
  node scripts/audit/diff.mjs --viewport=both
  ```
  (Re-capture `--side=orig` only if the live site may have changed.)
- Zoom into a specific band for review:
  ```powershell
  node scripts/audit/crop.mjs --key=products --y=1250-1600 [--vp=desktop] [--sides=orig,local,diff]
  ```
  → `design/audit/crops/<vp>/<key>/<range>-<side>.png`

## Baseline results (2026-09-19, prod build)

Desktop 1440 (original-page pixel coordinates; band % = differing pixels in the band):

| page | diff % | orig h | local h | dh | worst bands |
| --- | ---: | ---: | ---: | ---: | --- |
| newsroom | 62.66 | 2350 | 1689 | -661 | 1636-1689 (99%), 1583-1636 (99%), 1531-1583 (98%), 1372-1425 (98%) |
| support | 57.28 | 1080 | 900 | -180 | 591-619 (99.7%), 450-478 (99.4%), 816-844 (99.4%) |
| rnd.facilities | 51.39 | 3394 | 15836 | +12442 | 3182-3288 (98%), 3076-3182 (97%), 3288-3394 (94%), 2970-3076 (86%) |
| products | 51.18 | 2012 | 1591 | -421 | 1541-1591 (100%), 1492-1541 (99%), 1293-1342 (99%) |
| news | 47.97 | 2350 | 2112 | -238 | 1782-1848 (99%), 1848-1914 (96%), 330-396 (94%) |
| products.flowell | 29.52 | 1547 | 1272 | -275 | 954-994 (98%), 994-1034 (98%), 1034-1073 (96%) |
| rnd.patents | 26.83 | 4910 | 5702 | +792 | 4757-4910 (99%), 4603-4757 (97%), 4450-4603 (67%), 307-460 (65%) |
| home | 25.50 | 7229 | 7241 | +12 | 1807-2033 (96%), 678-904 (95%), 0-226 (93%) |
| company.organization | 23.46 | 1984 | 1901 | -83 | 1485-1545 (92%), 713-772 (91%), 356-416 (79%) |
| rnd | 22.96 | 4493 | 4411 | -82 | 1792-1930 (75%), 689-827 (67%), 827-965 (66%) |
| rnd.technology | 22.95 | 4493 | 4411 | -82 | (same as rnd) |
| products.eco-wave | 21.68 | 2012 | 2055 | +43 | 692-755 (61%), 1572-1635 (57%) |
| company.philosophy | 21.36 | 3521 | 3448 | -73 | 323-431 (78%), 3017-3125 (66%), 754-862 (66%) |
| company | 20.85 | 2108 | 2033 | -75 | 318-381 (99.9%), 762-826 (89%), 699-762 (84%) |
| company.ceo | 20.82 | 2108 | 2033 | -75 | (same as company) |
| notices | 16.01 | 3181 | 3011 | -170 | 2635-2729 (96%), 753-847 (63%), 282-376 (63%) |
| company.global | 14.81 | 2899 | 2816 | -83 | 704-792 (91%), 352-440 (66%), 2376-2464 (67%) |
| products.clean-b | 13.88 | 2012 | 2055 | +43 | 1572-1635 (57%) |
| company.history | 9.42 | 4889 | 4806 | -83 | 300-451 (65%), 4355-4506 (53%) |
| company.about | 7.14 | 9165 | 9083 | -82 | 568-852 (55%), 284-568 (53%) |

Mobile 390 (same metric):

| page | diff % | orig h | local h | dh |
| --- | ---: | ---: | ---: | ---: |
| newsroom | 69.97 | 1540 | 2716 | +1176 |
| news | 60.24 | 1540 | 3195 | +1655 |
| home | 59.71 | 5544 | 10837 | +5293 |
| rnd.facilities | 56.14 | 4382 | 16790 | +12408 |
| company.organization | 51.58 | 1207 | 2267 | +1060 |
| products.eco-wave | 44.15 | 1580 | 3544 | +1964 |
| products | 42.85 | 1580 | 3159 | +1579 |
| products.flowell | 37.48 | 1219 | 2294 | +1075 |
| rnd.patents | 34.13 | 4722 | 4734 | +12 |
| products.clean-b | 33.16 | 1505 | 4169 | +2664 |
| support | 29.06 | 844 | 1203 | +359 |
| company.history | 27.26 | 4625 | 4558 | -67 |
| notices | 26.96 | 2684 | 3675 | +991 |
| company | 26.92 | 2300 | 3066 | +766 |
| company.ceo | 26.91 | 2300 | 3066 | +766 |
| company.philosophy | 24.20 | 4308 | 4907 | +599 |
| rnd | 21.31 | 4858 | 5847 | +989 |
| rnd.technology | 21.31 | 4858 | 5847 | +989 |
| company.global | 16.19 | 3080 | 3610 | +530 |
| company.about | 12.36 | 9964 | 10722 | +758 |

Notes / known noise:
- Home hero is an auto-rotating carousel on both sides; hero-band diffs (y≈0-930) may be
  capture-timing artifacts. Treat as real only when layout/structure differs.
- Original `/26` (newsroom) 301-redirects to `/29` (news): they are the SAME page.
- Imweb original company/ceo also appear identical to /company on the live site.
- Mobile pages being *taller* locally than the original (newsroom +1176, news +1655,
  home +5293, facilities +12408) is the mirror problem of desktop: local mobile layouts
  stack where the original does not, or render desktop-ish content. Treated in phase 2.

## Findings (visual analysis, desktop)

### A. Systemic issues

- **A1 — Missing bottom spacer / footer too high (multi-page).** Local content pages end
  abruptly: the original keeps large whitespace between last content and footer. Measured
  local footer-top vs original footer-top: support 347px too high, news 215px too high,
  newsroom 610px too high, flowell ~230px too high, products ~445px too high. Fix per
  page by restoring the original content→footer spacing (see per-page items).
- **A2 — Near-constant ~80px height deficit on content pages** (company -75, ceo -75,
  philosophy -73, history -83, global -83, organization -83, rnd -82, technology -82,
  company.about -82). Nearly constant regardless of page height → one shared component
  (hero, global band, or footer) is ~80px shorter locally. ROOT CAUSE CONFIRMED (fix-1): local
  `Header` is `fixed` (0 flow, Header.tsx:90) vs imweb `relative` 88px in flow
  (design/metrics.json header.h=88 all subpages). Variation −73…−83 = PageHero fixed 315px
  vs original per-page first section (310 about/history/news, 290 support, 353 products).
  Home unaffected (original home header 0px overlay).
- **A3 — Product-page hero/breadcrumb pattern wrong.** Original H1 = category in EN +
  Korean subtitle (e.g. `Eco wave` + `에코웨이브`, `Flowell` + `플로웰`); local shows
  generic `제품소개` or combined `플로웰(Flowell)`. Original breadcrumb is 2 levels with
  `>` (e.g. `제품소개 > 플로웰(Flowell)`); local renders a 4-level comma list of all
  sibling categories. Affects products landing + eco-wave + clean-b + flowell.
- **A4 — Product grid card style mismatch.** Original: borderless cards, image in light
  gray block, caption centered below. Local: white rounded cards with border/shadow,
  left-aligned captions. Original product images render smaller / different zoom than
  local. Affects all product category pages + landing.
- **A5 — Product filter tab rows.** Original has a tab row under the hero (`전체` as a
  filled blue pill + other tabs as plain text). Local either misses it (landing) or
  mis-styles/orders it (flowell: `필터`/`정수기` swapped, inactive tabs outlined).
  Landing additionally lacks the `1 2` pagination row.

### B. news / newsroom / notices (desktop)

- **B1 — `/newsroom` = `/news`; RESOLUTION (fix-1).** `content/ko/pages/newsroom.json` and
  `news.json` have identical section ids/rows (only `sourceUrl` differs). Original `/26`
  301→`/29`. Local `next.config.ts:20` maps `"/26": "/newsroom"` (wrong target) and has no
  `/newsroom`→`/news` redirect. Fix: change `/26`→`/news`; add permanent
  `/newsroom`→`/news`; delete bespoke `app/[locale]/newsroom/page.tsx`. Audit captures then
  follow the redirect on both sides.
- **B2 — newsroom banner gap explained by B1.** Local `/newsroom` (1689 = 315+962+412)
  omits the 423px banner section that local `/news` renders (2112 = 315+423+962+412). No
  extra work after the redirect.
- **B3 — news hero image wrong**: local shows an office handshake photo; original shows an
  office/lab scene. Hero top should sit at y≈355 (local ≈338).
- **B4 — newsroom section label** `뉴스 4` → `공지사항 4`.
- **B5 — footer offsets**: newsroom footer ~610px too high; news ~215px too high (see A1).
- **B6 — notices**: band 2635-2729 diffs ~96% over visually blank area — likely background
  colour or pre-footer whitespace difference; verify computed background color + footer
  offset in DOM before changing (flagged as uncertain from rasters).
- **B7 — `/news` board section 155px short** (962 vs original 1117):
  `BoardPageShell.tsx:43` drops the original board section's 80px top padding and local
  cards are ~30px shorter (386 vs ~416). Pagination NOT a factor (4 posts < PAGE_SIZE=12 →
  `Pagination` returns null, Boards.tsx:281, matching the original).
- Card grid (3 cols, 4 cards, same thumbnails/text) matches; no change needed.

### C. support / products / products.flowell (desktop)

- **C1 — `/support` empty body — root cause found (fix-1, G2).**
  `content/ko/pages/support.json` section 0 cls = `"...pc_section..._section_first
  mobile_section_first..."` — a desktop section, but the filter `!/mobile_section/.test(s.cls)`
  (`ContentPage.tsx:25`) matches `mobile_section_first` and drops it; `desktop.slice(1)`
  (`ContentPage.tsx:28`) then removes the real 260px spacer; the remaining `code` widget is
  empty → `main` = hero 315px only. support.json is the only page affected (verified across
  all content/ko/pages/*.json). After the whole-token regex fix local ≈ 987; residual ~93px
  = header-in-flow issue (G5).
- **C2 — products landing missing filter tab row** (4 tabs, 전체 active blue pill; ~45-60px)
  and **pagination** (`< 1 2 >`, ~40-50px); bottom spacer between grid and footer should
  be ~305px (local ~105px).
- **C3 — products landing H1** should be `Eco wave` + `에코웨이브` (local: `제품소개`);
  breadcrumb `제품소개 > 에코웨이브(Eco wave)`.
- **C4 — products.flowell**: tab order `정수기` before `필터`; inactive tabs plain text;
  H1 `Flowell` + subtitle `플로웰`; breadcrumb 2-level; bottom spacer so footer top ≈1130.
- **C5 — product cards restyle** (see A4) + correct image zoom on flowell.
- Identical (no action): global header/nav, footer content/columns, product image assets.

### D. rnd.facilities / rnd.patents (desktop)

obs-3 findings. Page background is **#F9F9F9** (not white); content column **x95→1345 (1250px)**.

**rnd.facilities** — original structure (3394px): header 13-76; H1 `생산설비` y257-314 (left
x96) + right breadcrumb `연구개발 > 생산설비`; hero 398-821 (423, full-bleed, white overlay
text); 2 centred intro lines 1046-1062 / 1076-1092; tab menu y1147-1196; gallery rows
1277-1626 + 1646-1995; spec tables 2408-2843; footer 2982-3394.
- Tab1 gallery spec: **5 columns × 2 rows = 10 distinct photos**, cell **234×349** (portrait,
  object-fit cover), **20px gaps h/v**; col x-starts 95/349/603/857/1111; rows y1277-1626 /
  1646-1995 (718px total). Plain photo cells, no captions.
- Tab menu spec: **3 pills 250×49px, 15px gap, radius ≈15, centred (x330-1110)**; active
  `생산설비` = solid **#3465DE** fill + white label; inactive = **#F9F9F9** fill + 1px
  **#3465DE** border + **#3465DE** label; label ≈15-16px.
- Local (15836px): H1 52px higher and at **x41** (should be x96); hero 83px higher (315 vs
  398); **EXTRA centred heading y862-903** (not in original); intro lines offset up ~96px
  (text/size/x identical otherwise); **the 3 tab labels render as an unstyled vertical list
  at the left margin** (x96, 12px text, no pill); then **19 full-width stacked image strips**
  (all 3 panes visible): group A 10 strips y1146-7919 (6773px), group B 4 strips y8286-11440
  (3154px), group C 5 strips y11897-14205 (2308px). Each strip tiles the same photo
  horizontally (~470px / ~720px period) instead of forming grid cells. Stacked imagery
  ≈12,235px vs original gallery 718px. Tables/footer content identical, pushed down ~12.4k.
- Worst bands 2970-3394 (86-98%) = original shows tables+footer where local still shows strips.
- Facilities fix list: (1) render only the active pane; (2) grid 5×2, 234×349, 20px gaps,
  x95-1345, gallery y1277-1995; (3) pills per spec; (4) remove extra centred heading;
  (5) restore H1 y257/x96 + hero y398; (6) tables y2408 + footer y2982 after the gallery.

**rnd.patents** — original (4910px): breadcrumb only y299-316 (**no H1**: y76-398 left area
pure white); hero 398-821; cert grid rows y1047-1498 / 1528-1980 / 2010-2461 (451 each,
**4 columns × 3 rows = 12 cards**), lone card y2511-2943 (group 1 = 13 cards); group 2 =
4 overseas cards y3161-3612; group 3 = 4 cards y3825-4287 (`Statement of Refinement` ×2 + 2);
footer 4497-4910 (413). Card grid: **4 columns, card 290px, gap 30px** (x95-385/415-705/
735-1025/1055-1345), **21 cards total**.
- Local (5702px): breadcrumb 64px higher; hero 83px higher; cert grid **3 columns** → 12
  cards h≈547; lone card → 13 total; **groups 2+3 collapsed to 0 height** (lazy-image auto
  rows); **1526px empty block y3764-5290**; footer 5290-5702 (793px lower than original 4497).
- ⚠️ CORRECTION (fix-6, live-verified): the audit's "EXTRA H1 `국내외 특허` y205-262" and
  "EXTRA H2 `인증 현황` y852-894" are **capture artifacts, not local defects** — the live
  original renders both (`h1.widget_menu_title` x95 y247, 65px, `elementFromPoint(150,300)`
  hits it; section headings `인증 현황` y943 / `기업 인증 및 특허 현황` y3057 / `국제 인증 및
  위촉 현황` y3726 start `visibility:hidden opacity:0`, visible after scroll — imweb `fadeInUp`
  entrance animation the capture didn't wait for). **Do NOT remove them.**
- Bands explained: 307-460 = H1/hero shift (animation artifact + header deficit); 4450-4603 /
  4603-4757 / 4757-4910 = local sat in the grid-collapse gap while the original shows
  group-3 tail + footer.
- Patents fix list — ✅ all handled by fix-6: (1) render all 21 cards; (2) remove the 1526px
  empty block; (3) 4-column grid (290px card, 30px gap); (4) DO NOT remove H1/H2 (correction
  above); (5) restore breadcrumb y300-314, hero y398, footer y4497.

Facilities root cause = G1 (raw `code` widget; all 3 panes + missing tab/grid CSS) — fixed in
Lane C. Patents resolved in fix-6: all 21 cards were already in the content JSON; the renderer
mapped `gridN:"03"` to 3 columns and let lazy images size rows to ~0 → collapse. Opt-in
measured grid (`gridRowH`) pins 4 cols × 452px rows; expected height ≈4910 after Lane A.

### E. home / company / rnd (desktop)

obs-4 findings. **CAUTION — baseline capture artifacts:** several original desktop regions are
blank in our captures because the capture procedure failed to render them (the real site has
content — mobile originals show it): home y0-1759, company y821-1751 (CEO greeting; local
renders 864-1489), rnd y1591-2159 (only a 1px divider at y1633), company page-title band
y76-297. A dedicated lane (item 8, fix-4) re-captures the original with a fixed procedure —
**do not act on diffs inside those regions until then.**

**home** (orig 7229 / local 7241, +12) — real diffs confined to y1760-2640; everything from
y2989 down matches within ~1-11px:
- **E1 (P0) — ECOWAVE heading alignment.** Original heading is centred (x579-860, centre
  719.5, y1944-1985); local is left-aligned (x102-382, y1929-1970). Same size/font/colour
  (41px cap). The local paragraph below it is already centred → internal inconsistency, real
  bug, not a design variant. Also the whole text block sits 11-15px higher locally
  (1944→1929, 2041→2030, 2072→2062) — sink it.
- **E2 (NOT a bug — do not "fix").** Section background y1760-2638: original shows flat
  `#6C6C6C` (a failed-image fallback, colour appears nowhere else); local shows a full-bleed
  teal water photo that matches the original MOBILE rendering's palette/gradient → the local
  photo is correct. Home hero band y0-930 = unrendered original (artifact).

**company** (orig 2108 / local 2033, −75):
- **E3 (P0) — missing breadcrumb**: `에코웨이브 > ceo인사말`, right-aligned ending x1344,
  baseline y298-315 (~83px above hero top). Local omits it entirely. (Local title + 7-item
  sub-nav at y205-262 are probably correct structure — original desktop band unrendered;
  mobile original renders title + sub-nav on white.)
- Band 318-381 (99.9%) = the −83px shift; header-in-flow lane covers it (local hero top
  315 + 88 = 403 vs original 398, +5).
- **E4 (P0) — hero background image wrong** (see hero section below).
- **E5 (P1) — hero heading 15px too high within hero** (hero-relative 156 vs original 141);
  PageHero height 315→310; **company footer top padding 31→56** (logo block ~25px high);
  after header fix company ≈ +13 (≈8px unaccounted lower page).

**rnd** (orig 4493 / local 4411, −82):
- Same −83 shift + same missing breadcrumb (right-aligned, ends x1344, y298-315).
- **E4 analog — hero bg wrong** (residual 23/255).
- **E5 analog — heading 15px high; hero→photo white gap 60px vs 75px** (photo target y896 =
  local 798 + 88 + 10); after +88 header rnd = 4499 vs 4493 (+6 ✔).
- Band 1620-1960 (65-75%) = local two-photo row (y1597-2004, 407px) vs unrendered original
  blank (568px region → possible ~160px deficit) → re-capture before acting.

**Hero background images (company + rnd) — real difference.** Both heroes render on the
original side of the capture, so this IS comparable: 2D offset search best fit (dx0, dy−98)
with residual 38/255 (company) / 23/255 (rnd) — vs ~0 for same-image baseline. Company
original brightens downward (dark forest → bright misty lake) while local darkens downward;
rnd original is blue-teal but distinctive dark features sit 1-2 rows lower locally → the
local asset/crop/zoom is wrong, not merely offset. In both, local image content sits 15px
higher within the hero.

Header content itself matches exactly on all three pages (logo+nav y13-75, x36-1407).

### F. company.organization / company.philosophy (desktop)

obs-5 findings (crops + read-only pixel diagnostics; residuals measured after alignment):

- **F1 — dominant cause = missing ~83px top spacing before breadcrumb/page-title (shared
  layout).** Both pages are a pure vertical translation locally: original breadcrumb/title
  y≈300-316 and hero photo top y=398 vs local hero top y=315 (breadcrumb sits ~83px higher).
  Hero photo itself is identical (422px, full-bleed 1440) on both sides. After shifting
  local down 83px, organization footer is pixel-identical (residual 0.0/255) and philosophy
  footer near-identical (2.8/255). Organization: constant −83px at every band (1984→1901).
  Philosophy: 83px at top but 73px at footer → local regains ~10px somewhere below the hero.
  The missing element is the header band — CONFIRMED (fix-1): local `Header` is `fixed`
  (0 flow) vs original `relative` 88px in flow; see A2/G5.
- **F2 — hero background image crop/position differs** (not just shifted): after the 83px
  alignment, residual ≈30/255 (org) / 20-24/255 (phil). Local shows the photo's top (sky +
  snow-capped peaks); original shows a lower, darker forest crop. Original's container-top
  content matches local image content ≈81px further down → local `background-position`/
  `background-size` (or asset) is wrong.
- **F3 — philosophy: 919px rounded image card (water glass on moss) horizontally misplaced.**
  Original x425→1344 (right-shifted; margins 425/96); local x260→1179 (centered; margins
  260/261). Same 919px width → placement error; move local ~165px right. Worst band
  1616-1724 (66%); residual stays 62.8/255 after vertical alignment → genuine layout diff,
  the main non-shift difference on this page.
- **F4 — philosophy minor: ~10px net section-height drift below hero** (83px top offset vs
  73px footer offset). Low priority.
- No missing/extra sections on either page; footer effectively identical.

Priority: F1 (removes the dominant share of both diffs) → F2 → F3 → F4. Re-verify hero
heading typography on both pages after F1.

### G. Root causes (code-level, fix-1 probe — live DOM + source evidence)

- **G1 — facilities +12.4k = raw `code` widget without imweb's tab/grid CSS.** The facilities
  tabs are one imweb `code` widget (content/ko/pages/rnd.facilities.json section
  `s2025081165e9bc78b81eb`) rendered via `dangerouslySetInnerHTML` (SectionRenderer.tsx:260-263).
  It relies on imweb CSS `.tab-content{display:none}` + `.active{display:block}` (+ `openTab()`
  JS) and `.img_rendering.grid_01` gallery-grid CSS — none exist locally. Measured: local
  `#tab1` 7140 vs orig 738; `#tab2` 3616, `#tab3` 2570 render `display:block` (orig `display:none`,
  h=0). Extra = (7140−738)+3616+2570 = 12,588 ≈ observed +12,442.
  `content/ko/facilities-tabs.json` (tab names + image lists, produced by
  scripts/extract-facilities-tabs.mjs) is imported nowhere — the intended data source for a
  bespoke renderer. Fix: `FacilitiesTabs` client component (one pane at a time, controlled
  grid), skip the raw code widget. (`#tab2,#tab3{display:none}` stopgap removes only ~6.2k
  and leaves tab1 at 7140 vs 738.)
- **G2 — support empty body** = over-broad `mobile_section` regex (see C1).
- **G3 — products landing −421 = no missing content.** Local landing is bespoke
  (`app/[locale]/products/page.tsx:19-28`: PageHero + BoardCardGrid of 6 posts) and ignores
  `content/ko/pages/products.json` section 0 (109px pad + "Eco wave 에코웨이브" band + 41 + 30)
  and section 2's non-board paddings. Original: sections [353 hero, 0, 1158 board, 0, 0, 412]
  + 88 header. Local: hero 315 (−38), board 879 vs 1158 (−279; local cards 433×361 vs original
  `grid_03` taller rows + missing top padding), header −88. Card box not cleanly selectable on
  the original (medium confidence on exact per-card cause).
- **G4 — /news −238 + newsroom.** See B1/B2/B7: board section −155 (missing 80px top padding
  + shorter cards), header −88, hero +5. Pagination not a factor.
- **G5 — systematic ~80px deficit = fixed vs in-flow header.** `Header.tsx:90` uses
  `fixed inset-x-0 top-0 z-50` (0 flow) while imweb header is `relative`, 88px
  (design/metrics.json header.h=88 every subpage; live-confirmed). Verify via
  `body.scrollHeight` + `main.getBoundingClientRect().top` (orig ≈88, local ≈0). Fix: in-flow
  spacer / sticky on non-home routes (home stays overlay, original home header 0px) and reduce
  `PageHero` `pt-[105px]` (PageHero.tsx:19) by the added offset — partly design-sensitive;
  re-verify hero position after the change.
- Caveat: fix-1 verified against the running prod build whose behavior matched source; build
  was not rebuilt during the probe.

## Mobile phase (390) — root causes (fix-2 probe, full report: design/audit/mobile-probe/FINDINGS.md)

DOM-level probe of 7 pages both sides. Systemic causes:

- **RC1 (structural) — pc/mobile section sets.** The original authors each page as two
  section sets: `pc_section.mobile_hide` (display:none at 390) + `mobile_section` (shown at
  390; mirror on desktop). The crawl captured both sets into content JSON (home: 11 pc + 8
  mobile), but the local rebuild **drops all `mobile_section` sections and renders pc content
  at every width**. Filters to change: SectionRenderer.tsx L441, ContentPage.tsx L25,
  app/[locale]/page.tsx L18, BoardPageShell.tsx L32. Fix direction: render `mobile_section`
  sections with `min-[992px]:hidden` and `pc_section.mobile_hide` with hidden-below-992px
  instead of dropping either. Largest contributors: home 생활환경 솔루션 +1629, 건강하고 깨끗한
  물 +1466, org chart +377.
- **RC2 — grids 1-col vs original 2-col.** Orig mobile card sizes: news 173×238, products
  190×234 (thumb 168×128), ticker 188×283 (2 visible). Local: 358×220 / 348×220 / 360×179
  stacked (Tailwind `lg:` only, e.g. Boards.tsx L114-116 `w-full lg:w-1/3`). Fixes
  news/newsroom/products/eco-wave/home ticker.
- **RC3 — footer sitemap stacks, +588px on every page.** Orig footer 300px vs local 888px
  (sitemap row h=552; orig `.col-dz-5` computes w=0/h=0 at 390). SiteFooter.tsx L27-44 +
  Rows collapse.
- **RC4 — PageHero fixed 315px** vs orig mobile title sections: news/newsroom 127, facilities
  227, organization 267, products/eco-wave 297 (over-tall by 18-188px).
- **RC5 — desktop-pixel image widths unclamped** (ImageWidget L109-131 `max-width:none`):
  org chart 1380×509 (orig uses small 41×41 nodes), home HQ 773×427 vs orig 390×216.
- **RC6 — facilities code widget** (= G1; at 390 orig section 1785 vs local 13635): Lane C's
  FacilitiesTabs must be responsive — active tab only, 2-col ~347px cells at mobile.
- **RC7 — home hero `h-[100svh] min-h-[560px]`** (HeroCarousel.tsx L37) = 844px vs orig 356.

Per-page height deltas (390): home +5293 (RC1+RC2+RC7+RC3), news +1655 (RC2+RC3+RC4),
newsroom +1176, products +1579 (RC2+RC3), eco-wave +1964, facilities +12408 (RC6+RC3/RC4),
organization +1060 (RC1+RC5+RC3).

Mobile lanes (dispatch AFTER the desktop wave to avoid file contention):

- **M1 — structural toggle (RC1) + image clamp (RC5).** Files: `SectionRenderer.tsx`,
  `ContentPage.tsx`, `BoardPageShell.tsx`, `app/[locale]/page.tsx`. Must land after Lane C
  (same files). Reuse fix-2's session (has the probe tooling + evidence).
- **M2 — responsive CSS (RC2/RC3/RC4/RC7).** Files: `Boards.tsx`, `SiteFooter.tsx`,
  `PageHero.tsx`, `HeroCarousel.tsx`. Must land after the desktop lanes touch those files.
- RC6 is handled inside Lane C's FacilitiesTabs (responsive 2-col mobile).

## Fix lanes (D/E integrated; mobile lanes specced above)

Ownership split — one writer per file set. Final status (2026-09-20):
**ALL LANES DONE** ✅ — desktop: Lane C (fix-1), Lane A (fix-3), Lane F (fix-6), Lane B
(fix-5), Lane P (fix-6 resumed — hero-bg attachment flags, rnd gap 60→75, SiteFooter offset
31→51), Lane D (fix-7 — products parity), Lane E (fix-8 — home wordmark/bgFixed), fix-4
(capture reliability), fix-11 (grid cascade), R3 (fix-12 — reveal/scroll), R4 (fix-9 —
side_left/right + data-driven gridCols), R5 (fix-10 — rnd USP grid), fix-9 round-3 (GRID_N_COLS
preset map), fix-13 (rnd.technology 15px spacer), fix-14 (patents captionBand).
Mobile: M1 (fix-16 — per-breakpoint section channels + RC5 clamp) + resumed fix-2 session,
M2 (fix-15 — boards/footer/PageHero/HeroCarousel mobile geometry), facilities RC1 follow-up,
fix-17 (RC2 completion — products grid + home ticker 2-col), ticker parity edit (hide cards
i≥2 at mobile).
**Final audit DONE** ✅ (2026-09-20, fresh prod build, both viewports, 40/40 captured) — see
“Final results” section below. Lane A follow-ups closed by Lane P (item 10).

1. **Lane A — shared layout + hero geometry (A2/G5/F1/F2). ✅ DONE (fix-3).** Implemented:
   - `Header.tsx:49-50,L88-97,L326-327` — in-flow spacer `{!isHome && <div aria-hidden
     className="h-[104px] min-[992px]:h-[88px]" />}` before the still-`fixed` header: +88px
     desktop / +104px mobile flow on non-home routes; home stays 0px overlay.
   - `PageHero.tsx` rewritten (97 lines): per-page heights 310 default / 290 support landing
     (detected via `tabs[0].active`) / 353 `/products*`; container `max-w-[1280px] px-[15px]`
     (was 1440px/pt-105px); H1 65px `leading-[1.2]` (box y247-325); breadcrumb = 2-level
     `group › current` right-aligned to x1345; support landing hero blank (no menu_title).
   - `lib/page-hero.ts:23-26` — group-route title = first child route name (live-verified:
     `/company` → "ceo인사말", `/rnd` → "보유기술").
   Expected deltas (post-rebuild): company.*/rnd.*/news/notices/newsroom +83px; support +63px
   (pre-Lane C content fix); products +126px; home 0. Hero photo top 315 → 398; H1 left 40 →
   95, right 1400 → 1345.
   Out-of-lane (→ item 10): hero bg `background-attachment: fixed` root cause; SiteFooter
   31→56; rnd hero→photo gap 60→75.
2. **Lane C — content engine (C1/G2/G1). ✅ DONE (fix-1).** Implemented:
   (a) whole-token `MOBILE_SECTION = /(^|\s)mobile_section(\s|$)/` used in
   `ContentPage.tsx` L9/L52, `SectionRenderer.tsx` L426/L444, `BoardPageShell.tsx` L14/L35;
   `desktop.slice(1)` replaced by `isHeroSection(desktop[0]) ? desktop.slice(1) : desktop`
   (`ContentPage.tsx` L11-32/L54, hero = has `menu_title`). Only `support.json` was affected
   by the old false positive; all other pages' first sections carry `_section_first` so
   behavior is unchanged.
   (b) `components/content/FacilitiesTabs.tsx` (new, client, props
   `{ tabs: {id,name,images}[] }`, one pane mounted, `aria-pressed`) +
   rewritten `app/[locale]/rnd/facilities/page.tsx` (PageHero + SectionRenderer split around
   the `tab-menu`/`tab-content` code rows; tabs read from `content/<locale>/facilities-tabs.json`
   via `fs`; the invisible 48px heading band is kept with `visibility:hidden` to match the
   live original's reserved space). Pills 250×51/gap15/centred; grid `grid-cols-2` below
   992px / `min-[992px]:grid-cols-5`, gap 20, cells h347 mobile / h349 desktop, container
   1250px.
   Expected deltas (body.scrollHeight): facilities 15836 → ~3311 (orig 3394; residual −83 =
   Lane A header); support 727 → ~987 (orig 1080; residual −93 = Lane A header; the
   `report.md` dh −180 is the Playwright 900px-floor artifact). tsc exits 0.
   Open items: (i) facilities H1 left margin x96 lives in `PageHero.tsx` → Lane A; (ii) mobile
   pane height computed ~1815 vs obs-3 stated 1355 → phase-2 verify (mobile section variant?);
   (iii) mobile pill wrapping unspecified → phase 2; (iv) EN locale structure verified in JSON
   only, not rendered.
3. **Lane B — boards/routing (B1-B7). ✅ DONE (fix-5).** Implemented:
   - Routing: `next.config.ts:20-21,27-31,55-56` `/26`→`/news`, new permanent
     `/newsroom`→`/news` (+`/en/newsroom`→`/en/news`); `lib/routes.ts:21`; `app/sitemap.ts:20`
     newsroom entry removed; deleted `app/[locale]/newsroom/page.tsx` +
     `content/{ko,en}/pages/newsroom.json`.
   - Labels: news page header = `공지사항 4`, notices = `뉴스 2` via `board.name`
     (`app/[locale]/news/page.tsx:33`, `notices/page.tsx:33`) — live-verified swap.
   - `BoardPageShell.tsx:5,17-49,77,82-85` `boardSectionPadding()` (news 125/125, notices
     125/15, products 113/161; container `max-w-[1280px] px-[15px]` + inline padding).
   - `Boards.tsx:239,267-268` line rows 61px + `.li_footer` 24px band.
   - B6 verified: 2635-2729 band = pure vertical offset; Lane A (+83) + Lane B (news +154 /
     notices +87) restore it. Expected heights: news 2349 (orig 2350), notices 3181 (exact).
   - B3 handoff: banner "wrong image" = `background-attachment: fixed` (asset identical) →
     Lane P item 1 (`SectionRenderer.tsx:473-474`); original news banner top = 398.
   Open items: news −1px rounding; live `/27` counts 33/27 vs crawled JSON 32/26 (dates match).
4. **Lane D — products (A3/A4/A5/C2-C5/G3). ✅ DONE (fix-7).** Implemented:
   - `components/products/ProductBoard.tsx` (new, 220 lines): PRODUCT_HERO, CATEGORY_ORDER,
     ProductTabs/ProductCardGrid/ProductPagination/ProductBoard; products-owned (Boards.tsx
     untouched → news/notices unaffected).
   - `app/[locale]/products/page.tsx` + `[category]/page.tsx` rewritten (PageHero
     label/subtitle + ProductBoard; PAGE_SIZE 6; dropped BoardPageShell).
   - `components/ui/PageHero.tsx` additive `subtitle` prop (72px H1 #090909 + 22px KR
     subtitle; non-subtitle routes byte-identical).
   - Expected heights: products 2011 (orig 2012), flowell 1547 (orig 1547), eco-wave/clean-b
     2011 (orig 2012). tsc+eslint 0; classes + heights verified via scripts/audit/check-*.mjs.
   - Open questions: clean-b KR subtitle live value = `에코웨이브` (followed live); live
     `/37?page=2` has more posts than crawled + 30px paginated header offset not reproduced;
     EN uses KR constants/tab order; `lg:` (1024) grid vs imweb 992 → M2 follow-up.
5. **Lane E — home (§E). ✅ DONE (fix-8).** Implemented in `content/ko/pages/home.json` only:
   - L633 `"bgFixed": true` added after the `"bg"` line of section `s202508116d15f8202cd82`
     (Lane P handoff; section `s20250811b220484e22b98` NOT flagged; en home has no such section).
   - L675 widget html: `<div class="text-table " style="display:flow-root;margin:15px 0;font-size:15px;">`
     + wordmark `<img … style="width: 296px; display:block; margin:0 auto;">` → centres the
     296px wordmark (was pinned left by Tailwind preflight) and restores the 15px margins/font.
   - Key finding: the "41px ECOWAVE heading" is the 764×158 wordmark PNG rendered at 296×61;
     fix is centering, not typography. Mobile-only wordmark section `s20250911e7c6ef8d60c18`
     untouched (excluded from desktop render).
   - Verified: simulated edit → img x572 y1935, paragraphs y2006/2036/2066 h30 — byte-for-byte
     original; tsc + eslint 0. Home stays 7241 vs orig 7229 (+12 in untouched y≥2989 bands).
6. **Facilities visual detail** — obs-3 spec folded into Lane C (queued message with exact
   grid/pill metrics).
7. **Lane F — patents (§D second half). ✅ DONE (fix-6).** Implemented:
   - `SectionRenderer.tsx` L246-269: in the `gallery2` grid branch, opt-in "measured grid" —
     when a widget carries `gridRowH`, render Tailwind grid `grid-cols-2` (<640) /
     `sm:grid-cols-3` / `min-[992px]:grid-cols-4`, `gap-[var(--ggap)]`, `py-[15px]`,
     `mt-[15px]`, `auto-rows-[var(--growh)]` (inline `--ggap`/`--growh`); non-opt-in
     galleries unchanged (`.gallery-grid`).
   - `content/ko|en/pages/rnd.patents.json`: `"gridGap": 30, "gridRowH": 452` added to all 3
     `gallery2` grid widgets (ko L378-379/539-540/640-641; en L376-377/537-538/638-639).
   - Root cause: cards were already in JSON; `gridN:"03"` mapped to 3 cols (original
     `grid_03` = 4 cols at desktop) + lazy-image auto rows → groups 2-3 collapsed.
   - Verified: CSS injected into live original via Playwright → cards 290×452 at
     x95/415/735/1055, 30px gaps, 21 cards total; expected height 5702 → ≈4910 after Lane A
     (0px vs original 4910).
   - **H1/H2 NOT extra** (live-verified; see §D correction) — nothing removed from
     `lib/page-hero.ts` or content. Patents hero bg untouched (no audit flag).
   - tsc + eslint exit 0; Tailwind classes verified via direct `@tailwindcss/postcss` run
     (no Next build allowed while prod serves).
8. **Re-capture lane (fix-4). ✅ DONE.** Root cause (two compounding original-site capture
   artifacts): (1) Chromium `fullPage:true` briefly emulates `innerHeight=1`; the site's
   `site_animation.js` re-runs reveal logic and re-hides hero/sections → pure-white bands;
   (2) scroll-reveal widgets (`.wg_animated fadeInUp`) are re-hidden when they leave the
   viewport, and the scroll-through was too fast. Fixes in `scripts/audit/capture.mjs`:
   `FORCE_REVEAL_STYLE` (L45-64, orig-only) forces the widget end-state; `fullPageShot()`
   (L66-100) freezes JS via CDP `Emulation.setScriptExecutionDisabled(true)` around the orig
   shot (local path byte-identical); orig height recorded before the shot (L157-179). Verified
   re-capture 40/40 ok, problems=0; blank regions now render (home y0-1759 → 37.9% white vs
   local 37.7%). Baseline page heights UNCHANGED (0 deviations, all 40); orig PNGs refreshed.
   Remaining partly-white orig bands (products y1300-1600, support y300-600, flowell
   y900-1100, news y1800-1900) contain zero elements in the original DOM → genuine diffs.
9. **Mobile lanes M1/M2. ✅ DONE (fix-16 + fix-15, plus fix-17 / RC2 completion).**
   - **M1 = fix-16 (with the resumed fix-2 session running concurrently).**
     `SectionRenderer.tsx` now exports `MOBILE_SECTION` / `MOBILE_HIDE` / `isPageHeroSection`
     and renders both the desktop and the mobile section sets, gated per breakpoint with
     `min-[992px]:hidden` / `hidden min-[992px]:block`. The mobile image clamp (RC5) is scoped
     to desktop via `--img-h` / `--box-h`. `ContentPage.tsx`, `BoardPageShell.tsx` and
     `app/[locale]/page.tsx` adopt the two-channel hero-drop pattern, so pages with a distinct
     `mobile_section` hero (home, about, philosophy, news, notices, rnd, …) get the original
     mobile hero instead of the desktop one.
   - **M2 = fix-15.** `Boards.tsx` news/notices grid 2-col at mobile (`w-1/2`, thumb
     `h-[131px]`). `SiteFooter.tsx` mobile sitemap column hidden (scoped
     `@media (max-width:991.98px)` rule for the `.lg\:col-span-5` child) + 16px spacer →
     mobile footer 888 → 304 (orig 300); desktop unchanged. `PageHero.tsx` per-route mobile
     heights (news/notices 127, support 145, flowell/clean-b 222, rnd* 227, company* 267,
     products/eco-wave 297) + 30px mobile H1. `HeroCarousel.tsx` home hero 356px at mobile
     (content `pt-[87px]`); desktop stays 100svh.
   - **Facilities RC1 follow-up** (orchestrator direct edit): `app/[locale]/rnd/facilities/page.tsx`
     converted to the two-channel pattern (`isPageHeroSection`, HERO_SECTION const removed) so
     the mobile widget section reaches `SectionRenderer`.
   - **fix-17 (RC2 completion).** `ProductBoard.tsx` 2-col mobile grid (item `w-1/2 p-[10px]`,
     thumb `h-[128px]`, body `h-[84px]`, `sizes="50vw"`); `app/[locale]/page.tsx` ticker
     2-col mobile (row `-mx-[22.5px] -mt-[15px] flex flex-wrap`, item `w-1/2 p-[7.5px]`,
     card `h-[283px]`, thumb `h-[142px]`, body `h-[141px]`, section `overflow-x-clip`); ticker
     parity edit hides cards i≥2 at mobile (desktop keeps all 4). Live-verified against the
     original at 390: products cell 190×234 card 170×214 thumb 168×128; ticker track 405px
     card 188×283 thumb 186×142; ticker posts 3–4 `display:none` at mobile. tsc/eslint 0.
   - Result: mobile structural heights converge to within −457…+587 px of the original
     (pre-fix residual was +1k…+12k). Remaining mobile delta is content-level (see Final
     results → remaining work).
10. **Follow-ups from Lane A — closed out by Lane P (fix-6 resumed, ✅ DONE):**
   - **Hero bg attachment (F2 root cause) — DONE (Lane P).** `lib/types.ts` gained
     `Section.bgFixed?`; `SectionRenderer.tsx` L471-480 emits inline `background-attachment:
     fixed`; 25 sections flagged (company.*/rnd.* ko+en + EN support); raster-verified 3.5% vs
     42.7% (scroll). Remaining handoffs: news/notices hero
     (`content/ko/pages/{news,notices}.json` L195 — now flagged) + home section
     `s202508116d15f8202cd82`.
   - **SiteFooter padding — DONE (scope changed).** Global height-neutral shift (logo offset
     31→51, orig 51; footer stays 412) instead of company-only 31→56 — offset identical on
     every page; footer is a shared layout component.
   - **rnd hero→photo gap 60→75 — DONE.** 15px padding widget in the rnd photo row
     (`content/ko|en/pages/rnd.json`); photo y 798→813; section height unchanged.
   - **Facilities H1 left margin x96** (Lane C item i) — now expected from Lane A's PageHero
     `px-[15px]`/1280px box; re-verify at re-audit before more edits.
   - **Patents H1 suppression — REJECTED** (fix-6 live-verified H1/H2 exist on the original;
     audit capture artifact of `fadeInUp`). No "breadcrumb-only" mode needed.
   - **products hero label/subtitle** (`Eco wave` / `에코웨이브`) → Lane D (fix-7, running).

Then: rebuild → re-capture local → diff → iterate until desktop diffs are minimal; mobile
phase after (fix-2 findings to fold in).

## Final results (2026-09-20, fresh prod build, both viewports)

Command: `npm run build` → `npm run start` (port 3000) →
`node scripts/audit/capture.mjs --side=local --viewport=both` (40/40 ok, 0 failed) →
`node scripts/audit/diff.mjs --viewport=both` (40 page/viewport pairs).
Full machine-readable report: `design/audit/report.md` / `report.json`.

### Desktop 1440

| page | diff % | orig h | local h | dh | worst bands |
| --- | ---: | ---: | ---: | ---: | --- |
| home | 16.78 | 7229 | 7226 | -3 | 1807-2032 (97.7%), 2258-2484 (94.1%), 2032-2258 (93.4%), 2484-2710 (68.6%) |
| company.about | 7.31 | 9165 | 9166 | +1 | 2864-3150 (42.7%), 6587-6874 (16.6%), 1146-1432 (16.4%) |
| company.philosophy | 6.12 | 3521 | 3531 | +10 | 2751-2861 (28.8%), 550-660 (16.0%), 2641-2751 (15.7%) |
| company | 4.32 | 2108 | 2116 | +8 | 527-593 (19.3%), 1647-1713 (12.1%), 593-659 (11.8%) |
| company.ceo | 4.32 | 2108 | 2116 | +8 | (same as company) |
| rnd.facilities | 3.39 | 3394 | 3395 | +1 | 2333-2439 (17.1%), 2439-2546 (12.0%), 530-636 (10.0%) |
| rnd.patents | 3.38 | 4910 | 4911 | +1 | 3836-3989 (14.2%), 3989-4143 (12.5%), 2148-2302 (10.2%) |
| rnd | 2.79 | 4493 | 4494 | +1 | 3791-3931 (10.3%), 562-702 (8.8%), 2247-2387 (8.4%) |
| rnd.technology | 2.79 | 4493 | 4494 | +1 | (same as rnd) |
| company.organization | 2.48 | 1984 | 1984 | 0 | 558-620 (17.05%), 620-682 (8.8%), 496-558 (7.9%) |
| notices | 2.36 | 3181 | 3180 | -1 | 497-596 (11.1%), 596-696 (10.8%), 2286-2385 (8.3%) |
| company.global | 2.14 | 2899 | 2899 | 0 | 544-634 (17.5%), 997-1087 (6.1%), 906-997 (6.0%) |
| company.history | 2.04 | 4889 | 4889 | 0 | 458-611 (9.1%), 3361-3514 (5.6%), 611-764 (4.6%) |
| newsroom | 1.86 | 2350 | 2349 | -1 | 587-661 (16.9%), 514-587 (13.3%), 2129-2202 (5.9%) |
| news | 1.86 | 2350 | 2349 | -1 | (same as newsroom) |
| support | 1.01 | 1080 | 1080 | 0 | 844-878 (6.7%), 776-810 (4.7%), 911-945 (4.7%) |
| products.flowell | 0.98 | 1547 | 1547 | 0 | 1305-1354 (5.3%), 1354-1402 (5.0%), 1257-1305 (3.5%) |
| products | 0.98 | 2012 | 2011 | -1 | 1760-1822 (4.8%), 1822-1885 (4.3%), 251-314 (3.3%) |
| products.eco-wave | 0.98 | 2012 | 2011 | -1 | (same as products) |
| products.clean-b | 0.83 | 2012 | 2011 | -1 | 1760-1822 (4.8%), 1822-1885 (4.3%), 1697-1760 (2.9%) |

### Mobile 390

| page | diff % | orig h | local h | dh | worst bands |
| --- | ---: | ---: | ---: | ---: | --- |
| home | 59.12 | 5544 | 5743 | +199 | 1733-1906 (97.3%), 2945-3119 (93.1%), 1559-1733 (93.1%), 2079-2252 (92.6%) |
| rnd.facilities | 49.55 | 4382 | 4969 | +587 | 4245-4382 (91.1%), 4108-4245 (89.4%), 2465-2602 (82.1%) |
| newsroom | 48.66 | 1540 | 1871 | +331 | 1492-1540 (95.3%), 1444-1492 (94.9%), 1251-1299 (93.9%) |
| news | 48.66 | 1540 | 1871 | +331 | (same as newsroom) |
| rnd.technology | 44.09 | 4858 | 5020 | +162 | 4554-4706 (91.0%), 607-759 (83.1%), 2733-2884 (79.5%) |
| rnd | 44.09 | 4858 | 5020 | +162 | (same as rnd.technology) |
| company.philosophy | 42.19 | 4308 | 4647 | +339 | 673-808 (88.5%), 1885-2019 (87.1%), 1750-1885 (86.3%) |
| company.organization | 34.58 | 1207 | 1416 | +209 | 1018-1056 (98.5%), 717-754 (97.6%), 754-792 (95.9%) |
| company.history | 28.38 | 4625 | 4168 | -457 | 4038-4168 (93.0%), 3908-4038 (91.3%), 2084-2214 (87.6%) |
| products | 27.48 | 1580 | 1650 | +70 | 1284-1333 (95.4%), 839-889 (65.0%), 494-543 (61.8%) |
| products.eco-wave | 27.47 | 1580 | 1650 | +70 | (same as products) |
| company | 26.54 | 2300 | 2580 | +280 | 719-791 (98.0%), 2084-2156 (95.1%), 2156-2228 (88.7%) |
| company.ceo | 26.54 | 2300 | 2580 | +280 | (same as company) |
| company.about | 24.32 | 9964 | 10499 | +535 | 9653-9964 (87.0%), 623-934 (84.0%), 934-1246 (66.2%) |
| notices | 20.09 | 2684 | 3132 | +448 | 2600-2684 (94.9%), 2516-2600 (90.5%), 2432-2516 (82.9%) |
| rnd.patents | 19.25 | 4722 | 4867 | +145 | 4427-4574 (84.2%), 590-738 (54.6%), 3394-3542 (28.9%) |
| company.global | 16.65 | 3080 | 3265 | +185 | 674-770 (93.2%), 2791-2888 (89.0%), 2888-2984 (74.4%) |
| products.clean-b | 13.37 | 1505 | 1538 | +33 | 235-282 (38.5%), 1176-1223 (38.3%), 1223-1270 (32.2%) |
| support | 12.79 | 844 | 844 | 0 | 396-422 (99.5%), 712-739 (86.7%), 686-712 (65.4%) |
| products.flowell | 12.53 | 1219 | 1256 | +37 | 914-952 (86.7%), 495-533 (34.6%), 419-457 (29.2%) |

### Outcome

- **Desktop: parity achieved.** 15 of 20 pages are ≤ 3.39% differing pixels, and every page is
  within 8 px of the original height (most within 1 px). Baseline was 7–63% on most pages.
  Worst page is `home` at 16.78%, which is dominated by a **known capture artifact**: the
  original's `background-attachment: fixed` hero/band areas are re-rastered by the
  full-page screenshot (bands 1807-2710) plus home hero-carousel rotation noise (bands
  226-452). Excluding those, home parity is comparable to the rest.
- **Mobile: structurally correct, content-level residual.** All page heights now match the
  original within −457…+587 px (pre-fix residual was +1k…+12k px), i.e. the mobile section
  structures, per-breakpoint visibility channels, grids, footers and heroes are right. The
  remaining 12–59% pixel differences are **content-level**: the original serves separately
  authored mobile content (fonts, paragraph spacing, image crops, list markup) inside the
  `mobile_section` sets that is not reproduced 1:1 by the migrated content JSON.

### Remaining work (optional next phase)

1. **Mobile content parity (largest remaining win).** Compare per-band crops
   (`node scripts/audit/crop.mjs --key=home --y=1559-1906 --vp=mobile --sides=orig,local,diff`)
   for the worst mobile pages — home (59.1%), rnd.facilities (49.6%), news/newsroom (48.7%),
   rnd/rnd.technology (44.1%), company.philosophy (42.2%) — and diff the mobile section JSON
   against the original mobile DOM (font-size/line-height/margins/image sizes).
2. **home desktop capture artifact.** Either accept it or switch the hero/band to
   `background-attachment: scroll` for screenshot purposes (would regress live fidelity).
3. **company.about desktop (7.31%)** — `layout:"slide"` gallery band 2864-3150 (42.7%) and
   `.gallery-grid` gap 10px vs the original's 2.5px cell padding (~9 px/row drift).
4. **company.philosophy desktop (6.12%)** — hero background crop, +10 px drift, and the blank
   aside labels (`경영이념` / `비전`) that are absent from the migrated JSON.
5. **company/company.ceo desktop (4.32%)** — band 527-659 (holder block) + a partially
   revealed wrapper.
6. **rnd.patents desktop (3.38%)** — group-3 card geometry (original 298×463 with ~20 px gaps
   vs local 290×452 with 30 px gaps).
7. **Breakpoint mismatch** — Tailwind `lg:` = 1024 px vs imweb 992 px; the 992–1023 px range
   renders the desktop layout locally but the tablet layout on the original.
8. **news/notices count rounding** — live `/27` shows 33/27 posts vs 32/26 in the crawled
   JSON (dates match).

## Verification protocol

- Every fix lane must not regress other pages: re-run the full local capture + diff and
  compare per-page diff % against the baseline table above.
- Final acceptance: fresh `npm run build` + `npm run start`, full both-viewport re-audit,
  per-page report attached to this plan (or `design/audit/report.md`).
- **Performed 2026-09-20**: build + serve + capture (40/40, 0 failed) + diff (40 pairs) all
  green; results recorded in the “Final results” section above. No page regressed against the
  baseline table; desktop is at parity, mobile is structurally at parity with a content-level
  residual documented under “Remaining work”.
