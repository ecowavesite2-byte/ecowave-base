/**
 * Generate `lib/content/registry.ts` from the crawled content JSON.
 *
 * The JSON under `content/` stays the code-side source of truth (the default
 * values); the future Postgres `page_content` table stores only overrides. This
 * script walks the crawled pages/boards/site files and emits a deterministic,
 * hand-tunable registry describing every overridable field.
 *
 * Re-runnable: same input → byte-identical output (`npm run content:registry`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_ROOT = process.env.CONTENT_ROOT ?? path.join(ROOT, "content");
const OUT_FILE = path.join(ROOT, "lib", "content", "registry.ts");

const LOCALES = ["ko", "en"];
const PRIMARY = "ko"; // authoritative structure; EN is matched structurally.

/** Mirrors lib/routes.ts (kept local so the script stays TS-free). */
const PAGE_KEY_TO_ROUTE = {
  home: "/",
  company: "/company",
  "company.ceo": "/company/ceo",
  "company.about": "/company/about",
  "company.philosophy": "/company/philosophy",
  "company.history": "/company/history",
  "company.organization": "/company/organization",
  "company.global": "/company/global",
  rnd: "/rnd",
  "rnd.technology": "/rnd/technology",
  "rnd.patents": "/rnd/patents",
  "rnd.facilities": "/rnd/facilities",
  news: "/news",
  notices: "/notices",
  support: "/support",
};

const LABELS = {
  text: { ko: "텍스트 블록", en: "Text block" },
  imageSrc: { ko: "이미지 경로", en: "Image source" },
  imageAlt: { ko: "이미지 대체 텍스트", en: "Image alt text" },
  imageOverlay: { ko: "카드 제목/라벨", en: "Card title/label" },
  locationCards: { ko: "위치 카드 목록", en: "Location cards" },
  tickerPicks: { ko: "표시할 게시글", en: "Posts to show" },
  galleryItem: { ko: "갤러리 항목", en: "Gallery item" },
  itemTitle: { ko: "제목", en: "Title" },
  itemDesc: { ko: "설명", en: "Description" },
  itemOrg: { ko: "원본 이미지", en: "Original image" },
  itemThumb: { ko: "썸네일", en: "Thumbnail" },
  buttonText: { ko: "버튼 텍스트", en: "Button text" },
  buttonHref: { ko: "버튼 링크", en: "Button link" },
  imageHref: { ko: "이미지 링크", en: "Image link" },
  videoSrc: { ko: "동영상 URL", en: "Video URL" },
  codeBlock: { ko: "코드 블록", en: "Code block" },
  heroSlides: { ko: "메인 비주얼 슬라이드", en: "Main visual slides" },
  menuTitle: { ko: "메뉴 제목", en: "Menu title" },
  navLabel: { ko: "내비게이션 라벨", en: "Nav label" },
  navSubLabel: { ko: "하위 내비게이션 라벨", en: "Nav sub-label" },
  boardName: { ko: "게시판 이름", en: "Board name" },
  boardPosts: { ko: "게시글 목록", en: "Board posts" },
};

const MAX_LENGTH = {
  text: 500,
  textarea: 20000,
  lines: 20000,
  image: 2000,
  url: 2000,
  list: 20000,
  slides: 20000,
  overlay: 5000,
  cards: 20000,
  picks: 2000,
};

/** Kinds emitted into `lib/content/registry.ts` (order = CONTENT_KINDS). */
const KINDS = ["text", "textarea", "lines", "image", "url", "list", "slides", "overlay", "cards", "picks"];

/**
 * Sections the public renderers strip, so the admin must not expose their
 * fields (an override there would be a silent no-op):
 *  - the black footer band — every page shell drops its own copy and
 *    `components/layout/SiteFooter.tsx` renders the HOME page's copy on every
 *    route, so only `home`'s footer defs are live;
 *  - the leading page-title hero band of each channel — rebuilt as <PageHero>
 *    from the nav labels (site#nav/…), which are the real source.
 * Mirrors lib/page-hero.ts (`isFooterSection`, FOOTER_SECTION_ID) and
 * components/content/SectionRenderer.tsx (`MOBILE_SECTION`, `PAGE_HERO`,
 * `isPageHeroSection`).
 */
const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";
const MOBILE_SECTION = /(^|\s)mobile_section(\s|$)/;
const PAGE_HERO = /(^|\s)(_section_first|mobile_section_first)(\s|$)/;

/** true when the section is the black footer band (contains the copyright line) */
function isFooterSection(section) {
  let found = false;
  (function walk(rows) {
    for (const r of rows ?? []) {
      if (r.kind === "widget" && r.type === "text" && /Copyright/i.test(r.html || "")) found = true;
      if (r.kind === "row") for (const c of r.cols ?? []) walk(c.children);
    }
  })(section.rows);
  return found;
}

function hasMenuTitle(section) {
  return sectionWidgets(section).some((w) => w.type === "menu_title");
}

function isPageHeroSection(section) {
  return PAGE_HERO.test(section.cls || "") || hasMenuTitle(section);
}

/**
 * Curated section names for crawl ids whose auto-derived name would be poor or
 * missing. Keyed by section id; falls back to content-derived names.
 */
const TICKER_SECTION_ID = "s2025081139ff276cae8d6";
const LOCATIONS_SECTION_ID = "s202508112787439deffdb";
/** The mobile back-to-top overlay is chrome, not content (image href sentinel). */
const BACK_TO_TOP_HREF = "#doz_header";
const SECTION_NAME_OVERRIDES = {
  [FOOTER_SECTION_ID]: { ko: "푸터", en: "Footer" },
  [TICKER_SECTION_ID]: { ko: "공지사항 티커", en: "Notice ticker" },
};

/** Breakpoint tag so PC/mobile variants of the same block are distinguishable. */
function breakpointOf(section) {
  if (MOBILE_SECTION.test(section.cls || "")) return "mobile";
  if (/(^|\s)pc_section(\s|$)/.test(section.cls || "")) return "pc";
  return null;
}

/**
 * Content-derived section name for one locale: first visible text, then menu
 * title, then image alt/file, then a type-based fallback. `null` when the
 * section carries no nameable content (e.g. spacers only).
 */
function autoSectionName(section, locale) {
  if (Array.isArray(section.visual) && section.visual.length > 0) {
    return locale === "en" ? "Main visual" : "메인 비주얼";
  }
  const widgets = sectionWidgets(section);
  const text = widgets.find((w) => w.type === "text" && stripTags(w.html));
  if (text) return truncate(stripTags(text.html), 34);
  const menu = widgets.find((w) => w.type === "menu_title" && w.text);
  if (menu) return truncate(menu.text, 34);
  const image = widgets.find((w) => w.type === "image" && (w.alt || w.src));
  if (image) return truncate(image.alt || basename(image.src), 34);
  const types = new Set(widgets.map((w) => w.type));
  if (types.has("gallery2")) return locale === "en" ? "Gallery" : "갤러리";
  if (types.has("video")) return locale === "en" ? "Video" : "동영상";
  if (types.has("newest")) return locale === "en" ? "Latest posts" : "게시판 최신글";
  if (types.has("code")) return locale === "en" ? "Code block" : "코드 블록";
  if (types.has("form")) return locale === "en" ? "Inquiry form" : "문의 폼";
  if (types.has("board")) return locale === "en" ? "Board" : "게시판";
  return null;
}

/** Per-section registry name (`section` field), breakpoint-tagged. */
function sectionNameFor(koSection, enSection, pageSection) {
  const override = SECTION_NAME_OVERRIDES[koSection.id];
  const baseKo = override?.ko ?? autoSectionName(koSection, "ko") ?? pageSection.ko;
  const baseEn =
    override?.en ??
    (enSection ? autoSectionName(enSection, "en") ?? baseKo : baseKo);
  const bp = breakpointOf(koSection);
  const prefix =
    bp === "mobile"
      ? { ko: "모바일 · ", en: "Mobile · " }
      : bp === "pc"
        ? { ko: "PC · ", en: "PC · " }
        : { ko: "", en: "" };
  return { ko: prefix.ko + baseKo, en: prefix.en + baseEn };
}

/**
 * Append ` (2)`, ` (3)` … to sections that would otherwise share one label
 * within a page (e.g. two PC-only code blocks), so every admin accordion is
 * distinguishable. Order follows document order (first keeps the plain name).
 */
function disambiguateSectionNames(list) {
  const groups = new Map();
  for (const def of list) {
    const sk = `${def.pageKey}#${def.sectionId}`;
    let group = groups.get(sk);
    if (!group) {
      group = { pageKey: def.pageKey, label: def.section, defs: [] };
      groups.set(sk, group);
    }
    group.defs.push(def);
  }

  const byPage = new Map();
  for (const group of groups.values()) {
    let labels = byPage.get(group.pageKey);
    if (!labels) {
      labels = new Map();
      byPage.set(group.pageKey, labels);
    }
    const labelKey = `${group.label.ko}\u0000${group.label.en}`;
    const bucket = labels.get(labelKey) ?? [];
    bucket.push(group);
    labels.set(labelKey, bucket);
  }

  for (const labels of byPage.values()) {
    for (const bucket of labels.values()) {
      if (bucket.length < 2) continue;
      bucket.forEach((group, index) => {
        if (index === 0) return;
        const suffix = ` (${index + 1})`;
        for (const def of group.defs) {
          def.section = { ko: def.section.ko + suffix, en: def.section.en + suffix };
        }
      });
    }
  }
}

/** Section ids of `page` that no route renders (see the block comment above). */
function deadSectionIds(page) {
  const sections = page.sections ?? [];
  const dead = new Set();
  for (const s of sections) {
    if (isFooterSection(s) || s.id === FOOTER_SECTION_ID) dead.add(s.id);
  }
  const live = sections.filter((s) => !dead.has(s.id));
  const firstPc = live.find((s) => !MOBILE_SECTION.test(s.cls || ""));
  const firstMobile = live.find((s) => MOBILE_SECTION.test(s.cls || ""));
  if (firstPc && isPageHeroSection(firstPc)) dead.add(firstPc.id);
  if (firstMobile && isPageHeroSection(firstMobile)) dead.add(firstMobile.id);
  return dead;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Rows → cols → children, widget order; mirrors app/admin/_lib/tree.ts. */
function collectWidgets(nodes, out) {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (node.kind === "widget") {
      out.push(node);
    } else if (node.kind === "col") {
      collectWidgets(node.children ?? [], out);
    } else if (node.kind === "row") {
      for (const col of node.cols ?? []) collectWidgets(col.children ?? [], out);
    }
  }
}

function sectionWidgets(section) {
  const out = [];
  collectWidgets(section.rows ?? [], out);
  if (section.aside) collectWidgets(section.aside.items ?? [], out);
  return out;
}

function stripTags(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Plain-text runs of an html string — MIRROR of `extractTextRuns` in
 * `lib/content/text-runs.ts`. This script is plain .mjs so the tokenizer is
 * duplicated; `lib/content/__tests__/registry-tokenizer.test.ts` asserts parity
 * on crawled fixtures so the two can never silently drift.
 */
export function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function textRuns(html) {
  const out = [];
  const parts = String(html ?? "").split(/(<[^>]*>)/g);
  for (let i = 0; i < parts.length; i += 2) {
    const text = decodeEntities(parts[i]).replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * Per-run font sizes (px), inferred from the nearest preceding `font-size: Npx`
 * tag — MIRROR of `extractRunSizes` in `lib/content/text-runs.ts` (same drift
 * guard as `textRuns`). `0` marks an unknown size. Used to split hero slides
 * into big title copy and small subtitle copy.
 */
export function extractRunSizes(html) {
  const parts = String(html ?? "").split(/(<[^>]*>)/g);
  let current = 0;
  const sizes = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 1) {
      const match = /font-size\s*:\s*([\d.]+)px/i.exec(parts[i]);
      if (match) current = parseFloat(match[1]);
    } else if (decodeEntities(parts[i]).replace(/\s+/g, " ").trim().length > 0) {
      sizes.push(current);
    }
  }
  return sizes;
}

function truncate(value, max) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

function basename(src) {
  const clean = String(src ?? "").split(/[?#]/)[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

/**
 * Vision images store their overlay CARD MARKUP in `alt` (an `img-title` block
 * with an `<h5>` label) rather than a plain alt string. Such a widget gets an
 * `overlay` def (raw markup assigned verbatim) instead of a normal alt def.
 */
function isOverlayAlt(alt) {
  return (
    typeof alt === "string" && (alt.includes("img-title") || /<h5[\s>]/i.test(alt))
  );
}

/** The `<h5>` label of an overlay alt, or `""` when absent. */
function overlayTitle(alt) {
  const match = /<h5[^>]*>([\s\S]*?)<\/h5>/i.exec(String(alt ?? ""));
  return match ? stripTags(match[1]) : "";
}

/** Hero-slide title runs are the big type (font-size >= 40px); the rest is subtitle. */
const SLIDE_TITLE_MIN_PX = 40;

/**
 * Split a slide's plain-text runs into `{ title, subtitle }` using the mirrored
 * run-size classifier (`extractRunSizes`): title = runs with font-size >= 40px,
 * subtitle = the remaining runs. Both keep document order, joined with `\n`
 * (the `applySlideText` contract in lib/content/merge.ts).
 */
function splitSlideRuns(html) {
  const runs = textRuns(html);
  const sizes = extractRunSizes(html);
  const title = [];
  const subtitle = [];
  runs.forEach((run, index) => {
    ((sizes[index] ?? 0) >= SLIDE_TITLE_MIN_PX ? title : subtitle).push(run);
  });
  return { title: title.join("\n"), subtitle: subtitle.join("\n") };
}

/**
 * A section that carries no editable content: only `code` widgets, or only the
 * mobile back-to-top overlay (an image linking to `#doz_header`) — plus code.
 * These are chrome, so they emit no defs.
 */
function isSkippedSection(widgets) {
  if (widgets.length === 0) return false;
  return widgets.every(
    (w) => w.type === "code" || (w.type === "image" && w.href === BACK_TO_TOP_HREF),
  );
}

function fmt(prefix, suffix) {
  return suffix ? `${prefix} · ${suffix}` : prefix;
}

/**
 * EN label suffix. Returns `undefined` only when the EN slot is absent, so the
 * label can mirror KO; an empty-but-present slot yields `""` (English prefix).
 */
function enSnippet(value, max = 40) {
  if (value === undefined || value === null) return undefined;
  return truncate(value, max) || "";
}

function enBase(value) {
  if (value === undefined || value === null) return undefined;
  return basename(value);
}

function localeHref(locale, route) {
  const clean = route.startsWith("/") ? route : "/" + route;
  return locale === "ko" ? clean : "/en" + (clean === "/" ? "" : clean);
}

function dedupe(list) {
  return [...new Set(list)];
}

function routeForPageKey(key) {
  return PAGE_KEY_TO_ROUTE[key] ?? "/" + key.replace(/\./g, "/");
}

function revalidateForPage(key) {
  const route = routeForPageKey(key);
  return dedupe([localeHref("ko", route), localeHref("en", route)]);
}

function revalidateForBoard(slug) {
  const route = "/" + slug.replace(/\./g, "/");
  return dedupe([
    localeHref("ko", route),
    localeHref("en", route),
    `${localeHref("ko", route)}/[id]`,
    `${localeHref("en", route)}/[id]`,
  ]);
}

const SITE_REVALIDATE = ["/"];

function groupForPageKey(key) {
  if (key === "home") return "home";
  if (key.startsWith("company")) return "company";
  if (key.startsWith("rnd")) return "rnd";
  if (key.startsWith("products")) return "products";
  if (key === "site") return "site";
  return "boards"; // news, notices, support
}

function groupForBoardSlug(slug) {
  return slug.startsWith("products") ? "products" : "boards";
}

// ---------------------------------------------------------------------------
// registry accumulation
// ---------------------------------------------------------------------------

const defs = [];
const defaults = {};
const seen = new Map();
const warnings = [];
const unmappedWidgets = {};

/**
 * Monotonic emission counter. Sorting by `(pageKey, order)` preserves the
 * SOURCE DOCUMENT ORDER of sections/widgets/fields instead of the old
 * lexicographic `sectionId` order, which scrambled the admin accordion.
 */
let emissionOrder = 0;

function addDef(entry) {
  const {
    pageKey,
    group,
    sectionId,
    widgetId,
    field,
    kind,
    section,
    label,
    revalidate,
    koValue,
    enValue,
  } = entry;

  const key = `${pageKey}#${sectionId}/${widgetId}/${field}`;
  if (seen.has(key)) {
    warnings.push(`duplicate key skipped: ${key} (first from ${seen.get(key)})`);
    return;
  }
  seen.set(key, `${pageKey}/${sectionId}/${widgetId}`);

  defs.push({
    key,
    group,
    pageKey,
    sectionId,
    widgetId,
    field,
    kind,
    section,
    label,
    revalidate,
    /** internal emission index (stripped before output) */
    order: emissionOrder++,
  });

  const value = {};
  if (typeof koValue === "string") value.ko = koValue;
  if (typeof enValue === "string") value.en = enValue;
  defaults[key] = value;
}

function addWidgetDef(entry, koSuffix, enSuffix) {
  const label = {
    ko: fmt(entry.prefix.ko, koSuffix),
    // Mirror the KO label when the EN slot is absent (its value is omitted too).
    en: enSuffix !== undefined && enSuffix !== null
      ? fmt(entry.prefix.en, enSuffix)
      : fmt(entry.prefix.ko, koSuffix),
  };
  addDef({ ...entry, label });
}

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".draft.json"))
    .sort();
}

function pageKeyOf(fileName) {
  return fileName.replace(/\.json$/, "");
}

function walkPages() {
  const koDir = path.join(CONTENT_ROOT, "ko", "pages");
  const enDir = path.join(CONTENT_ROOT, "en", "pages");

  for (const fileName of listJson(koDir)) {
    const pageKey = pageKeyOf(fileName);
    const group = groupForPageKey(pageKey);
    const revalidate = revalidateForPage(pageKey);

    const koPage = readJson(path.join(koDir, fileName));
    const enPath = path.join(enDir, fileName);
    const enPage = fs.existsSync(enPath) ? readJson(enPath) : null;
    if (!enPage) warnings.push(`no EN page for ${pageKey}; EN values omitted`);

    // home keeps its own footer section (SiteFooter renders it site-wide) and
    // has no page-title hero band; every other page drops the sections below.
    const dead = pageKey === "home" ? new Set() : deadSectionIds(koPage);

    const pageSection = {
      ko: koPage.title ?? pageKey,
      en: enPage?.title ?? koPage.title ?? pageKey,
    };

    for (let si = 0; si < (koPage.sections ?? []).length; si += 1) {
      const koSection = koPage.sections[si];
      // keep the EN index alignment: skip by position, not by filtering
      if (dead.has(koSection.id)) continue;
      const enSection = enPage?.sections?.[si];
      const section = sectionNameFor(koSection, enSection, pageSection);
      // the footer is shared chrome (SiteFooter renders it on every route), so
      // its defs live in their own `common` group instead of bloating `home`
      const sectionGroup =
        isFooterSection(koSection) || koSection.id === FOOTER_SECTION_ID ? "common" : group;
      const koWidgets = sectionWidgets(koSection);
      const enWidgets = enSection ? sectionWidgets(enSection) : [];

      // Chrome sections (code-only, or the mobile back-to-top overlay) emit
      // nothing: code and the back-to-top image are not admin-editable.
      if (isSkippedSection(koWidgets)) {
        const key = "back-to-top:skipped";
        unmappedWidgets[key] = (unmappedWidgets[key] ?? 0) + 1;
        continue;
      }

      // Home locations: the text widgets AFTER the first are the holder cards,
      // emitted as ONE `cards` list def further down instead of per-widget defs.
      const isHomeLocations = pageKey === "home" && koSection.id === LOCATIONS_SECTION_ID;
      const isHomeTicker = pageKey === "home" && koSection.id === TICKER_SECTION_ID;
      const cardWidgetIds = new Set();
      if (isHomeLocations) {
        // Mirror `applyCards` (lib/content/merge.ts): the heading is the FIRST
        // text widget with non-empty html; the remaining non-empty text widgets
        // are the cards. A positional first widget that carries only empty/
        // markupless html must not be mistaken for the heading.
        const textWidgets = koWidgets.filter(
          (w) =>
            w.type === "text" &&
            typeof w.html === "string" &&
            w.html.trim().length > 0,
        );
        for (const widget of textWidgets.slice(1)) cardWidgetIds.add(widget.id);
      }

      for (let wi = 0; wi < koWidgets.length; wi += 1) {
        const koWidget = koWidgets[wi];
        if (cardWidgetIds.has(koWidget.id)) continue;
        let enWidget = enWidgets[wi] ?? null;
        if (enWidget && enWidget.type !== koWidget.type) {
          warnings.push(
            `widget type mismatch ${pageKey}/${koSection.id}/${koWidget.id}: ` +
              `ko=${koWidget.type} en=${enWidget.type}`,
          );
          enWidget = null;
        }

        mapWidget({
          pageKey,
          group: sectionGroup,
          sectionId: koSection.id,
          section,
          revalidate,
          koWidget,
          enWidget,
        });
      }

      if (isHomeLocations) {
        mapLocationCards({
          pageKey,
          group: sectionGroup,
          sectionId: koSection.id,
          section,
          revalidate,
          koWidgets,
          enWidgets,
        });
      }

      if (isHomeTicker) {
        mapTickerPicks({
          pageKey,
          group: sectionGroup,
          sectionId: koSection.id,
          section,
          revalidate,
        });
      }

      // hero slides (`section.visual`) are not widget nodes: one `slides` def
      // per visual section powers the add/remove/reorder editor.
      if (Array.isArray(koSection.visual) && koSection.visual.length > 0) {
        mapSlides({
          pageKey,
          group: sectionGroup,
          sectionId: koSection.id,
          section,
          revalidate,
          koSlides: koSection.visual,
          enSlides: Array.isArray(enSection?.visual) ? enSection.visual : null,
        });
      }
    }
  }
}

function mapWidget({
  pageKey,
  group,
  sectionId,
  section,
  revalidate,
  koWidget,
  enWidget,
}) {
  const base = { pageKey, group, sectionId, widgetId: koWidget.id, revalidate };
  const type = koWidget.type;

  switch (type) {
    case "text": {
      const koHtml = typeof koWidget.html === "string" ? koWidget.html : undefined;
      const enHtml = enWidget && typeof enWidget.html === "string" ? enWidget.html : undefined;
      const koRuns = textRuns(koHtml);
      // Markup-only text widgets (logo/structure html with no text nodes, e.g.
      // the footer logo or company.global address blocks) must NOT become
      // `lines` defs: the editor would have no lines to edit and a saved value
      // would replace the markup with plain text (Gate-2 F2).
      if (koRuns.length === 0 && typeof koHtml === "string" && koHtml.includes("<")) {
        const key = `${type}:markup-only`;
        unmappedWidgets[key] = (unmappedWidgets[key] ?? 0) + 1;
        return;
      }
      const enRuns = enHtml !== undefined ? textRuns(enHtml) : null;

      // Home text blocks are split into an editable title (first styled run)
      // and description (the remaining runs) so the two design lines are edited
      // separately; single-run blocks, the shared footer (`common`) and
      // non-home pages keep ONE `html` def (the footer wordmark/copyright are
      // layout runs, not a title/description pair).
      if (pageKey === "home" && group !== "common" && koRuns.length >= 2) {
        addWidgetDef(
          { ...base, field: "title", kind: "lines", prefix: LABELS.itemTitle, section,
            koValue: koRuns[0], enValue: enRuns ? enRuns[0] : undefined },
          truncate(koRuns[0], 40),
          enRuns ? truncate(enRuns[0], 40) || "" : undefined,
        );
        addWidgetDef(
          { ...base, field: "desc", kind: "lines", prefix: LABELS.itemDesc, section,
            koValue: koRuns.slice(1).join("\n"),
            enValue: enRuns ? enRuns.slice(1).join("\n") : undefined },
          truncate(koRuns[1], 40),
          enRuns ? truncate(enRuns[1], 40) || "" : undefined,
        );
        return;
      }

      addWidgetDef(
        { ...base, field: "html", kind: "lines", prefix: LABELS.text, section,
          koValue: koRuns.join("\n"), enValue: enRuns ? enRuns.join("\n") : undefined },
        truncate(koRuns[0], 40) || undefined,
        enRuns ? truncate(enRuns[0], 40) || "" : undefined,
      );
      return;
    }
    case "menu_title": {
      addWidgetDef(
        { ...base, field: "text", kind: "text", prefix: LABELS.menuTitle, section,
          koValue: koWidget.text, enValue: enWidget?.text },
        truncate(koWidget.text, 40),
        enSnippet(enWidget?.text),
      );
      return;
    }
    case "image": {
      addWidgetDef(
        { ...base, field: "src", kind: "image", prefix: LABELS.imageSrc, section,
          koValue: koWidget.src, enValue: enWidget?.src },
        basename(koWidget.src),
        enBase(enWidget?.src),
      );
      // Vision cards store their overlay markup in `alt`; only then is it an
      // editable field (assigned verbatim via the `overlay` kind). Plain image
      // alt text and image links stay hard-coded.
      if (isOverlayAlt(koWidget.alt)) {
        const koTitle = overlayTitle(koWidget.alt) || basename(koWidget.src);
        const enTitle =
          enWidget && isOverlayAlt(enWidget.alt)
            ? overlayTitle(enWidget.alt) || basename(enWidget.src)
            : undefined;
        addWidgetDef(
          { ...base, field: "alt", kind: "overlay", prefix: LABELS.imageOverlay, section,
            koValue: koWidget.alt, enValue: enWidget?.alt },
          koTitle,
          enTitle,
        );
      }
      return;
    }
    case "button": {
      addWidgetDef(
        { ...base, field: "text", kind: "text", prefix: LABELS.buttonText, section,
          koValue: koWidget.text, enValue: enWidget?.text },
        truncate(koWidget.text, 40),
        enSnippet(enWidget?.text),
      );
      return;
    }
    case "gallery2": {
      const koItems = koWidget.items ?? [];
      const enItems = enWidget?.items ?? [];
      for (let i = 0; i < koItems.length; i += 1) {
        const koItem = koItems[i];
        const enItem = enItems[i];
        const itemBase = { ...base, widgetId: `${koWidget.id}` };
        const prefix = { ...LABELS.galleryItem };
        const itemPrefix = {
          ko: `${prefix.ko} ${i + 1}`,
          en: `${prefix.en} ${i + 1}`,
        };
        const titleKo = truncate(koItem.title, 40);
        const titleEn = enSnippet(enItem?.title);

        addWidgetDef(
          { ...itemBase, field: `items[${i}].title`, kind: "text", prefix: itemPrefix,
            section, koValue: koItem.title, enValue: enItem?.title },
          titleKo,
          titleEn,
        );
        addWidgetDef(
          { ...itemBase, field: `items[${i}].desc`, kind: "text", prefix: LABELS.itemDesc,
            section, koValue: koItem.desc, enValue: enItem?.desc },
          truncate(koItem.desc, 40),
          enSnippet(enItem?.desc),
        );
        addWidgetDef(
          { ...itemBase, field: `items[${i}].org`, kind: "image", prefix: LABELS.itemOrg,
            section, koValue: koItem.org, enValue: enItem?.org },
          basename(koItem.org),
          enBase(enItem?.org),
        );
        addWidgetDef(
          { ...itemBase, field: `items[${i}].thumb`, kind: "image", prefix: LABELS.itemThumb,
            section, koValue: koItem.thumb, enValue: enItem?.thumb },
          basename(koItem.thumb),
          enBase(enItem?.thumb),
        );
      }
      return;
    }
    case "video": {
      addWidgetDef(
        { ...base, field: "src", kind: "url", prefix: LABELS.videoSrc, section,
          koValue: koWidget.src, enValue: enWidget?.src },
        truncate(koWidget.src, 40),
        enSnippet(enWidget?.src),
      );
      return;
    }
    case "code": {
      // Code embeds are not admin content: never emit a def (they are chrome).
      unmappedWidgets[`${type}:skipped`] = (unmappedWidgets[`${type}:skipped`] ?? 0) + 1;
      return;
    }
    default: {
      unmappedWidgets[type] = (unmappedWidgets[type] ?? 0) + 1;
    }
  }
}

/**
 * Hero slides: ONE `slides` def per visual section, so the admin can add,
 * remove and reorder slides. The default is a JSON array of `{ bg, title,
 * subtitle }`: `title` holds the big runs (>= 40px) and `subtitle` the rest;
 * the runtime injects them back into the authored slide markup (see
 * `applySlides` in lib/content/merge.ts).
 */
function mapSlides({ pageKey, group, sectionId, section, revalidate, koSlides, enSlides }) {
  const base = { pageKey, group, sectionId, widgetId: "visual", revalidate };
  const toSlide = (slide) => {
    const { title, subtitle } = splitSlideRuns(slide?.html);
    return { bg: typeof slide?.bg === "string" ? slide.bg : null, title, subtitle };
  };
  addDef({
    ...base,
    field: "slides",
    kind: "slides",
    label: { ko: LABELS.heroSlides.ko, en: LABELS.heroSlides.en },
    section,
    koValue: JSON.stringify((koSlides ?? []).map(toSlide)),
    enValue: Array.isArray(enSlides) ? JSON.stringify(enSlides.map(toSlide)) : undefined,
  });
}

/**
 * ONE `cards` list def for the home locations section: the holder text widgets
 * (every `text` widget after the heading) become `[{ lines: [...] }]`. The EN
 * value mirrors the EN section's widgets at the same indices (positional
 * pairing — see `resolvePairedSection` in lib/content/pair.ts).
 */
function mapLocationCards({ pageKey, group, sectionId, section, revalidate, koWidgets, enWidgets }) {
  // Same rule as `applyCards`: heading = first text widget with non-empty html,
  // cards = the remaining non-empty text widgets (positional pairing with EN).
  const textEntries = koWidgets
    .map((widget, index) => ({ widget, index }))
    .filter(
      (entry) =>
        entry.widget.type === "text" &&
        typeof entry.widget.html === "string" &&
        entry.widget.html.trim().length > 0,
    );
  const cardEntries = textEntries.slice(1); // first non-empty text = heading
  if (cardEntries.length === 0) return;

  const koValue = JSON.stringify(
    cardEntries.map((entry) => ({ lines: textRuns(entry.widget.html) })),
  );
  let enValue;
  if (enWidgets.length > 0) {
    const enCards = cardEntries.map((entry) => {
      const enWidget = enWidgets[entry.index];
      return {
        lines: enWidget && enWidget.type === "text" ? textRuns(enWidget.html) : [],
      };
    });
    enValue = JSON.stringify(enCards);
  }

  addDef({
    pageKey,
    group,
    sectionId,
    widgetId: "cards",
    field: "cards",
    kind: "cards",
    label: { ko: LABELS.locationCards.ko, en: LABELS.locationCards.en },
    section,
    revalidate,
    koValue,
    enValue,
  });
}

/**
 * ONE `picks` def for the home notice ticker: which board + posts the renderer
 * should show. The default (empty idxs) means "first 4 news" (renderer fallback).
 */
function mapTickerPicks({ pageKey, group, sectionId, section, revalidate }) {
  const value = JSON.stringify({ board: "news", idxs: [] });
  addDef({
    pageKey,
    group,
    sectionId,
    widgetId: "picks",
    field: "picks",
    kind: "picks",
    label: { ko: LABELS.tickerPicks.ko, en: LABELS.tickerPicks.en },
    section,
    revalidate,
    koValue: value,
    enValue: value,
  });
}

// ---------------------------------------------------------------------------
// boards
// ---------------------------------------------------------------------------

function walkBoards() {
  const koDir = path.join(CONTENT_ROOT, "ko", "boards");
  const enDir = path.join(CONTENT_ROOT, "en", "boards");

  for (const fileName of listJson(koDir)) {
    const slug = pageKeyOf(fileName);
    const group = groupForBoardSlug(slug);
    const revalidate = revalidateForBoard(slug);
    const koBoard = readJson(path.join(koDir, fileName));
    const enPath = path.join(enDir, fileName);
    const enBoard = fs.existsSync(enPath) ? readJson(enPath) : null;
    if (!enBoard) warnings.push(`no EN board for ${slug}; EN value omitted`);

    const section = {
      ko: koBoard.name ?? slug,
      en: enBoard?.name ?? koBoard.name ?? slug,
    };

    const base = {
      pageKey: slug,
      group,
      sectionId: "board",
      widgetId: slug,
      revalidate,
      section,
    };

    addWidgetDef(
      { ...base, field: "name", kind: "text", prefix: LABELS.boardName, section,
        koValue: koBoard.name, enValue: enBoard?.name },
      truncate(koBoard.name, 40),
      enSnippet(enBoard?.name),
    );

    // Whole post list as a JSON payload: KO and EN post sets differ, so a single
    // locale-scoped `list` override is more robust than per-index post keys.
    addDef({
      ...base,
      field: "posts",
      kind: "list",
      label: { ko: LABELS.boardPosts.ko, en: LABELS.boardPosts.en },
      koValue: JSON.stringify(koBoard.posts ?? []),
      enValue: enBoard ? JSON.stringify(enBoard.posts ?? []) : undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// site (nav labels)
// ---------------------------------------------------------------------------

function walkSite() {
  const koSite = readJson(path.join(CONTENT_ROOT, "ko", "site.json"));
  const enSitePath = path.join(CONTENT_ROOT, "en", "site.json");
  const enSite = fs.existsSync(enSitePath) ? readJson(enSitePath) : null;
  if (!enSite) warnings.push("no EN site.json; EN nav values omitted");

  const koNav = koSite.nav ?? [];
  const enNav = enSite?.nav ?? [];

  for (let i = 0; i < koNav.length; i += 1) {
    const item = koNav[i];
    const enItem = enNav[i];
    const section = {
      ko: item.name ?? `nav[${i}]`,
      en: enItem?.name ?? item.name ?? `nav[${i}]`,
    };
    const base = {
      pageKey: "site",
      group: "site",
      sectionId: "nav",
      revalidate: SITE_REVALIDATE,
      section,
    };

    addWidgetDef(
      { ...base, widgetId: `nav[${i}]`, field: "name", kind: "text",
        prefix: LABELS.navLabel, section, koValue: item.name, enValue: enItem?.name },
      truncate(item.name, 40),
      enSnippet(enItem?.name),
    );

    const children = item.children ?? [];
    const enChildren = enItem?.children ?? [];
    for (let j = 0; j < children.length; j += 1) {
      const child = children[j];
      const enChild = enChildren[j];
      addWidgetDef(
        { ...base, widgetId: `nav[${i}].children[${j}]`, field: "name", kind: "text",
          prefix: LABELS.navSubLabel, section, koValue: child.name, enValue: enChild?.name },
        truncate(child.name, 40),
        enSnippet(enChild?.name),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

/**
 * Page key stays the primary key (groups show pages in a stable route order),
 * but within a page the emission index preserves the crawled DOCUMENT ORDER of
 * sections → widgets → fields. The old `sectionId` string sort produced
 * hash-ordered admin accordions unrelated to the rendered page.
 */
function sortDefs(list) {
  return [...list].sort((a, b) => {
    if (a.pageKey !== b.pageKey) return a.pageKey < b.pageKey ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

const GROUPS = ["home", "company", "rnd", "products", "boards", "site", "common"];

function buildOutput(sorted) {
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, []]));
  for (const def of sorted) byGroup[def.group].push(def.key);

  const header = `// AUTO-GENERATED by scripts/gen-content-registry.mjs — regenerate with \`npm run content:registry\`.
// Hand-tuned edits are allowed, but the next generator run overwrites them.
//
// This registry is the code-side default content. The Postgres \`page_content\`
// table stores only overrides keyed by (key, locale); \`DEFAULT_VALUES\` below is
// what the app falls back to when no override exists.

`;

  const types = `export type ContentKind = ${KINDS.map((kind) => JSON.stringify(kind)).join(" | ")};

export type ContentGroup = ${GROUPS.map((g) => JSON.stringify(g)).join(" | ")};

export interface ContentDef {
  /** Stable override key: \`<pageKey>#<sectionId>/<widgetId>/<field>\`. */
  key: string;
  group: ContentGroup;
  pageKey: string;
  sectionId: string;
  widgetId: string;
  field: string;
  kind: ContentKind;
  section: { ko: string; en: string };
  label: { ko: string; en: string };
  /** Routes to invalidate when this default changes. */
  revalidate: string[];
}

`;

  const defsLiteral =
    `export const CONTENT_DEFS: ContentDef[] = ${JSON.stringify(sorted, null, 2)};\n\n`;

  const defaultsLiteral =
    `/** Code-side defaults, seeded from content/*.json (DB values override these). */\n` +
    `export const DEFAULT_VALUES: Record<string, { ko?: string; en?: string }> = ` +
    `${JSON.stringify(defaults, null, 2)};\n\n`;

  const mapLiteral =
    `export const CONTENT_DEF_MAP: Record<string, ContentDef> = Object.fromEntries(\n` +
    `  CONTENT_DEFS.map((def) => [def.key, def]),\n);\n\n` +
    `export const CONTENT_KEYS_BY_GROUP: Record<ContentGroup, string[]> = ` +
    `${JSON.stringify(byGroup, null, 2)};\n\n` +
    `export const MAX_LENGTH: Record<ContentKind, number> = ` +
    `${JSON.stringify(MAX_LENGTH, null, 2)};\n\n` +
    `export const CONTENT_KINDS: ContentKind[] = ${JSON.stringify(KINDS)};\n\n` +
    `export const CONTENT_GROUPS: ContentGroup[] = ${JSON.stringify(GROUPS)};\n`;

  return header + types + defsLiteral + defaultsLiteral + mapLiteral;
}

function main() {
  walkPages();
  walkBoards();
  walkSite();

  // make duplicate per-page section names distinguishable before emitting
  disambiguateSectionNames(defs);

  // `addDef` already skips + warns on duplicate keys, so `defs` keys are unique.
  // Strip the internal emission index before emitting the registry.
  const sorted = sortDefs(defs).map((def) => {
    const copy = { ...def };
    delete copy.order;
    return copy;
  });
  const output = buildOutput(sorted);

  // `--check` reports drift without writing (safe before/after crawl imports).
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : "";
    if (current === output) {
      console.log("registry is up to date (no diff)");
    } else {
      console.log("registry is OUT OF DATE — run `npm run content:registry`");
      process.exitCode = 1;
    }
  } else {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, output, "utf8");
    console.log(`wrote ${path.relative(ROOT, OUT_FILE)}`);
  }

  const byGroup = {};
  const byKind = {};
  for (const def of sorted) {
    byGroup[def.group] = (byGroup[def.group] ?? 0) + 1;
    byKind[def.kind] = (byKind[def.kind] ?? 0) + 1;
  }
  const missingDefaults = sorted.filter(
    (def) => Object.keys(defaults[def.key] ?? {}).length === 0,
  ).length;
  const missingEnValues = sorted.filter(
    (def) => typeof defaults[def.key]?.ko === "string" && defaults[def.key]?.en === undefined,
  ).length;
  const mirroredLabels = sorted.filter((def) => def.label.en === def.label.ko).length;
  const maxList = sorted.reduce((max, def) => {
    if (def.kind !== "list") return max;
    const value = defaults[def.key];
    return Math.max(max, (value?.ko?.length ?? 0), (value?.en?.length ?? 0));
  }, 0);

  console.log(`  CONTENT_DEFS: ${sorted.length}`);
  console.log(`  by group: ${JSON.stringify(byGroup)}`);
  console.log(`  by kind: ${JSON.stringify(byKind)}`);
  console.log(`  defs without any default value: ${missingDefaults}`);
  console.log(`  defs with KO value but no EN value: ${missingEnValues}`);
  console.log(`  labels mirrored from KO: ${mirroredLabels}`);
  console.log(`  longest list default: ${maxList} chars (MAX_LENGTH.list=${MAX_LENGTH.list})`);
  console.log(`  unmapped widget types: ${JSON.stringify(unmappedWidgets)}`);
  if (warnings.length > 0) {
    console.log(`  warnings (${warnings.length}):`);
    for (const warning of warnings) console.log(`    - ${warning}`);
  }
}

// Run only when invoked directly (`node scripts/gen-content-registry.mjs`);
// importing the module (e.g. the tokenizer parity test) must have no side
// effects.
const isDirectRun =
  !!process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) main();
