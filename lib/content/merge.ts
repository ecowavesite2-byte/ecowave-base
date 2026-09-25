import type {
  BoardContent,
  BoardPost,
  LocationCard,
  Node,
  PageContent,
  Section,
  SiteData,
  TickerPicks,
  WidgetNode,
} from "../types";
import { resolvePairedSection, resolvePairedWidget } from "./pair";
import { extractRunSizes, injectTextRuns } from "./text-runs";

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
    case "title":
      // First styled run (e.g. a solutions card heading) — see `desc` below.
      widget.html = injectTextRuns(widget.html, value, { start: 0, end: 0 });
      return;
    case "desc":
      // Runs after the first (card body / section subtitle).
      widget.html = injectTextRuns(widget.html, value, { start: 1 });
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
/** One entry of a `slides` override payload (copy is big title + small subtitle). */
type SlideInput = { bg?: string | null; title?: string; subtitle?: string };

/** Parse a `slides` override payload; `null` when malformed (silent no-op). */
function parseSlides(value: string): SlideInput[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({
        bg: typeof entry.bg === "string" ? entry.bg : null,
        title: typeof entry.title === "string" ? entry.title : "",
        subtitle: typeof entry.subtitle === "string" ? entry.subtitle : "",
      }));
  } catch {
    return null;
  }
}

/** Parse a `cards` payload (location holder list); `null` when malformed. */
function parseCards(value: string): LocationCard[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({
        lines: Array.isArray(entry.lines)
          ? entry.lines.filter((line): line is string => typeof line === "string")
          : [],
      }));
  } catch {
    return null;
  }
}

/** Parse a `picks` payload (ticker board + post ids); `null` when malformed. */
function parsePicks(value: string): TickerPicks | null {
  try {
    const parsed = JSON.parse(value) as { board?: unknown; idxs?: unknown };
    const board = parsed?.board === "notices" ? "notices" : parsed?.board === "news" ? "news" : null;
    const idxs = Array.isArray(parsed?.idxs)
      ? parsed.idxs.filter((idx): idx is string => typeof idx === "string" || typeof idx === "number").map(String)
      : [];
    if (!board || idxs.length === 0) return null;
    return { board, idxs };
  } catch {
    return null;
  }
}

/**
 * Split the authored slide runs into big (title, font-size >= 40px) and small
 * (subtitle) copy, then inject each part into its own runs.
 *
 * Subtitle is injected FIRST: the title pass may clear the non-title runs it
 * spans, which shifts the run indices a later pass would see. Injecting the
 * subtitle into the intact template (then the title, whose range ends before
 * the subtitle runs) keeps both placements stable.
 */
function applySlideText(template: string, title: string, subtitle: string): string {
  const sizes = extractRunSizes(template);
  let split = sizes.findIndex((size) => size < 40);
  if (split === -1) split = Math.max(1, sizes.length);
  if (split === 0) split = 1;
  const withSubtitle = injectTextRuns(template, subtitle, { start: split });
  return injectTextRuns(withSubtitle, title, { start: 0, end: Math.max(0, split - 1) });
}

/**
 * Replace a section's hero slide list from a parsed `slides` override. The
 * authored slide at the same index supplies the styled markup (`title` /
 * `subtitle` values are plain text or inline HTML); slides added beyond the
 * authored list reuse the last authored slide's styling, and `bgColor` is
 * preserved per authored index.
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
      html: applySlideText(template, slide.title ?? "", slide.subtitle ?? ""),
    };
  });
}

/** A node plus the sibling array that contains it (its insertion parent). */
interface NodePlace {
  node: Node;
  parentArray: Node[];
  index: number;
}

/** A widget together with its ancestor chain (root → immediate parent). */
interface LocatedWidget {
  widget: WidgetNode;
  path: NodePlace[];
}

/** Collect every widget in document order (rows → cols → children) with ancestors. */
function collectLocatedWidgets(nodes: Node[] | undefined, out: LocatedWidget[]): void {
  const walk = (list: Node[] | undefined, path: NodePlace[]): void => {
    if (!Array.isArray(list)) return;
    for (let index = 0; index < list.length; index += 1) {
      const node = list[index];
      if (!node || typeof node !== "object") continue;
      const place: NodePlace = { node, parentArray: list, index };
      if (node.kind === "widget") {
        out.push({ widget: node, path });
      } else if (node.kind === "col") {
        walk(node.children, [...path, place]);
      } else if (node.kind === "row") {
        walk(node.cols, [...path, place]);
      }
    }
  };
  walk(nodes, []);
}

/** Apply `fn` to every widget inside `node` (itself included). */
function forEachWidget(node: Node, fn: (widget: WidgetNode) => void): void {
  if (!node || typeof node !== "object") return;
  if (node.kind === "widget") {
    fn(node);
    return;
  }
  if (node.kind === "col") {
    for (const child of node.children ?? []) forEachWidget(child, fn);
    return;
  }
  if (node.kind === "row") {
    for (const col of node.cols ?? []) forEachWidget(col, fn);
  }
}

/** Number of widgets inside a subtree (used to find a single-card block). */
function countWidgets(node: Node): number {
  let count = 0;
  forEachWidget(node, () => {
    count += 1;
  });
  return count;
}

/** True for a padding widget or a `row` whose widgets are all padding. */
function isPaddingOnly(node: Node | undefined): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.kind === "widget") return node.type === "padding";
  if (node.kind !== "row") return false;
  const widgets: WidgetNode[] = [];
  forEachWidget(node, (widget) => widgets.push(widget));
  return widgets.length > 0 && widgets.every((widget) => widget.type === "padding");
}

/**
 * The nearest ancestor block wrapping exactly one widget. For the locations
 * layout that is the card's own `row`: an inner `col` also holds just the card,
 * but cloning a column would place the duplicate BESIDE the original, whereas
 * cloning the `row` stacks it. `null` marks a shape we cannot restructure.
 */
function findCardBlock(entry: LocatedWidget): NodePlace | null {
  for (let i = entry.path.length - 1; i >= 0; i -= 1) {
    const place = entry.path[i];
    if (place.node.kind === "row" && countWidgets(place.node) === 1) return place;
  }
  return null;
}

/** Give every widget inside a cloned block a unique id (`<id>__card<i>`). */
function rewriteWidgetIds(node: Node, index: number): void {
  forEachWidget(node, (widget) => {
    const base = typeof widget.id === "string" && widget.id.length > 0 ? widget.id : "card";
    widget.id = `${base}__card${index}`;
  });
}

/** Inject one card's lines into the single text widget of a cloned block. */
function injectCloneLines(node: Node, lines: string[]): void {
  const widgets: WidgetNode[] = [];
  forEachWidget(node, (widget) => widgets.push(widget));
  const card = widgets.find((widget) => widget.type === "text") ?? widgets[0];
  if (card) card.html = injectTextRuns(card.html, lines.join("\n"));
}

/**
 * Restructure an already-deep-cloned section so it renders EXACTLY
 * `cards.length` location cards (rendering stays generic — no component knows
 * about this). The section tree is edited in place (the caller owns the clone):
 *
 *  - the first non-empty `text` widget is the heading; the `text` widgets after
 *    it are the cards (locations layout: one card per `row > col > widget`);
 *  - existing cards re-inject their lines into the authored markup;
 *  - extra cards deep-clone the LAST card's block, rewrite every widget id
 *    (`<id>__card<i>`) and stack it immediately after the last card;
 *  - missing cards remove the extra blocks plus an adjacent padding-only block
 *    (following sibling first, else preceding) so no dangling separator remains;
 *  - no card widgets / unknown shapes: only `section.cards` is set, nothing else.
 *
 * Overrides must never break rendering, so this never throws.
 */
export function applyCards(section: Section, cards: LocationCard[]): void {
  try {
    if (!section || !Array.isArray(cards)) return;
    section.cards = cards;
    if (cards.length === 0) return;

    const located: LocatedWidget[] = [];
    collectLocatedWidgets(section.rows, located);

    const textWidgets = located.filter((entry) => entry.widget.type === "text");
    const heading = textWidgets.findIndex(
      (entry) => typeof entry.widget.html === "string" && entry.widget.html.trim().length > 0,
    );
    if (heading < 0) return;

    const cardEntries = textWidgets.slice(heading + 1);
    if (cardEntries.length === 0) return;

    const blocks = cardEntries.map((entry) => findCardBlock(entry));
    const common = Math.min(cards.length, cardEntries.length);

    for (let i = 0; i < common; i += 1) {
      const widget = cardEntries[i].widget;
      widget.html = injectTextRuns(widget.html, cards[i].lines.join("\n"));
    }

    if (cards.length > cardEntries.length) {
      const template = blocks[cardEntries.length - 1];
      if (!template) return;
      let insertAt = template.index + 1;
      for (let i = cardEntries.length; i < cards.length; i += 1) {
        const clone = deepClone(template.node);
        rewriteWidgetIds(clone, i);
        injectCloneLines(clone, cards[i].lines);
        template.parentArray.splice(insertAt, 0, clone);
        insertAt += 1;
      }
      return;
    }

    if (cards.length < cardEntries.length) {
      for (let i = cardEntries.length - 1; i >= cards.length; i -= 1) {
        const place = blocks[i];
        if (!place) continue;
        const index = place.parentArray.indexOf(place.node);
        if (index < 0) continue;
        place.parentArray.splice(index, 1);
        // Drop an adjacent padding-only block so no dangling separator remains.
        if (isPaddingOnly(place.parentArray[index])) {
          place.parentArray.splice(index, 1);
        } else if (isPaddingOnly(place.parentArray[index - 1])) {
          place.parentArray.splice(index - 1, 1);
        }
      }
    }
  } catch {
    // Overrides must never break rendering.
  }
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

    // Location card list (`<page>#<sectionId>/cards/cards`): a data-driven card
    // list the renderer uses INSTEAD of the crawled holder widgets.
    if (parsed.field === "cards" && parsed.widgetId === "cards") {
      const section = resolvePairedSection(clone, parsed, options.primaryPage ?? null);
      const cards = section ? parseCards(value) : null;
      if (section && cards) {
        applyCards(section, cards);
        section.cards = cards;
      }
      continue;
    }

    // Ticker post picks (`<page>#<sectionId>/picks/picks`): board + post ids.
    if (parsed.field === "picks" && parsed.widgetId === "picks") {
      const section = resolvePairedSection(clone, parsed, options.primaryPage ?? null);
      const picks = section ? parsePicks(value) : null;
      if (section && picks) section.picks = picks;
      continue;
    }

    const widget = resolvePairedWidget(clone, parsed, options.primaryPage ?? null);
    if (!widget) continue;

    // Kind-aware `html` contract (Gate-2 F4): a `lines` value is always plain
    // text injected into the styled markup (so text like "pH < 7" is escaped,
    // not treated as HTML); `textarea` (code) and `overlay` (image alt markup)
    // are raw HTML. Unknown kinds keep the legacy heuristic.
    const kind = options.kinds?.[key];
    const rawHtml =
      kind === "overlay" || kind === "textarea"
        ? true
        : kind === "lines"
          ? false
          : value.includes("<");

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
