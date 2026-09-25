import type { BoardContent, BoardPost, PageContent, Section, SiteData, WidgetNode } from "../types";
import { resolvePairedSection, resolvePairedWidget } from "./pair";
import { injectTextRuns } from "./text-runs";

/**
 * Pure override application.
 *
 * Registry keys look like `<pageKey>#<sectionId>/<widgetId>/<field>` and are
 * produced by `scripts/gen-content-registry.mjs` (see `lib/content/registry.ts`).
 * These helpers are dependency-free (no fs, no Prisma, no React) so they can run
 * on the server, in tests, and in client islands alike. Unknown or malformed
 * keys are ignored silently — overrides must never break rendering.
 */

export interface RegistryKeyParts {
  pageKey: string;
  sectionId: string;
  widgetId: string;
  field: string;
}

/** Gallery item field, e.g. `items[2].title`. */
const GALLERY_FIELD = /^items\[(\d+)\]\.(title|desc|org|thumb)$/;
/** Site nav top-level item, e.g. `nav[0]`. */
const NAV_ITEM = /^nav\[(\d+)\]$/;
/** Site nav child item, e.g. `nav[0].children[2]`. */
const NAV_CHILD = /^nav\[(\d+)\]\.children\[(\d+)\]$/;

/**
 * Parse a registry key. Returns `null` for anything that does not match the
 * three-segment `<pageKey>#<sectionId>/<widgetId>/<field>` shape.
 *
 * Known shapes handled:
 *  - `<page>#<sId>/<wId>/html|src|alt|text|href`
 *  - `<page>#<sId>/<wId>/items[<n>].title|desc|org|thumb`
 *  - `<board>#board/<slug>/name` and `<board>#board/<slug>/posts`
 *  - `site#nav/nav[<i>]/name` and `site#nav/nav[<i>].children[<j>]/name`
 */
export function parseRegistryKey(key: string): RegistryKeyParts | null {
  if (typeof key !== "string") return null;

  const hash = key.indexOf("#");
  if (hash <= 0) return null;

  const pageKey = key.slice(0, hash);
  const parts = key.slice(hash + 1).split("/");
  if (parts.length !== 3) return null;

  const [sectionId, widgetId, field] = parts;
  if (!sectionId || !widgetId || !field) return null;

  return { pageKey, sectionId, widgetId, field };
}

/** `PageContent.key` uses slash form (`company/ceo`); registry keys use dots. */
function pageKeyOf(page: PageContent): string | null {
  const raw = typeof page.key === "string" ? page.key : "";
  return raw ? raw.replace(/\//g, ".") : null;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Apply one scalar/gallery field in place (caller owns the clone).
 *
 * `target` is a widget node or a hero slide (`visual[i]`); fields not valid for
 * the resolved target are ignored.
 */
function applyWidgetField(widget: WidgetNode, field: string, value: string, rawHtml: boolean): void {
  switch (field) {
    case "html":
      // `lines` fields are PLAIN TEXT: inject the value into the widget's
      // existing styled markup so admins edit copy while styles stay fixed.
      // `textarea` (code) fields are raw HTML and apply verbatim; the caller
      // decides which contract applies via `rawHtml` (Gate-2 F4).
      widget.html = rawHtml ? value : injectTextRuns(widget.html, value);
      return;
    case "src":
      widget.src = value;
      return;
    case "alt":
      widget.alt = value;
      return;
    case "text":
      widget.text = value;
      return;
    case "href":
      widget.href = value;
      return;
    default:
      break;
  }

  const match = GALLERY_FIELD.exec(field);
  if (!match) return;

  const index = Number(match[1]);
  const prop = match[2] as "title" | "desc" | "org" | "thumb";
  const items = widget.items;
  if (!Array.isArray(items) || index < 0 || index >= items.length) return;

  const item = items[index];
  if (!item) return;

  if (prop === "title") item.title = value;
  else if (prop === "desc") item.desc = value;
  else if (prop === "org") item.org = value;
  else item.thumb = value;
}

/**
 * Return a deep-cloned page with the targeted registry fields replaced.
 *
 * The input page is never mutated; every structure, id and style not named by an
 * override is preserved exactly. `locale` is accepted for API symmetry (callers
 * load locale-scoped overrides); it does not affect the merge.
 */
/** One entry of a `slides` override payload. */
type SlideInput = { bg?: string | null; html?: string };

/** Parse a `slides` override payload; `null` when malformed (silent no-op). */
function parseSlides(value: string): SlideInput[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({
        bg: typeof entry.bg === "string" ? entry.bg : null,
        html: typeof entry.html === "string" ? entry.html : "",
      }));
  } catch {
    return null;
  }
}

/**
 * Replace a section's hero slide list from a parsed `slides` override. The
 * authored slide at the same index supplies the styled markup (`html` values are
 * plain text); slides added beyond the authored list reuse the last authored
 * slide's styling, and `bgColor` is preserved per authored index.
 *
 * Reorder maps the template by POSITION, not identity: the EN authored slide 2
 * has slightly different markup (no font classes), so moving slides re-injects
 * the text into the destination template — accepted (Gate-2 F5).
 */
function applySlides(section: Section, slides: SlideInput[]): void {
  // Never blank the hero: the UI prevents removing the last slide, but an API
  // caller (or a stored legacy row) could send `[]` (Gate-2 F3).
  if (slides.length === 0) return;
  const original = Array.isArray(section.visual) ? section.visual : [];
  section.visual = slides.map((slide, index) => {
    const template = original[index]?.html ?? original[original.length - 1]?.html ?? "";
    return {
      bg: slide.bg ?? null,
      bgColor: original[index]?.bgColor ?? null,
      html: injectTextRuns(template, slide.html ?? ""),
    };
  });
}

/** Optional context for locale pairing (see `./pair`). */
export interface ApplyPageOptions {
  /**
   * The KO (primary) tree the registry keys were generated from. Required to
   * pair target widgets in a non-primary locale; ignored on the ko fast path.
   */
  primaryPage?: PageContent | null;
  /**
   * Override key → registry kind (`lines`, `textarea`, `image`, `slides`, …).
   * The applier needs it for the `html` contract: `lines` values are ALWAYS
   * injected as plain text, `textarea` values are raw HTML. Without a map the
   * legacy `value.includes("<")` heuristic is used (Gate-2 F4).
   */
  kinds?: Record<string, string>;
}

/**
 * Return a deep-cloned page with the targeted registry fields replaced.
 *
 * The input page is never mutated; every structure, id and style not named by an
 * override is preserved exactly. Widgets are resolved via `resolvePairedWidget`:
 * id first (ko), then positional pairing against `options.primaryPage` so EN
 * overrides land on the structurally paired EN widget.
 */
export function applyPageOverrides<T extends PageContent>(
  page: T,
  overrides: Record<string, string>,
  locale: "ko" | "en",
  options: ApplyPageOptions = {},
): T {
  void locale;
  const clone = deepClone(page);

  const expectedPageKey = pageKeyOf(clone);

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (typeof value !== "string") continue;

    const parsed = parseRegistryKey(key);
    if (!parsed) continue;
    // Board/site keys (and other pages) address different documents.
    if (expectedPageKey && parsed.pageKey !== expectedPageKey) continue;

    // Hero slide list (`<page>#<sectionId>/visual/slides`): replaces the whole
    // `section.visual` array instead of one widget field.
    if (parsed.field === "slides" && parsed.widgetId === "visual") {
      const section = resolvePairedSection(clone, parsed, options.primaryPage ?? null);
      const slides = section ? parseSlides(value) : null;
      if (section && slides) applySlides(section, slides);
      continue;
    }

    const widget = resolvePairedWidget(clone, parsed, options.primaryPage ?? null);
    if (!widget) continue;

    // Kind-aware `html` contract (Gate-2 F4): a `lines` value is always plain
    // text injected into the styled markup (so text like "pH < 7" is escaped,
    // not treated as HTML); `textarea` is raw HTML. Unknown kinds keep the
    // legacy heuristic.
    const kind = options.kinds?.[key];
    const rawHtml =
      kind === "lines" ? false : kind === "textarea" ? true : value.includes("<");

    applyWidgetField(widget, parsed.field, value, rawHtml);  }

  return clone;
}

/**
 * Return a deep-cloned `site.json` with nav labels replaced. Only
 * `site#nav/nav[i]/name` and `site#nav/nav[i].children[j]/name` are honoured;
 * every other key is skipped. The input is never mutated.
 */
export function applySiteOverrides<T extends SiteData>(
  site: T,
  overrides: Record<string, string>,
  locale: "ko" | "en",
): T {
  void locale;
  const clone = deepClone(site);
  const nav = clone.nav;

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (typeof value !== "string") continue;

    const parsed = parseRegistryKey(key);
    if (!parsed) continue;
    if (parsed.pageKey !== "site" || parsed.sectionId !== "nav" || parsed.field !== "name") {
      continue;
    }

    const top = NAV_ITEM.exec(parsed.widgetId);
    if (top) {
      const index = Number(top[1]);
      const item = nav?.[index];
      if (item) item.name = value;
      continue;
    }

    const child = NAV_CHILD.exec(parsed.widgetId);
    if (child) {
      const index = Number(child[1]);
      const childIndex = Number(child[2]);
      const childItem = nav?.[index]?.children?.[childIndex];
      if (childItem) childItem.name = value;
    }
  }

  return clone;
}

/** Options for `applyBoardOverrides`. */
export interface ApplyBoardOptions {
  /** Admin label used when there is no stored name override (crawled names are unreliable). */
  fallbackName?: string;
  /** Replacement post list from `board_post`; `null`/empty keeps the crawled defaults. */
  posts?: BoardPost[] | null;
}

/**
 * Return a deep-cloned board with its `page_content` name override and/or the
 * `board_post` collection applied. Posts are a COLLECTION override: a non-empty
 * `options.posts` replaces the default list entirely (no per-post merge), so
 * delete/reorder are natural; zero stored rows keep the crawled defaults.
 */
export function applyBoardOverrides<T extends BoardContent>(
  board: T,
  overrides: Record<string, string>,
  slug: string,
  options: ApplyBoardOptions = {},
): T {
  const clone = deepClone(board);

  const stored = overrides?.[`${slug}#board/${slug}/name`];
  if (typeof stored === "string" && stored.trim().length > 0) {
    clone.name = stored;
  } else if (options.fallbackName) {
    clone.name = options.fallbackName;
  }

  if (options.posts && options.posts.length > 0) {
    clone.posts = options.posts;
    clone.count = options.posts.length;
  }

  return clone;
}
