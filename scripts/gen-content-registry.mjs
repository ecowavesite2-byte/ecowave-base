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

/**
 * Widget types skipped when pairing KO ↔ EN positionally. These carry no
 * overridable content (padding spacers, horizontal rules, raw code embeds), so
 * they must not shift the alignment of the editable widgets around them.
 * Mirrors `PAIR_IGNORED_TYPES` in lib/content/pair.ts (asserted by a parity test).
 */
export const PAIR_IGNORED_TYPES = new Set(["padding", "hr", "code"]);

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

/**
 * Mirrors `PAGE_ALIASES` in lib/content/paths.ts: pageKeys whose content is
 * served by another pageKey (no redirect). Alias keys emit no defs of their own
 * (they render the target page's content), but they still appear as routes in
 * the target's revalidate set.
 */
export const PAGE_ALIASES = { company: "company.ceo", rnd: "rnd.technology" };

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
  embedSrc: { ko: "임베드 URL", en: "Embed URL" },
  codeBlock: { ko: "코드 블록", en: "Code block" },
  heroSlides: { ko: "메인 비주얼 슬라이드", en: "Main visual slides" },
  menuTitle: { ko: "메뉴 제목", en: "Menu title" },
  navLabel: { ko: "내비게이션 라벨", en: "Nav label" },
  navSubLabel: { ko: "하위 내비게이션 라벨", en: "Nav sub-label" },
  boardName: { ko: "게시판 이름", en: "Board name" },
  boardPosts: { ko: "게시글 목록", en: "Board posts" },
  eras: { ko: "연혁", en: "History eras" },
  locations: { ko: "지사 목록", en: "Branch locations" },
  galleryAbout: { ko: "갤러리", en: "Gallery" },
  cardsAbout: { ko: "카드 목록", en: "Card list" },
  facilityTabs: { ko: "생산설비 탭", en: "Facilities tabs" },
  techFeatures: { ko: "기술 블록", en: "Technology block" },
  patentSections: { ko: "인증 섹션 목록", en: "Certification sections" },
  facilitiesTable: { ko: "설비 표", en: "Equipment table" },
};

const MAX_LENGTH = {
  text: 500,
  textarea: 20000,
  lines: 20000,
  image: 2000,
  url: 2000,
  embed: 2000,
  list: 20000,
  slides: 20000,
  overlay: 5000,
  cards: 20000,
  picks: 2000,
  eras: 20000,
  locations: 20000,
  gallery: 20000,
  aboutCards: 20000,
  facilityTabs: 20000,
  techFeatures: 40000,
  patentSections: 60000,
  facilitiesTable: 20000,
};

/** Kinds emitted into `lib/content/registry.ts` (order = CONTENT_KINDS). */
const KINDS = ["text", "textarea", "lines", "image", "url", "list", "slides", "overlay", "cards", "picks", "embed", "eras", "locations", "gallery", "aboutCards", "facilityTabs", "techFeatures", "patentSections", "facilitiesTable"];

/**
 * Sections the public renderers strip, so the admin must not expose their
 * fields (an override there would be a silent no-op):
 *  - the black footer band — every page shell drops its own copy and
 *    `components/layout/SiteFooter.tsx` renders the HOME page's copy on every
 *    route, so only `home`'s footer defs are live;
 *  - the leading page-title hero band of each channel — rebuilt as <PageHero>
 *    from the nav labels (site#nav/…), which are the real source;
 *  - the shared company intro band — every `/company*` page authors its own
 *    copy (each with a page-local section id) but only `company.ceo`'s is live:
 *    the renderer (`components/content/ContentPage.tsx`) swaps its rows into the
 *    other pages' bands, so their copies are dead. Matched by unique bg —
 *    see `sharedIntroFor` / `isSharedIntroSection` below.
 * Mirrors lib/page-hero.ts (`isFooterSection`, FOOTER_SECTION_ID),
 * lib/content/shared-intro.ts (`SHARED_INTROS`) and
 * components/content/SectionRenderer.tsx (`MOBILE_SECTION`, `PAGE_HERO`,
 * `isPageHeroSection`).
 */
const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";
const MOBILE_SECTION = /(^|\s)mobile_section(\s|$)/;
const PAGE_HERO = /(^|\s)(_section_first|mobile_section_first)(\s|$)/;

/**
 * Shared intro band config — MIRROR of `lib/content/shared-intro.ts` (this
 * script is plain .mjs, so the config is duplicated; a parity test compares the
 * two `SHARED_INTROS` exports so they cannot silently drift). The band has no
 * shared class/id across pages, so it is identified by its unique background
 * image, which may live on `bg` or only inside `bgStyle`.
 */
const COMPANY_INTRO_BG = "/images/thumbnail/20250811/269ab684758f0.jpg";
const RND_INTRO_BG = "/images/thumbnail/20250820/6bbe2b297ab17.jpg";
export const SHARED_INTROS = [
  { canonicalPageKey: "company.ceo", channel: "company", bg: COMPANY_INTRO_BG },
  { canonicalPageKey: "rnd.technology", channel: "rnd", bg: RND_INTRO_BG },
];

/** Channel prefix of a pageKey, normalizing dot and slash forms. */
export function channelOf(pageKey) {
  return pageKey.replace(/\./g, "/").split("/")[0];
}

/** The shared-intro config whose channel owns `pageKey`, or null. */
export function sharedIntroFor(pageKey) {
  return SHARED_INTROS.find((c) => c.channel === channelOf(pageKey)) ?? null;
}

/** Background image of a section: `bg` first, then the url(...) in `bgStyle`. */
function bgOf(sec) {
  if (sec.bg) return sec.bg;
  return /url\(["']?([^"')]+)["']?\)/.exec(sec.bgStyle || "")?.[1] ?? null;
}

/** true when this section is the shared intro band for `cfg` (matched by unique bg). */
export function isSharedIntroSection(sec, cfg) {
  return bgOf(sec) === cfg.bg;
}

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
  // the single editable source of the shared company intro band
  s202508206321c39177601: {
    ko: "회사 소개 인트로 (모든 회사 페이지 공통)",
    en: "Company intro (shared by all company pages)",
  },
  // the single editable source of the shared R&D sub-hero banner
  s20250909caaa8544e0e70: {
    ko: "연구개발 소개 인트로 (모든 R&D 서브페이지 공통)",
    en: "R&D intro (shared by all R&D subpages)",
  },
};

/**
 * Structured media blocks on `company.about`, keyed by KO section id. Each
 * gallery2 section gets ONE `gallery` def exposing only the configured fields
 * (`image`, optionally `title`/`desc`) with an optional item cap. Sections not
 * listed keep the legacy per-item defs (galleries elsewhere, incl. rnd.*).
 */
export const ABOUT_MEDIA_BLOCKS = {
  s202508119a2e8fe21b47a: { fields: ["image", "title"] }, // block 3
  s20250918c54b2950e2f1a: { fields: ["image"], maxItems: 5 }, // block 4
  s20250918ab81858502f9e: { fields: ["image"] }, // block 6
  s20250918ffd77075d76ea: { fields: ["image", "title", "desc"], maxItems: 6 }, // block 7
};
/** Block 5: 6 sibling card text widgets (title+desc runs + embedded image). */
export const ABOUT_CARDS_SECTION = "s20250918c5a18b62c8acd";

/**
 * Structured media blocks on `rnd.*`, keyed by KO section id (block-level) or by
 * the KO gallery widget id (widget-level). A section-level entry applies to the
 * gallery2 widgets inside that section; a widget-level entry targets one
 * specific gallery when a section holds several. The emitted def's `gallery`
 * config keeps ONLY `{ fields, maxItems }` — `label` overrides the def label and
 * `skipEmpty` drops items whose resolved image is empty (both generator-only).
 */
export const RND_MEDIA_BLOCKS = {
  // rnd.technology §7 — the 5-item core USP image gallery.
  s2025090979d4f02da9a4c: {
    fields: ["image"],
    maxItems: 5,
    label: { ko: "핵심 USP", en: "Core USP" },
  },
};

export const RND_MEDIA_WIDGET_BLOCKS = {
  // rnd.patents §4 — three certification galleries. These legacy gallery defs
  // are SUPERSEDED by the structured `patentSections` kind (their widgets are
  // skipped below), but the config is kept for the migration lane to map the old
  // per-gallery override keys onto the new section-scoped def.
  w20250820eeffb853be62c: {
    fields: ["image", "title"],
    skipEmpty: true,
    label: { ko: "인증 현황", en: "Certifications" },
  },
  w20250820d0424c97beb80: {
    fields: ["image", "title"],
    label: { ko: "기업 인증 및 특허", en: "Corporate certifications & patents" },
  },
  w2025082013eb8cbe71ecd: {
    fields: ["image", "title"],
    label: { ko: "국제 인증 및 위촉", en: "International certifications" },
  },
};

/**
 * Structured `techFeatures` blocks on `rnd.technology`. The THREE sections
 * §4/§5/§6 fold into ONE `techFeatures` def with three fixed item groups:
 * `sections` is the block→section mapping (block 0 → §4, block 1 → §5,
 * block 2 → §6) emitted verbatim into the def's `techBlocks` config, and
 * `bySection` lists each section's KO image + text-table widget pairs (document
 * order). EN widget ids differ, so EN values are parsed from the positionally
 * paired widgets (`pairMap`). Kept exported for the migration lane.
 */
export const TECH_FEATURE_SECTION_IDS = [
  "s202509091799d895b62ea", // §4 — rowspan heading + top-level image/text rows
  "s2025090972e449f7846e1", // §5 — two item cols (colspan heading)
  "s20250909b12fa8000068e", // §6 — two item cols (colspan heading)
];
export const TECH_FEATURE_BLOCKS = {
  /** Fixed block order → KO section id. */
  sections: TECH_FEATURE_SECTION_IDS,
  /** KO section id → image + text-table widget pairs (document order). */
  bySection: {
    // §4 — one block with a rowspan heading cell + label/body rows.
    s202509091799d895b62ea: {
      items: [{ imageWidget: "w202509092bb83d593e678", textWidget: "w20250909a6322fa870d46" }],
    },
    // §5 — two blocks (each a colspan heading + label/body rows).
    s2025090972e449f7846e1: {
      items: [
        { imageWidget: "w20250909743cf5b3c0201", textWidget: "w20250909f986ae33491f9" },
        { imageWidget: "w2025090999ac3275406dc", textWidget: "w20250909cabf29c2126d9" },
      ],
    },
    // §6 — two blocks (same shape).
    s20250909b12fa8000068e: {
      items: [
        { imageWidget: "w20250909dbdd88bc19258", textWidget: "w202509093403364594dce" },
        { imageWidget: "w2025090910fe01238de32", textWidget: "w20250909aaff6976da0b4" },
      ],
    },
  },
};

/**
 * Structured `patentSections` block on `rnd.patents` §4: the three
 * heading + gallery2 groups (document order). ONE `patentSections` def covers the
 * three heading `lines` and the three `gallery` widgets for this section.
 */
export const PATENT_SECTIONS = {
  sectionId: "s202508114d9bc90ceb876",
  blocks: [
    { headingWidget: "w20250820275c6573162a6", galleryWidget: "w20250820eeffb853be62c" },
    { headingWidget: "w2025082061b08b8c142c7", galleryWidget: "w20250820d0424c97beb80" },
    { headingWidget: "w202508201caaa295b789a", galleryWidget: "w2025082013eb8cbe71ecd" },
  ],
};

/**
 * Structured `facilitiesTable` widgets on `rnd.facilities` §5, keyed by KO text
 * widget id. Each emits ONE widget-scoped `facilitiesTable` def; the widget's
 * legacy `lines` def is skipped. The EN widget is resolved positionally.
 */
export const FACILITIES_TABLES = {
  w20250829bb21466f4e0f1: { sectionId: "s20250829c25afe324e195" },
  w20250829370d74ba50fab: { sectionId: "s20250829c25afe324e195" },
  w202508298781405b23d22: { sectionId: "s20250829c25afe324e195" },
  w202508293b8acaf6df97a: { sectionId: "s20250829c25afe324e195" },
};

/** KO section id of the rnd.facilities tab block owning the `facilityTabs` def. */
const RND_FACILITIES_TABS_SECTION_ID = "s20250829c25afe324e195";

/**
 * Last segment of a pageKey/board slug, humanized: `products.eco-wave` →
 * `Eco Wave`. Used when no content-derived or board-provided name exists, so a
 * section label is never empty.
 */
function humanizePageKey(key) {
  const tail = String(key ?? "").split(".").pop() ?? "";
  return tail
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Basenames like `5045189daef5d.png` are crawl artifacts, not meaningful
 * labels; sections whose only name would be one of these use a type fallback.
 */
const MACHINE_FILENAME = /^[0-9a-f]{6,}\.[a-z0-9]+$/i;

function imageFallbackName(locale) {
  return locale === "en" ? "Image" : "이미지";
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
  if (image) {
    const alt = stripZeroWidth(image.alt);
    if (alt) return truncate(alt, 34);
    const file = basename(image.src);
    if (file && !MACHINE_FILENAME.test(file)) return truncate(file, 34);
    return imageFallbackName(locale);
  }
  const types = new Set(widgets.map((w) => w.type));
  if (types.has("gallery2")) return locale === "en" ? "Gallery" : "갤러리";
  if (types.has("video")) return locale === "en" ? "Video" : "동영상";
  if (types.has("newest")) return locale === "en" ? "Latest posts" : "게시판 최신글";
  if (types.has("code")) return locale === "en" ? "Code block" : "코드 블록";
  if (types.has("form")) return locale === "en" ? "Inquiry form" : "문의 폼";
  if (types.has("board")) return locale === "en" ? "Board" : "게시판";
  return null;
}

/**
 * Per-section registry name (`section` field), content-derived and never empty:
 * curated override → crawled content → page-level title → humanized pageKey.
 */
function sectionNameFor(koSection, enSection, pageSection, pageKey) {
  const override = SECTION_NAME_OVERRIDES[koSection.id];
  const pageKo = stripZeroWidth(pageSection?.ko) || humanizePageKey(pageKey);
  const pageEn =
    stripZeroWidth(pageSection?.en) ||
    stripZeroWidth(pageSection?.ko) ||
    humanizePageKey(pageKey);
  const ko = override?.ko || autoSectionName(koSection, "ko") || pageKo;
  const en =
    override?.en ||
    (enSection ? autoSectionName(enSection, "en") : null) ||
    ko ||
    pageEn;
  return { ko, en };
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
function deadSectionIds(page, pageKey) {
  const sections = page.sections ?? [];
  const dead = new Set();
  for (const s of sections) {
    if (isFooterSection(s) || s.id === FOOTER_SECTION_ID) dead.add(s.id);
  }
  // Shared intro band: only the canonical page's copy is live; the renderer
  // swaps its rows into every other page's band, so those copies are dead.
  const cfg = sharedIntroFor(pageKey);
  if (cfg && pageKey !== cfg.canonicalPageKey) {
    for (const s of sections) if (isSharedIntroSection(s, cfg)) dead.add(s.id);
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

export function sectionWidgets(section) {
  const out = [];
  collectWidgets(section.rows ?? [], out);
  if (section.aside) collectWidgets(section.aside.items ?? [], out);
  return out;
}

/** Zero-width characters carry no copy; strip them before detecting a run. */
const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;

/** Strip zero-width characters and collapse whitespace (mirrors the tokenizer). */
function stripZeroWidth(value) {
  return String(value ?? "").replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

function stripTags(html) {
  return String(html ?? "")
    // The crawler's hidden editor markers (`display:none`) hold only a
    // zero-width char; drop them entirely so they don't become stray spaces.
    .replace(/<span\b[^>]*fr-marker[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(ZERO_WIDTH, "")
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
    const text = decodeEntities(parts[i]).replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
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
    } else if (decodeEntities(parts[i]).replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim().length > 0) {
      sizes.push(current);
    }
  }
  return sizes;
}

/**
 * Embedded media inside a `text` widget's html: every `<img>` / `<iframe>` with
 * its per-tag ordinal and raw `src` value. Mirrors the `img[n].src` /
 * `iframe[n].src` field shape applied by `replaceNthSrc` in lib/content/merge.ts.
 */
function embedSrcs(html) {
  const out = []; const seen = { img: 0, iframe: 0 };
  for (const m of String(html ?? "").matchAll(/<(img|iframe)\b[^>]*>/gi)) {
    const tag = m[1].toLowerCase();
    const s = /\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(m[0]);
    // Declared width (px or bare number); a `max-width`/`min-width` must not
    // count, so the lookbehind rejects a preceding `-` or word char.
    const w = /(?<![\w-])width\s*[:=]\s*"?(-?[\d.]+)(?:px)?"?/i.exec(m[0]);
    out.push({
      tag,
      index: seen[tag]++,
      src: s ? (s[2] ?? s[3] ?? "") : "",
      width: w ? parseFloat(w[1]) : null,
    });
  }
  return out;
}

/** Structured media item of one gallery item: `org = thumb = image`. */
function toMedia(item, cfg) {
  return {
    image: item?.org || item?.thumb || "",
    title: cfg.fields.includes("title") ? item?.title || "" : "",
    desc: cfg.fields.includes("desc") ? item?.desc || "" : "",
  };
}

/** `parseGalleryWidget` — one gallery2 widget + its block config → media items. */
export function parseGalleryWidget(widget, cfg) {
  const items = (widget?.items ?? []).map((item) => toMedia(item, cfg));
  // `skipEmpty` drops authored slots whose resolved image (org || thumb) is
  // empty so a trailing placeholder never surfaces as an editable item. Without
  // the flag the authored item count (including empties) is preserved.
  return cfg.skipEmpty ? items.filter((item) => item.image !== "") : items;
}

/**
 * Cells of every `<tr>` in an authored text-table widget's html, in document
 * order. Only the leading `<td>`/`<th>` level is read (the crawled tables are
 * flat); each cell is returned as its inner html string.
 */
export function parseTableRows(html) {
  const rows = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRe.exec(String(html ?? "")))) {
    const cells = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cell;
    while ((cell = cellRe.exec(row[1]))) cells.push(cell[1]);
    rows.push(cells);
  }
  return rows;
}

/** A table cell's editable text: its runs joined with `\n` (`<br>` → newline). */
export function cellText(html) {
  return textRuns(html).join("\n");
}

/**
 * `parseTechTable` — a `rnd.technology` techFeatures text table →
 * `{ heading, rows: [{ label, body }] }`. Row 0 is the heading row: §4 carries a
 * rowspan heading cell followed by its own label/body, while §5/§6 carry a
 * single colspan heading cell. Every later row is a label/body pair. The heading
 * and body text join their runs with `\n`, so an authored `<br>` round-trips as a
 * newline (the default replays to the authored rendering).
 */
export function parseTechTable(html) {
  const rows = parseTableRows(html);
  if (rows.length === 0) return { heading: "", rows: [] };
  const first = rows[0];
  // §4: [rowspan heading, label, body] — its own label/body is a data row too.
  const rowspanHeading = first.length >= 3;
  const heading = cellText(first[0]);
  const dataCells = rowspanHeading ? [first.slice(1), ...rows.slice(1)] : rows.slice(1);
  return {
    heading,
    rows: dataCells.map((cells) => ({ label: cellText(cells[0]), body: cellText(cells[1]) })),
  };
}

/** `parseTechFeatureItem` — one image + text-table pair → `{ image, heading, rows }`. */
export function parseTechFeatureItem(imageWidget, textWidget) {
  const { heading, rows } = parseTechTable(textWidget?.html);
  return {
    image: typeof imageWidget?.src === "string" ? imageWidget.src : "",
    heading,
    rows,
  };
}

/**
 * `parseTechFeatureSection` — every configured block in a §4/§5/§6 section, in
 * document order. `lookup(id)` resolves a widget id (a KO id for the default;
 * `pairMap.get` for EN).
 */
export function parseTechFeatureSection(cfg, lookup) {
  return cfg.items.map(({ imageWidget, textWidget }) =>
    parseTechFeatureItem(lookup(imageWidget), lookup(textWidget)),
  );
}

/**
 * Build the ONE v2 `techFeatures` payload for `rnd.technology`: three fixed
 * blocks (block k → `TECH_FEATURE_BLOCKS.sections[k]`), KO parsed by widget id
 * and EN through the positional KO↔EN pairing (contentless widget types
 * ignored). `enBlocks[k]` is `null` when the section has no EN counterpart, so
 * the caller can omit the EN value rather than emit a partial payload.
 */
export function buildTechFeaturePayload(koPage, enPage) {
  const sections = TECH_FEATURE_BLOCKS.sections;
  const koBlocks = [];
  const enBlocks = [];
  for (const sectionId of sections) {
    const index = (koPage?.sections ?? []).findIndex((s) => s.id === sectionId);
    const koSection = index >= 0 ? koPage.sections[index] : null;
    const enSection = index >= 0 ? (enPage?.sections ?? [])[index] ?? null : null;
    const cfg = TECH_FEATURE_BLOCKS.bySection[sectionId];
    const koWidgets = koSection ? sectionWidgets(koSection) : [];
    koBlocks.push({ items: parseTechFeatureSection(cfg, (id) => koWidgets.find((w) => w.id === id) ?? null) });
    if (!enSection) {
      enBlocks.push(null);
      continue;
    }
    const enWidgets = sectionWidgets(enSection);
    const koPaired = koWidgets.filter((w) => !PAIR_IGNORED_TYPES.has(w.type));
    const enPaired = enWidgets.filter((w) => !PAIR_IGNORED_TYPES.has(w.type));
    const pairMap = new Map(koPaired.map((w, i) => [w.id, enPaired[i] ?? null]));
    enBlocks.push({ items: parseTechFeatureSection(cfg, (id) => pairMap.get(id) ?? null) });
  }
  return { sections, koBlocks, enBlocks };
}

/** `parsePatentSectionBlock` — heading text runs + non-empty gallery items. */
export function parsePatentSectionBlock(headingWidget, galleryWidget) {
  const title = textRuns(headingWidget?.html).join("\n");
  const items = (galleryWidget?.items ?? [])
    .map((item) => ({ image: item?.org || item?.thumb || "", caption: item?.title || "" }))
    // The authored trailing placeholder (empty org+thumb) is dropped.
    .filter((item) => item.image !== "");
  return { title, items };
}

/**
 * `parsePatentSections` — all heading + gallery2 groups of `rnd.patents` §4, in
 * document order, as `{ sections: [{ title, items: [{ image, caption }] }] }`.
 */
export function parsePatentSections(cfg, lookup) {
  return {
    sections: cfg.blocks.map(({ headingWidget, galleryWidget }) =>
      parsePatentSectionBlock(lookup(headingWidget), lookup(galleryWidget)),
    ),
  };
}

/** `parseFacilitiesTable` — row0 = `header` cells, remaining rows = `rows`. */
export function parseFacilitiesTable(widget) {
  const rows = parseTableRows(widget?.html);
  if (rows.length === 0) return { header: [], rows: [] };
  return {
    header: rows[0].map((cell) => cellText(cell)),
    rows: rows.slice(1).map((cells) => cells.map((cell) => cellText(cell))),
  };
}

/** `parseAboutCard` — a block-5 card text widget → `{ image, title, desc }`. */
export function parseAboutCard(html) {
  const runs = textRuns(html);
  const image = embedSrcs(html).find((embed) => embed.tag === "img")?.src ?? "";
  return { image, title: runs[0] ?? "", desc: runs.slice(1).join("\n") };
}

/** Widgets inside an arbitrary node (widget/col/row), in document order. */
function widgetsInNode(node) {
  const out = [];
  collectWidgets([node], out);
  return out;
}

/** A company.history era section: `side_left` whose aside carries an image. */
function isEraSection(section) {
  if (!/\bside_left\b/.test(section?.cls || "")) return false;
  const aside = [];
  if (section.aside) collectWidgets(section.aside.items ?? [], aside);
  return aside.some((widget) => widget.type === "image");
}

/** `parseEraLabel` — first run is the range, the rest is the tagline. */
export function parseEraLabel(html) {
  const runs = textRuns(html);
  return { range: runs[0] ?? "", tagline: runs.slice(1).join("\n") };
}

const YEAR_RE = /^\d{4}(?:\s*[-–~]\s*\d{4})?$/;

/**
 * `parseEraYears` — year heads open `{ year, items[] }`; every other run is an
 * item with its leading `· ` stripped. Warns (never fails) on an empty year or
 * an era whose year-head count diverges from the authored 5-year convention.
 */
export function parseEraYears(html) {
  const years = [];
  for (const run of textRuns(html)) {
    if (YEAR_RE.test(run)) {
      years.push({ year: run, items: [] });
    } else {
      const last = years[years.length - 1];
      // A run before any year head has nowhere to attach; drop it.
      if (last) last.items.push(run.replace(/^·\s*/, ""));
    }
  }
  for (const year of years) {
    if (year.items.length === 0) warnings.push(`era year ${year.year} has no items`);
  }
  if (years.length !== 5) warnings.push(`era has ${years.length} year heads (expected 5)`);
  return years;
}

/** `parseEraSection` — the label/years text widgets plus the aside image. */
export function parseEraSection(section) {
  const widgets = sectionWidgets(section);
  const yearsWidget =
    widgets.find((w) => w.type === "text" && typeof w.html === "string" && /<hr\b/i.test(w.html)) ?? null;
  const labelWidget =
    widgets.find(
      (w) =>
        w.type === "text" &&
        typeof w.html === "string" &&
        !/<hr\b/i.test(w.html) &&
        textRuns(w.html).length > 0,
    ) ?? null;
  const asideWidgets = [];
  if (section?.aside) collectWidgets(section.aside.items ?? [], asideWidgets);
  const imageWidget = asideWidgets.find((w) => w.type === "image") ?? null;
  return { yearsWidget, labelWidget, imageWidget };
}

/** `parseEraSection` → one `EraEntry` value. */
function parseEraEntry(section) {
  const { yearsWidget, labelWidget, imageWidget } = parseEraSection(section);
  const { range, tagline } = parseEraLabel(labelWidget?.html);
  return {
    range,
    tagline,
    image: typeof imageWidget?.src === "string" ? imageWidget.src : "",
    years: parseEraYears(yearsWidget?.html),
  };
}

/**
 * The company.global branches row: the row holding ≥ 2 columns whose subtree
 * contains an iframe (the HQ row holds only one). Returns the `RowNode` or null.
 */
export function findBranchRow(section) {
  for (const node of section?.rows ?? []) {
    if (!node || node.kind !== "row") continue;
    const iframeCols = (node.cols ?? []).filter((col) =>
      widgetsInNode(col).some(
        (w) => w.type === "text" && typeof w.html === "string" && /<iframe\b/i.test(w.html),
      ),
    );
    if (iframeCols.length >= 2) return node;
  }
  return null;
}

/**
 * `parseBranchCol` — the name text widget (badge/city/address runs) and the map
 * text widget (first iframe src) inside one branch column. Branch entries carry
 * empty contact fields (the contacts table only exists on the HQ item).
 */
export function parseBranchCol(col) {
  const widgets = widgetsInNode(col);
  const nameWidget =
    widgets.find(
      (w) => w.type === "text" && typeof w.html === "string" && !/<iframe\b/i.test(w.html),
    ) ?? null;
  const mapWidget =
    widgets.find(
      (w) => w.type === "text" && typeof w.html === "string" && /<iframe\b/i.test(w.html),
    ) ?? null;
  const runs = nameWidget ? textRuns(nameWidget.html) : [];
  if (runs.length !== 3) warnings.push(`branch col has ${runs.length} name runs (expected 3)`);
  const mapSrc = mapWidget
    ? (embedSrcs(mapWidget.html).find((embed) => embed.tag === "iframe")?.src ?? "")
    : "";
  return {
    nameWidget,
    mapWidget,
    location: {
      badge: runs[0] ?? "",
      city: runs[1] ?? "",
      address: runs[2] ?? "",
      phone: "",
      fax: "",
      email: "",
      mapSrc,
    },
  };
}

/** KO id of the company.global HQ section (fallback anchor). */
const HQ_SECTION_ID = "s20250828182272ec01906";

/**
 * `parseHqSection` — the company.global HQ section that precedes the branches
 * anchor: its name text widget (badge + address runs), its contacts table
 * (TEL/FAX/EMAIL positional runs) and its map iframe. `branchesSectionId` is the
 * section holding the branches row; the HQ is the section immediately before it
 * in `sections` (falling back to the known KO id). Returns `null` when neither
 * resolves.
 */
export function parseHqSection(sections, branchesSectionId) {
  const list = Array.isArray(sections) ? sections : [];
  const branchIndex = list.findIndex((section) => section && section.id === branchesSectionId);
  let hq = branchIndex > 0 ? list[branchIndex - 1] : null;
  // Guard the positional pick: the HQ section is the one carrying a contacts
  // table. Fall back to the KO id when the neighbour is not the HQ.
  const hasContacts = (section) =>
    sectionWidgets(section).some(
      (w) => w.type === "text" && typeof w.html === "string" && /<table\b/i.test(w.html),
    );
  if (!hq || !hasContacts(hq)) {
    hq = list.find((section) => section && section.id === HQ_SECTION_ID) ?? null;
  }
  if (!hq) return null;

  const widgets = sectionWidgets(hq);
  const nameWidget =
    widgets.find(
      (w) =>
        w.type === "text" &&
        typeof w.html === "string" &&
        !/<iframe\b/i.test(w.html) &&
        !/<table\b/i.test(w.html),
    ) ?? null;
  const contactsWidget =
    widgets.find(
      (w) => w.type === "text" && typeof w.html === "string" && /<table\b/i.test(w.html),
    ) ?? null;
  const mapWidget =
    widgets.find(
      (w) => w.type === "text" && typeof w.html === "string" && /<iframe\b/i.test(w.html),
    ) ?? null;

  // Authored name runs are `[chip, address]` (2) or `[badge, city, address]` (3+).
  const nameRuns = nameWidget ? textRuns(nameWidget.html) : [];
  const badge = nameRuns[0] ?? "";
  let city = "";
  let address = "";
  if (nameRuns.length >= 3) {
    city = nameRuns[1] ?? "";
    address = nameRuns[2] ?? "";
  } else {
    address = nameRuns[1] ?? "";
  }

  // Authored contacts runs are `["TEL", phone, "FAX", fax, "EMAIL", email]`.
  const contactRuns = contactsWidget ? textRuns(contactsWidget.html) : [];
  const phone = contactRuns[1] ?? "";
  const fax = contactRuns[3] ?? "";
  const email = contactRuns[5] ?? "";

  const mapSrc = mapWidget
    ? (embedSrcs(mapWidget.html).find((embed) => embed.tag === "iframe")?.src ?? "")
    : "";

  return {
    nameWidget,
    contactsWidget,
    mapWidget,
    location: { badge, city, address, phone, fax, email, mapSrc },
  };
}

function truncate(value, max) {
  const clean = stripZeroWidth(value);
  if (clean.length <= max) return clean;
  // Leave room for the single ellipsis. Prefer the last whitespace inside the
  // final 40% of the slice (a real word boundary); fall back to a hard cut for
  // scripts without spaces (CJK). `trimEnd` avoids a dangling " …".
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace !== -1 && lastSpace >= Math.ceil((max - 1) * 0.6)) {
    return slice.slice(0, lastSpace).trimEnd() + "…";
  }
  return slice.trimEnd() + "…";
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

/** Routes of every alias key that serves `key` (e.g. `company` → `company.ceo`). */
function aliasRoutesFor(key) {
  return Object.entries(PAGE_ALIASES)
    .filter(([, target]) => target === key)
    .map(([alias]) => routeForPageKey(alias));
}

function revalidateForPage(key) {
  return dedupe([routeForPageKey(key), ...aliasRoutesFor(key)].flatMap((route) => [
    localeHref("ko", route),
    localeHref("en", route),
  ]));
}

/**
 * Revalidate targets for the shared intro band: every route in its channel
 * (×2 locales), because editing the one canonical def re-renders all of them.
 */
function revalidateForSharedIntro(cfg) {
  const routes = Object.keys(PAGE_KEY_TO_ROUTE)
    .filter((key) => channelOf(key) === cfg.channel)
    .map((key) => routeForPageKey(key));
  return dedupe(routes.flatMap((route) => [localeHref("ko", route), localeHref("en", route)]));
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
    shared,
    gallery,
    techBlocks,
    koValue,
    enValue,
    // Optional exact-key override for section-less defs whose key does not follow
    // the `<pageKey>#<sectionId>/<widgetId>/<field>` shape (e.g. facilityTabs).
    key: keyOverride,
  } = entry;

  const key = keyOverride ?? `${pageKey}#${sectionId}/${widgetId}/${field}`;
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
    ...(shared ? { shared: true } : {}),
    ...(gallery ? { gallery } : {}),
    ...(techBlocks ? { techBlocks } : {}),
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
    // Alias keys (e.g. `company` → `company.ceo`) emit no defs of their own; the
    // target page owns the content. The alias JSON stays a crawl artifact.
    if (PAGE_ALIASES[pageKey]) continue;
    const group = groupForPageKey(pageKey);
    const revalidate = revalidateForPage(pageKey);

    const koPage = readJson(path.join(koDir, fileName));
    const enPath = path.join(enDir, fileName);
    const enPage = fs.existsSync(enPath) ? readJson(enPath) : null;
    if (!enPage) warnings.push(`no EN page for ${pageKey}; EN values omitted`);

    // home keeps its own footer section (SiteFooter renders it site-wide) and
    // has no page-title hero band; every other page drops the sections below.
    const dead = pageKey === "home" ? new Set() : deadSectionIds(koPage, pageKey);

    const pageSection = {
      ko: stripZeroWidth(koPage.title) || humanizePageKey(pageKey),
      en:
        stripZeroWidth(enPage?.title) ||
        stripZeroWidth(koPage.title) ||
        humanizePageKey(pageKey),
    };

    // Structured `eras`: the company.history era sections (side_left + aside
    // image). ONE page-level def is anchored at the first one.
    const koEraSections = (koPage.sections ?? []).filter(isEraSection);
    const enEraSections = (enPage?.sections ?? []).filter(isEraSection);

    // company.global HQ: its name/contacts/map text widgets are folded into the
    // ONE `locations` def (item 0), so they emit no per-widget defs of their own.
    // The HQ section is iterated BEFORE the branches section, so resolve its
    // widget ids up front.
    const locationHqWidgetIds = new Set();
    if (pageKey === "company.global") {
      const branchesSection = (koPage.sections ?? []).find((s) => findBranchRow(s));
      const hq = branchesSection ? parseHqSection(koPage.sections, branchesSection.id) : null;
      if (hq) {
        for (const widget of [hq.nameWidget, hq.contactsWidget, hq.mapWidget]) {
          if (widget) locationHqWidgetIds.add(widget.id);
        }
      }
    }

    // rnd.technology techFeatures: the THREE sections §4/§5/§6 fold into ONE
    // def anchored at §4. Every covered image/text widget across all three
    // sections must be skipped in the per-widget loop below, so collect their
    // ids page-wide up front.
    const techWidgetIds = new Set();
    if (pageKey === "rnd.technology") {
      for (const sectionId of TECH_FEATURE_BLOCKS.sections) {
        for (const { imageWidget, textWidget } of TECH_FEATURE_BLOCKS.bySection[sectionId].items) {
          techWidgetIds.add(imageWidget);
          techWidgetIds.add(textWidget);
        }
      }
    }

    for (let si = 0; si < (koPage.sections ?? []).length; si += 1) {
      const koSection = koPage.sections[si];
      // keep the EN index alignment: skip by position, not by filtering
      if (dead.has(koSection.id)) continue;
      const enSection = enPage?.sections?.[si];
      const section = sectionNameFor(koSection, enSection, pageSection, pageKey);
      // The shared intro band: only the canonical page's def is emitted, and it
      // revalidates every route in the channel (the renderer serves it on all).
      const sharedCfg = sharedIntroFor(pageKey);
      const sharedBand =
        !!sharedCfg &&
        pageKey === sharedCfg.canonicalPageKey &&
        isSharedIntroSection(koSection, sharedCfg);
      const sectionRevalidate = sharedBand ? revalidateForSharedIntro(sharedCfg) : revalidate;
      // the footer is shared chrome (SiteFooter renders it on every route), so
      // its defs live in their own `common` group instead of bloating `home`
      const sectionGroup =
        isFooterSection(koSection) || koSection.id === FOOTER_SECTION_ID ? "common" : group;
      const koWidgets = sectionWidgets(koSection);
      const enWidgets = enSection ? sectionWidgets(enSection) : [];

      // Positional KO↔EN pairing, ignoring contentless widget types (padding,
      // hr, code) so a decorative/skipped widget on one side cannot shift the
      // alignment of the editable widgets on the other. `enWidget` is then read
      // from this normalized map; the type guard still drops real mismatches.
      const koPaired = koWidgets.filter((w) => !PAIR_IGNORED_TYPES.has(w.type));
      const enPaired = enWidgets.filter((w) => !PAIR_IGNORED_TYPES.has(w.type));
      const pairMap = new Map();
      for (let pi = 0; pi < koPaired.length; pi += 1) {
        pairMap.set(koPaired[pi].id, enPaired[pi] ?? null);
      }

      // Chrome sections (code-only, or the mobile back-to-top overlay) emit
      // nothing: code and the back-to-top image are not admin-editable.
      if (isSkippedSection(koWidgets)) {
        const key = "back-to-top:skipped";
        unmappedWidgets[key] = (unmappedWidgets[key] ?? 0) + 1;
        continue;
      }

      // Structured `eras`: every widget inside an era section is covered by the
      // ONE page-level def anchored at the first era section.
      const eraIndex = koEraSections.indexOf(koSection);
      if (eraIndex >= 0) {
        if (eraIndex === 0) {
          mapEras({
            pageKey,
            group: sectionGroup,
            section,
            revalidate: sectionRevalidate,
            koSections: koEraSections,
            enSections: enEraSections,
          });
        }
        continue;
      }

      // Structured `locations`: the branches row's name/map widgets AND the HQ
      // section's name/contacts/map widgets are covered by ONE page-level def
      // anchored at the branches section (item 0 = HQ, items 1+ = branches).
      const branchRow = findBranchRow(koSection);
      const locationWidgetIds = new Set();
      if (branchRow) {
        for (const col of branchRow.cols ?? []) {
          const { nameWidget, mapWidget } = parseBranchCol(col);
          if (nameWidget) locationWidgetIds.add(nameWidget.id);
          if (mapWidget) locationWidgetIds.add(mapWidget.id);
        }
        mapLocations({
          pageKey,
          group: sectionGroup,
          sectionId: koSection.id,
          section,
          revalidate: sectionRevalidate,
          row: branchRow,
          enSection: enSection ?? null,
          koSections: koPage.sections ?? [],
          enSections: enPage?.sections ?? null,
        });
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

      // Block 5: the 6 card text widgets after the heading are covered by ONE
      // `aboutCards` def; their per-widget html + embedded img defs are skipped.
      const isAboutCards = pageKey === "company.about" && koSection.id === ABOUT_CARDS_SECTION;
      const aboutCardWidgetIds = new Set();
      if (isAboutCards) {
        const textWidgets = koWidgets.filter(
          (w) =>
            w.type === "text" &&
            typeof w.html === "string" &&
            w.html.trim().length > 0,
        );
        for (const widget of textWidgets.slice(1)) aboutCardWidgetIds.add(widget.id);
      }

      // Structured `techFeatures` (rnd.technology §4/§5/§6): ONE page-anchored
      // def with three FIXED item groups folds the configured image + text-table
      // widget pairs of all three sections; those widgets' per-widget image/lines
      // defs are skipped (ids collected page-wide above). Emitted once, while
      // walking §4 (block 0), so it keeps that section's document position and
      // revalidation; EN widget ids differ, so each EN block is parsed from the
      // section's positionally paired widgets.
      if (pageKey === "rnd.technology" && koSection.id === TECH_FEATURE_BLOCKS.sections[0]) {
        const tech = buildTechFeaturePayload(koPage, enPage);
        mapTechFeatures({
          pageKey,
          group: sectionGroup,
          sectionId: koSection.id,
          section,
          revalidate: sectionRevalidate,
          sections: tech.sections,
          koBlocks: tech.koBlocks,
          enBlocks: tech.enBlocks,
        });
      }

      // Structured `patentSections` (rnd.patents §4): ONE section-scoped def
      // folds the three heading + gallery2 groups; those widgets' legacy lines /
      // gallery defs are skipped.
      const isPatentSections =
        pageKey === "rnd.patents" && koSection.id === PATENT_SECTIONS.sectionId;
      const patentWidgetIds = new Set();
      if (isPatentSections) {
        mapPatentSections({
          pageKey,
          group: sectionGroup,
          sectionId: koSection.id,
          section,
          revalidate: sectionRevalidate,
          koValue: parsePatentSections(PATENT_SECTIONS, (id) => koWidgets.find((w) => w.id === id) ?? null),
          enValue: enSection
            ? parsePatentSections(PATENT_SECTIONS, (id) => pairMap.get(id) ?? null)
            : null,
        });
        for (const { headingWidget, galleryWidget } of PATENT_SECTIONS.blocks) {
          patentWidgetIds.add(headingWidget);
          patentWidgetIds.add(galleryWidget);
        }
      }

      // Structured `facilitiesTable` (rnd.facilities §5): each configured table
      // widget emits ONE widget-scoped def in its document position; its legacy
      // `lines` def is skipped.
      const facilitiesTableIds = new Set(
        koWidgets.filter((w) => FACILITIES_TABLES[w.id]).map((w) => w.id),
      );

      for (let wi = 0; wi < koWidgets.length; wi += 1) {
        const koWidget = koWidgets[wi];
        if (cardWidgetIds.has(koWidget.id)) continue;
        if (locationWidgetIds.has(koWidget.id)) continue;
        if (locationHqWidgetIds.has(koWidget.id)) continue;
        if (aboutCardWidgetIds.has(koWidget.id)) continue;
        if (techWidgetIds.has(koWidget.id)) continue;
        if (patentWidgetIds.has(koWidget.id)) continue;
        if (facilitiesTableIds.has(koWidget.id)) {
          const enTable = pairMap.get(koWidget.id) ?? null;
          addDef({
            pageKey,
            group: sectionGroup,
            sectionId: koSection.id,
            widgetId: koWidget.id,
            field: "facilitiesTable",
            kind: "facilitiesTable",
            label: { ko: LABELS.facilitiesTable.ko, en: LABELS.facilitiesTable.en },
            section,
            revalidate: sectionRevalidate,
            koValue: JSON.stringify(parseFacilitiesTable(koWidget)),
            enValue:
              enTable && enTable.type === "text"
                ? JSON.stringify(parseFacilitiesTable(enTable))
                : undefined,
          });
          continue;
        }
        let enWidget = pairMap.get(koWidget.id) ?? null;
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
          revalidate: sectionRevalidate,
          shared: sharedBand,
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
          enWidgets: enPaired,
          pairMap,
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

      if (isAboutCards) {
        mapAboutCards({
          pageKey,
          group: sectionGroup,
          sectionId: koSection.id,
          section,
          revalidate: sectionRevalidate,
          koWidgets,
          enWidgets: enPaired,
          pairMap,
        });
      }

      // rnd.facilities: ONE section-less `facilityTabs` def, emitted while
      // walking the tab block so it keeps that block's document position.
      if (pageKey === "rnd.facilities" && koSection.id === RND_FACILITIES_TABS_SECTION_ID) {
        mapFacilityTabs({ pageKey, group: sectionGroup, revalidate: sectionRevalidate });
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
  shared,
  koWidget,
  enWidget,
}) {
  const base = {
    pageKey,
    group,
    sectionId,
    widgetId: koWidget.id,
    revalidate,
    ...(shared ? { shared: true } : {}),
  };
  const type = koWidget.type;

  switch (type) {
    case "text": {
      const koHtml = typeof koWidget.html === "string" ? koWidget.html : undefined;
      const enHtml = enWidget && typeof enWidget.html === "string" ? enWidget.html : undefined;

      // Embedded media (<img>/<iframe> inside the widget html) comes FIRST so
      // its defs keep their document position; it is emitted even for
      // markup-only widgets (the footer logo, maps) that yield no text runs.
      const koEmbeds = embedSrcs(koHtml);
      const enEmbeds = embedSrcs(enHtml);
      for (const embed of koEmbeds) {
        // Block 8's fixed location pins are tiny inline <img>s (16px) — chrome,
        // not content — so they get no def. A larger inline image stays editable.
        if (embed.tag === "img" && embed.width != null && embed.width < 32) continue;
        const enEmbed = enEmbeds.find(
          (candidate) => candidate.tag === embed.tag && candidate.index === embed.index,
        );
        const img = embed.tag === "img";
        addWidgetDef(
          { ...base, field: `${embed.tag}[${embed.index}].src`,
            kind: img ? "image" : "embed",
            prefix: LABELS.embedSrc, section,
            koValue: embed.src, enValue: enEmbed?.src },
          img ? basename(embed.src) : truncate(embed.src, 40),
          enEmbed ? (img ? enBase(enEmbed.src) : enSnippet(enEmbed.src)) : undefined,
        );
      }

      const koRuns = textRuns(koHtml);
      // Markup-only text widgets (logo/structure html with no text nodes, e.g.
      // the footer logo or company.global address blocks) must NOT become
      // `lines` defs: the editor would have no lines to edit and a saved value
      // would replace the markup with plain text (Gate-2 F2). A widget that did
      // expose embedded media above is covered by those `img[n].src` /
      // `iframe[n].src` defs, so it is not reported as unmapped.
      if (koRuns.length === 0 && typeof koHtml === "string" && koHtml.includes("<")) {
        if (koEmbeds.length === 0) {
          const key = `${type}:markup-only`;
          unmappedWidgets[key] = (unmappedWidgets[key] ?? 0) + 1;
        }
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
      // Configured company.about / rnd.* blocks emit ONE structured `gallery`
      // def; all other galleries (incl. unconfigured rnd.*) keep the legacy
      // per-item defs. Section-level configs win over widget-level ones.
      const galleryCfg =
        ABOUT_MEDIA_BLOCKS[sectionId] ??
        RND_MEDIA_BLOCKS[sectionId] ??
        RND_MEDIA_WIDGET_BLOCKS[koWidget.id];
      if (galleryCfg) {
        const koValue = JSON.stringify(parseGalleryWidget(koWidget, galleryCfg));
        const enValue = enWidget
          ? JSON.stringify(parseGalleryWidget(enWidget, galleryCfg))
          : undefined;
        // The emitted config carries ONLY the runtime contract ({ fields,
        // maxItems }); generator-only keys (`label`, `skipEmpty`) are stripped.
        const emittedCfg = { fields: galleryCfg.fields };
        if (galleryCfg.maxItems !== undefined) emittedCfg.maxItems = galleryCfg.maxItems;
        addDef({
          ...base,
          widgetId: koWidget.id,
          field: "gallery",
          kind: "gallery",
          gallery: emittedCfg,
          label: galleryCfg.label ?? { ko: LABELS.galleryAbout.ko, en: LABELS.galleryAbout.en },
          section,
          koValue,
          enValue,
        });
        return;
      }

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
 * ONE `eras` def per history page, anchored at the first era section. The value
 * is a JSON array of `{ range, tagline, image, years: [{ year, items }] }`; the
 * runtime splices era sections (see `applyEras` in lib/content/merge.ts). EN
 * mirrors the EN era sections at the same indices.
 */
function mapEras({ pageKey, group, section, revalidate, koSections, enSections }) {
  if (koSections.length === 0) return;
  addDef({
    pageKey,
    group,
    sectionId: koSections[0].id,
    widgetId: "eras",
    field: "eras",
    kind: "eras",
    label: { ko: LABELS.eras.ko, en: LABELS.eras.en },
    section,
    revalidate,
    koValue: JSON.stringify(koSections.map(parseEraEntry)),
    enValue: enSections.length > 0 ? JSON.stringify(enSections.map(parseEraEntry)) : undefined,
  });
}

/**
 * ONE `locations` def for the company.global page. The value is a JSON array of
 * `{ badge, city, address, phone, fax, email, mapSrc }`: item 0 is the HQ slot,
 * items 1+ are the branch columns (see `applyLocations` in lib/content/merge.ts).
 * EN mirrors the EN HQ + branch columns at the same indices.
 */
function mapLocations({ pageKey, group, sectionId, section, revalidate, row, enSection, koSections, enSections }) {
  const koHq = parseHqSection(koSections, sectionId);
  const koLocations = [
    ...(koHq ? [koHq.location] : []),
    ...(row.cols ?? []).map((col) => parseBranchCol(col).location),
  ];
  const enRow = enSection ? findBranchRow(enSection) : null;
  const enHq = enSection ? parseHqSection(enSections, enSection.id) : null;
  const enLocations = enSection
    ? [
        ...(enHq ? [enHq.location] : []),
        ...(enRow ? enRow.cols.map((col) => parseBranchCol(col).location) : []),
      ]
    : null;
  addDef({
    pageKey,
    group,
    sectionId,
    widgetId: "locations",
    field: "locations",
    kind: "locations",
    label: { ko: LABELS.locations.ko, en: LABELS.locations.en },
    section,
    revalidate,
    koValue: JSON.stringify(koLocations),
    enValue:
      enLocations && enLocations.length > 0 ? JSON.stringify(enLocations) : undefined,
  });
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
function mapLocationCards({ pageKey, group, sectionId, section, revalidate, koWidgets, enWidgets, pairMap }) {
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
      const enWidget = pairMap.get(entry.widget.id) ?? null;
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
 * ONE `aboutCards` def for company.about block 5: the 6 card text widgets after
 * the heading become `[{ image, title, desc }]` (title = first run, desc = the
 * rest, image = the embedded <img> src). The EN value mirrors the EN section's
 * widgets at the same indices (positional pairing).
 */
function mapAboutCards({ pageKey, group, sectionId, section, revalidate, koWidgets, enWidgets, pairMap }) {
  const textEntries = koWidgets.filter(
    (widget) =>
      widget.type === "text" &&
      typeof widget.html === "string" &&
      widget.html.trim().length > 0,
  );
  const cardEntries = textEntries.slice(1); // first non-empty text = heading
  if (cardEntries.length === 0) return;

  const koValue = JSON.stringify(cardEntries.map((widget) => parseAboutCard(widget.html)));
  let enValue;
  if (enWidgets.length > 0) {
    const enCards = cardEntries.map((widget) => {
      const enWidget = pairMap.get(widget.id) ?? null;
      return enWidget && enWidget.type === "text"
        ? parseAboutCard(enWidget.html)
        : { image: "", title: "", desc: "" };
    });
    enValue = JSON.stringify(enCards);
  }

  addDef({
    pageKey,
    group,
    sectionId,
    widgetId: "aboutCards",
    field: "aboutCards",
    kind: "aboutCards",
    label: { ko: LABELS.cardsAbout.ko, en: LABELS.cardsAbout.en },
    section,
    revalidate,
    koValue,
    enValue,
  });
}

/**
 * Normalize `content/<locale>/facilities-tabs.json` to the runtime shape
 * `[{ name, images: string[] }]`: the crawl `id` is dropped and the `&quot;`
 * wrapping around image paths is stripped. Returns `null` when the file is
 * absent or malformed.
 */
function normalizeFacilityTabs(locale) {
  const file = path.join(CONTENT_ROOT, locale, "facilities-tabs.json");
  if (!fs.existsSync(file)) return null;
  const raw = readJson(file);
  if (!Array.isArray(raw)) return null;
  return raw.map((tab) => ({
    name: typeof tab?.name === "string" ? tab.name : "",
    images: Array.isArray(tab?.images)
      ? tab.images
          .filter((image) => typeof image === "string")
          // The crawl wraps paths in `&quot;`; strip the entity entirely so the
          // value is a bare `/images/...` path (not a quoted string).
          .map((image) => image.replace(/&quot;/g, ""))
      : [],
  }));
}

/**
 * ONE section-less `facilityTabs` def for rnd.facilities. The key is exactly
 * `rnd.facilities#facilityTabs/facilityTabs` (no section segment), so it is
 * passed via `addDef`'s key override. EN mirrors the EN file at the same
 * indices; the page falls back en→ko, so an absent EN file mirrors the KO value.
 */
function mapFacilityTabs({ pageKey, group, revalidate }) {
  const koTabs = normalizeFacilityTabs("ko");
  if (!koTabs) {
    warnings.push("no ko facilities-tabs.json; facilityTabs def omitted");
    return;
  }
  const enTabs = normalizeFacilityTabs("en");
  const koValue = JSON.stringify(koTabs);
  const label = { ko: LABELS.facilityTabs.ko, en: LABELS.facilityTabs.en };
  addDef({
    key: `${pageKey}#facilityTabs/facilityTabs`,
    pageKey,
    group,
    sectionId: "facilityTabs",
    widgetId: "facilityTabs",
    field: "facilityTabs",
    kind: "facilityTabs",
    label,
    section: label,
    revalidate,
    koValue,
    enValue: enTabs ? JSON.stringify(enTabs) : koValue,
  });
}

/**
 * ONE `techFeatures` def for rnd.technology, anchored at §4 (block 0). The value
 * is the v2 payload `{ blocks: [{ items: [{ image, heading, rows }] }, ...] }`
 * with exactly three fixed blocks; the def config carries the block→section
 * mapping (`techBlocks.sections`) so the applier never hardcodes crawl ids. The
 * key has no single widget segment, so it is passed explicitly.
 */
function mapTechFeatures({ pageKey, group, sectionId, section, revalidate, sections, koBlocks, enBlocks }) {
  const enComplete =
    Array.isArray(enBlocks) &&
    enBlocks.length === sections.length &&
    enBlocks.every((block) => block && Array.isArray(block.items) && block.items.length > 0);
  addDef({
    key: `${pageKey}#${sectionId}/techFeatures/techFeatures`,
    pageKey,
    group,
    sectionId,
    widgetId: "techFeatures",
    field: "techFeatures",
    kind: "techFeatures",
    label: { ko: LABELS.techFeatures.ko, en: LABELS.techFeatures.en },
    section,
    revalidate,
    techBlocks: { sections },
    koValue: JSON.stringify({ blocks: koBlocks }),
    enValue: enComplete ? JSON.stringify({ blocks: enBlocks }) : undefined,
  });
}

/**
 * ONE section-scoped `patentSections` def for rnd.patents §4. The value is
 * `{ sections: [{ title, items: [{ image, caption }] }] }`; the key has no single
 * widget segment, so it is passed explicitly.
 */
function mapPatentSections({ pageKey, group, sectionId, section, revalidate, koValue, enValue }) {
  addDef({
    key: `${pageKey}#${sectionId}/patentSections/patentSections`,
    pageKey,
    group,
    sectionId,
    widgetId: "patentSections",
    field: "patentSections",
    kind: "patentSections",
    label: { ko: LABELS.patentSections.ko, en: LABELS.patentSections.en },
    section,
    revalidate,
    koValue: JSON.stringify(koValue),
    enValue: enValue ? JSON.stringify(enValue) : undefined,
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

    // Board-only pages (e.g. products.eco-wave) can have an empty name; fall
    // back to a humanized slug so the admin section title is never blank.
    const boardNameKo = stripZeroWidth(koBoard.name) || humanizePageKey(slug);
    const boardNameEn =
      stripZeroWidth(enBoard?.name) ||
      stripZeroWidth(koBoard.name) ||
      humanizePageKey(slug);
    const section = { ko: boardNameKo, en: boardNameEn };

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
 * Global def order = admin page order: `Object.keys(PAGE_KEY_TO_ROUTE)` (the
 * nav/route order) followed by the board-only slugs. Within a page the emission
 * index preserves the crawled DOCUMENT ORDER of sections → widgets → fields.
 * The old lexicographic `pageKey` sort produced hash-ordered admin accordions
 * (e.g. company.global before company.history) unrelated to the rendered nav.
 */
const BOARD_ONLY_SLUGS = ["products.eco-wave", "products.clean-b", "products.flowell"];
const PAGE_ORDER = [...Object.keys(PAGE_KEY_TO_ROUTE), ...BOARD_ONLY_SLUGS];
const PAGE_RANK = new Map(PAGE_ORDER.map((key, index) => [key, index]));

function pageRank(pageKey) {
  return PAGE_RANK.has(pageKey) ? PAGE_RANK.get(pageKey) : PAGE_ORDER.length;
}

function sortDefs(list) {
  return [...list].sort((a, b) => {
    const rankA = pageRank(a.pageKey);
    const rankB = pageRank(b.pageKey);
    if (rankA !== rankB) return rankA - rankB;
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
  /** Rendered on every page of its channel from this one def (shared intro band). */
  shared?: boolean;
  /** Structured gallery block config: editable per-item fields + optional cap. */
  gallery?: { fields: ("image" | "title" | "desc")[]; maxItems?: number };
  /** Structured techFeatures block config: fixed block→section id mapping. */
  techBlocks?: { sections: string[] };
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
