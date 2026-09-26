import type {
  BoardContent,
  BoardPost,
  ColNode,
  EraEntry,
  EraYear,
  GalleryBlockConfig,
  GlobalLocation,
  LocationCard,
  Node,
  PageContent,
  RowNode,
  Section,
  SiteData,
  StructuredMediaItem,
  TickerPicks,
  WidgetNode,
} from "../types";
import { resolvePairedSection, resolvePairedWidget } from "./pair";
import { extractRunSizes, injectTextRuns, extractTextRuns } from "./text-runs";

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
/** Embedded media src inside a `text` widget html, e.g. `img[0].src`. */
const EMBED_FIELD = /^(img|iframe)\[(\d+)\]\.src$/;
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
 * Replace the `src` of the nth `<tag>` (img/iframe) inside `html`, preserving
 * every other tag/style. An empty value is a no-op (never blanks an embed), and
 * a missing nth tag leaves the html untouched. Mirrors the `img[n].src` /
 * `iframe[n].src` field shape emitted by scripts/gen-content-registry.mjs.
 */
function replaceNthSrc(html: string | null | undefined, tag: string, n: number, value: string): string {
  const source = String(html ?? "");
  if (!value) return source; // empty = no-op, never blank a src
  const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  let i = -1;
  return source.replace(re, (m) => {
    i += 1;
    if (i !== n) return m;
    return m.replace(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ` src="${value}"`);
  });
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

  const embed = EMBED_FIELD.exec(field);
  if (embed) {
    widget.html = replaceNthSrc(widget.html, embed[1], Number(embed[2]), value);
    return;
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
    const slides: SlideInput[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const slide = entry as { bg?: unknown; title?: unknown; subtitle?: unknown };
      // A slide without a string title is garbage (only reachable by direct DB
      // inserts — the API validator requires one); no-op rather than blank copy.
      if (typeof slide.title !== "string") return null;
      if (slide.bg !== undefined && slide.bg !== null && typeof slide.bg !== "string") return null;
      if (slide.subtitle !== undefined && typeof slide.subtitle !== "string") return null;
      slides.push({
        bg: typeof slide.bg === "string" ? slide.bg : null,
        title: slide.title,
        subtitle: typeof slide.subtitle === "string" ? slide.subtitle : "",
      });
    }
    return slides;
  } catch {
    return null;
  }
}

/** Parse a `cards` payload (location holder list); `null` when malformed. */
function parseCards(value: string): LocationCard[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const cards: LocationCard[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const lines = (entry as { lines?: unknown }).lines;
      // Require the real shape: a missing/non-string `lines` must not silently
      // clear a card (direct-DB inserts only; the API validator requires it).
      if (!Array.isArray(lines) || !lines.every((line) => typeof line === "string")) return null;
      cards.push({ lines });
    }
    return cards;
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
 *  - no card widgets / unknown shapes: no-op (the crawled layout stays).
 *
 * Overrides must never break rendering, so this never throws.
 */
export function applyCards(section: Section, cards: LocationCard[]): void {
  try {
    if (!section || !Array.isArray(cards)) return;
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

/* ---------------- structured kinds: eras + locations ---------------- */

/** Parse an `eras` payload; `null` when malformed/empty. */
function parseEras(value: string): EraEntry[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const eras: EraEntry[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const era = entry as {
        range?: unknown;
        tagline?: unknown;
        image?: unknown;
        years?: unknown;
      };
      if (typeof era.range !== "string") return null;
      if (typeof era.tagline !== "string") return null;
      if (typeof era.image !== "string") return null;
      if (!Array.isArray(era.years)) return null;
      const years: EraYear[] = [];
      for (const yearEntry of era.years) {
        if (!yearEntry || typeof yearEntry !== "object" || Array.isArray(yearEntry)) return null;
        const year = yearEntry as { year?: unknown; items?: unknown };
        if (typeof year.year !== "string") return null;
        if (!Array.isArray(year.items) || !year.items.every((item) => typeof item === "string")) {
          return null;
        }
        years.push({ year: year.year, items: year.items as string[] });
      }
      eras.push({ range: era.range, tagline: era.tagline, image: era.image, years });
    }
    return eras;
  } catch {
    return null;
  }
}

/** Parse a `locations` payload; `null` when malformed/empty. */
function parseLocations(value: string): GlobalLocation[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const locations: GlobalLocation[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const location = entry as {
        badge?: unknown;
        city?: unknown;
        address?: unknown;
        phone?: unknown;
        fax?: unknown;
        email?: unknown;
        mapSrc?: unknown;
      };
      if (typeof location.badge !== "string") return null;
      if (typeof location.city !== "string") return null;
      if (typeof location.address !== "string") return null;
      if (typeof location.mapSrc !== "string") return null;
      // Pre-upgrade payloads have no contact fields; normalize to "".
      const phone = location.phone === undefined ? "" : location.phone;
      const fax = location.fax === undefined ? "" : location.fax;
      const email = location.email === undefined ? "" : location.email;
      if (typeof phone !== "string" || typeof fax !== "string" || typeof email !== "string") {
        return null;
      }
      locations.push({
        badge: location.badge,
        city: location.city,
        address: location.address,
        phone,
        fax,
        email,
        mapSrc: location.mapSrc,
      });
    }
    return locations;
  } catch {
    return null;
  }
}

/** Every widget of a section (rows → cols, then aside) in document order. */
function sectionWidgetList(section: Section): WidgetNode[] {
  const out: WidgetNode[] = [];
  for (const node of section.rows ?? []) forEachWidget(node, (widget) => out.push(widget));
  if (section.aside) {
    for (const node of section.aside.items ?? []) forEachWidget(node, (widget) => out.push(widget));
  }
  return out;
}

/** Every widget inside an arbitrary node (mirrors `forEachWidget`). */
function nodeWidgets(node: Node): WidgetNode[] {
  const out: WidgetNode[] = [];
  forEachWidget(node, (widget) => out.push(widget));
  return out;
}

/** Escape `&`, `<`, `>` for the rebuilt years markup (text nodes only). */
function escapeEraText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wrapper of the authored years html: prefix before the content div + suffix. */
const YEARS_WRAPPER = /^([\s\S]*?<div class="text-table\s*"><div>)([\s\S]*)(<\/div><\/div>[\s\S]*)$/;

/**
 * Rebuild a years widget's html from a fixed template (the authored 30px year
 * head + 18px `· item` lines), preserving the outer `text-table` wrapper. Used
 * only when the run count changes (a text injection cannot express that).
 * Returns `null` when the wrapper does not match (leave the html untouched).
 */
function buildYearsHtml(templateHtml: string, years: EraYear[]): string | null {
  const match = YEARS_WRAPPER.exec(String(templateHtml ?? ""));
  if (!match) return null;
  const [, prefix, , suffix] = match;
  const head = (year: string) =>
    `<hr><h6><strong><span style="color: rgb(57, 112, 235); font-size: 30px;">${escapeEraText(year)}</span></strong></h6>`;
  const item = (text: string) =>
    `<p style="line-height: 2;"><span style="font-size: 18px; line-height: 2;">· ${escapeEraText(text)}</span></p>`;
  const gap = `<p style="line-height: 2;"><br></p>`;
  const body = years.map((year) => head(year.year) + year.items.map(item).join("") + gap).join("");
  return prefix + body + suffix;
}

/** Apply one `EraEntry` to one era section in place (label / years / image). */
function applyEraOne(section: Section, entry: EraEntry): void {
  const widgets = sectionWidgetList(section);
  const label =
    widgets.find(
      (w) => w.type === "text" && typeof w.html === "string" && !/<hr\b/i.test(w.html),
    ) ?? null;
  const years =
    widgets.find((w) => w.type === "text" && typeof w.html === "string" && /<hr\b/i.test(w.html)) ??
    null;
  const asideWidgets: WidgetNode[] = [];
  if (section.aside) {
    for (const node of section.aside.items ?? []) forEachWidget(node, (w) => asideWidgets.push(w));
  }
  const image = asideWidgets.find((w) => w.type === "image") ?? null;

  if (label) {
    // Keep the authored run boundaries: the tagline is the label runs after the
    // range joined by `\n` (a `fr-marker` span fragments the design lines).
    const desired = [entry.range, ...entry.tagline.split(/\r?\n/)].join("\n");
    if (desired !== extractTextRuns(label.html).join("\n")) {
      label.html = injectTextRuns(label.html, desired);
    }
  }

  if (years) {
    const flat = entry.years.flatMap((year) => [
      year.year,
      ...year.items.map((item) => "· " + item),
    ]);
    const current = extractTextRuns(years.html);
    if (flat.join("\n") !== current.join("\n")) {
      if (flat.length === current.length) {
        years.html = injectTextRuns(years.html, flat.join("\n"));
      } else {
        const rebuilt = buildYearsHtml(years.html ?? "", entry.years);
        if (rebuilt !== null) years.html = rebuilt;
      }
    }
  }

  if (image && entry.image && image.src !== entry.image) {
    image.src = entry.image;
    // An admin-replaced photo opts out of the curated portrait mobile swap.
    image.mobileSrc = false;
  }
}

/** A company.history era section: `side_left` with a non-empty aside. */
function isEraSection(section: Section): boolean {
  if (!/\bside_left\b/.test(section.cls || "")) return false;
  return Array.isArray(section.aside?.items) && section.aside.items.length > 0;
}

/** True for a separator section: no aside and only padding/hr widgets. */
function isSpacerSection(section: Section | undefined): boolean {
  if (!section || section.aside) return false;
  const widgets = sectionWidgetList(section);
  return widgets.length > 0 && widgets.every((w) => w.type === "padding" || w.type === "hr");
}

/** Give every widget inside a cloned node a unique id (`<id><suffix>`). */
function rewriteNodeIds(node: Node, suffix: string): void {
  forEachWidget(node, (widget) => {
    const base = typeof widget.id === "string" && widget.id.length > 0 ? widget.id : "w";
    widget.id = `${base}${suffix}`;
  });
}

/** Give every widget inside a cloned section a unique id (`<id><suffix>`). */
function rewriteSectionWidgetIds(section: Section, suffix: string): void {
  for (const node of section.rows ?? []) rewriteNodeIds(node, suffix);
  if (section.aside) {
    for (const node of section.aside.items ?? []) rewriteNodeIds(node, suffix);
  }
}

/**
 * Restructure an already-deep-cloned page so its history timeline renders
 * EXACTLY `eras.length` era blocks (replace-in-place, then remove trailing eras
 * / append clones). Era sections are found structurally (`side_left` + aside).
 * Applied LAST (after the widget loop) so section splicing never shifts the
 * positional pairing of other keys. Never throws.
 */
export function applyEras(sections: Section[], anchor: Section, eras: EraEntry[]): void {
  try {
    if (!Array.isArray(sections) || !anchor || !Array.isArray(eras) || eras.length === 0) return;
    const eraSections = sections.filter(isEraSection);
    if (eraSections.length === 0 || !eraSections.includes(anchor)) return;

    for (const section of eraSections) {
      section.cls = `${section.cls || ""} era_section`.trim();
    }

    const n = eraSections.length;
    const m = eras.length;
    const common = Math.min(m, n);
    for (let i = 0; i < common; i += 1) applyEraOne(eraSections[i], eras[i]);

    if (m < n) {
      for (let i = n - 1; i >= m; i -= 1) {
        const section = eraSections[i];
        const index = sections.indexOf(section);
        if (index < 0) continue;
        sections.splice(index, 1);
        // Drop the spacer that separated the removed era from the next block.
        if (isSpacerSection(sections[index])) sections.splice(index, 1);
      }
      // And the spacer that trailed the last kept era.
      const lastKept = eraSections[m - 1];
      const lastIndex = sections.indexOf(lastKept);
      if (lastIndex >= 0 && isSpacerSection(sections[lastIndex + 1])) {
        sections.splice(lastIndex + 1, 1);
      }
      return;
    }

    if (m > n) {
      const template = eraSections[n - 1];
      const templateIndex = sections.indexOf(template);
      if (templateIndex < 0) return;
      let insertAt = templateIndex + 1;
      const spacerTemplate = isSpacerSection(sections[insertAt]) ? sections[insertAt] : null;
      if (spacerTemplate) insertAt += 1;
      for (let i = n; i < m; i += 1) {
        const eraClone = deepClone(template);
        eraClone.id = `${template.id}__era${i}`;
        rewriteSectionWidgetIds(eraClone, `__era${i}`);
        applyEraOne(eraClone, eras[i]);
        sections.splice(insertAt, 0, eraClone);
        insertAt += 1;
        if (spacerTemplate) {
          const gapClone = deepClone(spacerTemplate);
          gapClone.id = `${spacerTemplate.id}__era_gap${i}`;
          rewriteSectionWidgetIds(gapClone, `__era_gap${i}`);
          sections.splice(insertAt, 0, gapClone);
          insertAt += 1;
        }
      }
      return;
    }
  } catch {
    // Overrides must never break rendering.
  }
}

/**
 * The company.global branch container rows: rows in the section whose subtree
 * contains at least one iframe-bearing text widget. After an add they may be
 * several (one per group of ≤ 2 branch cards); the first is the clone template.
 */
function containerRowsOf(section: Section): RowNode[] {
  const rows: RowNode[] = [];
  for (const node of section?.rows ?? []) {
    if (node.kind !== "row") continue;
    const hasIframe = node.cols.some((col) =>
      nodeWidgets(col).some(
        (w) => w.type === "text" && typeof w.html === "string" && /<iframe\b/i.test(w.html),
      ),
    );
    if (hasIframe) rows.push(node);
  }
  return rows;
}

/** Marker pair wrapping the idempotent branch contact block. */
const LOC_CONTACTS_RE = /<!--loc-contacts-->[\s\S]*?<!--\/loc-contacts-->/g;

/** The contact block for one branch card ("" when no contact field is set). */
function contactBlock(location: GlobalLocation): string {
  const rows: string[] = [];
  if (location.phone) {
    rows.push(
      `<p style="line-height:2"><span style="font-size:18px">TEL ${escapeEraText(location.phone)}</span></p>`,
    );
  }
  if (location.fax) {
    rows.push(
      `<p style="line-height:2"><span style="font-size:18px">FAX ${escapeEraText(location.fax)}</span></p>`,
    );
  }
  if (location.email) {
    rows.push(
      `<p style="line-height:2"><span style="font-size:18px">EMAIL ${escapeEraText(location.email)}</span></p>`,
    );
  }
  if (rows.length === 0) return "";
  return `<!--loc-contacts-->${rows.join("")}<!--/loc-contacts-->`;
}

/**
 * Strip any existing contact block, then append the location's block at the end
 * of the card content (after the address paragraph). Idempotent: re-applying a
 * contact-free item leaves the authored markup byte-identical.
 */
function applyContactBlock(html: string, location: GlobalLocation): string {
  const source = String(html ?? "");
  const stripped = source.replace(LOC_CONTACTS_RE, "");
  const block = contactBlock(location);
  if (!block) return stripped;
  const close = stripped.lastIndexOf("</div></div>");
  if (close >= 0) return stripped.slice(0, close) + block + stripped.slice(close);
  return stripped + block;
}

/** Apply one branch item (`locations[1+]`) to one branch column. */
function applyBranch(col: ColNode, location: GlobalLocation): void {
  const widgets = nodeWidgets(col);
  const name =
    widgets.find(
      (w) => w.type === "text" && typeof w.html === "string" && !/<iframe\b/i.test(w.html),
    ) ?? null;
  const map =
    widgets.find((w) => w.type === "text" && typeof w.html === "string" && /<iframe\b/i.test(w.html)) ??
    null;

  if (name) {
    // Strip the contact block BEFORE comparing runs so a previous apply cannot
    // inflate the run count and break the 3-run badge/city/address injection.
    const stripped = String(name.html ?? "").replace(LOC_CONTACTS_RE, "");
    const desired = [location.badge, location.city, location.address].join("\n");
    const injected =
      desired !== extractTextRuns(stripped).join("\n")
        ? injectTextRuns(stripped, desired)
        : stripped;
    name.html = applyContactBlock(injected, location);
  }

  if (map && location.mapSrc) {
    map.html = replaceNthSrc(map.html, "iframe", 0, location.mapSrc);
  }
}

/** Apply the HQ item (item 0) to the company.global HQ section in place. */
function applyHq(section: Section, location: GlobalLocation): void {
  const widgets = sectionWidgetList(section);
  const name =
    widgets.find(
      (w) =>
        w.type === "text" &&
        typeof w.html === "string" &&
        !/<iframe\b/i.test(w.html) &&
        !/<table\b/i.test(w.html),
    ) ?? null;
  const contacts =
    widgets.find(
      (w) => w.type === "text" && typeof w.html === "string" && /<table\b/i.test(w.html),
    ) ?? null;
  const map =
    widgets.find((w) => w.type === "text" && typeof w.html === "string" && /<iframe\b/i.test(w.html)) ??
    null;

  if (name) {
    // The authored HQ name is 2 runs (chip + address); `city` folds into the
    // address line, so an empty authored city re-renders byte-identically.
    const desired = [
      location.badge,
      [location.city, location.address].filter(Boolean).join(" "),
    ].join("\n");
    if (desired !== extractTextRuns(name.html).join("\n")) {
      name.html = injectTextRuns(name.html, desired);
    }
  }

  if (contacts) {
    const desired = ["TEL", location.phone, "FAX", location.fax, "EMAIL", location.email].join("\n");
    if (desired !== extractTextRuns(contacts.html).join("\n")) {
      contacts.html = injectTextRuns(contacts.html, desired);
    }
  }

  if (map && location.mapSrc) {
    map.html = replaceNthSrc(map.html, "iframe", 0, location.mapSrc);
  }
}

/**
 * Page-level `locations` applier. Item 0 targets the HQ section (the section
 * immediately preceding the branches anchor: name/contacts/map widgets); items
 * 1+ are laid out as branch cards, at most TWO per container row (a lone
 * trailing card takes the full row width). Never throws.
 */
export function applyLocations(
  sections: Section[],
  anchor: Section,
  locations: GlobalLocation[],
): void {
  try {
    if (!Array.isArray(sections) || !anchor || !Array.isArray(locations) || locations.length === 0) {
      return;
    }

    const anchorIndex = sections.indexOf(anchor);
    const hqSection = anchorIndex > 0 ? sections[anchorIndex - 1] : null;
    if (hqSection && locations[0]) applyHq(hqSection, locations[0]);

    const branchItems = locations.slice(1);
    const containerRows = containerRowsOf(anchor);
    const templateRow = containerRows[0] ?? null;
    if (!templateRow) return;

    const existingCols = containerRows.flatMap((row) => row.cols);
    const templateCol = existingCols[existingCols.length - 1] ?? templateRow.cols[0] ?? null;
    if (!templateCol) return;

    // Target cols in item order: reuse the authored cols first, then clone the
    // template col with a unique `__loc<i>` id. `applyBranch` is unchanged.
    const m = branchItems.length;
    const targetCols: ColNode[] = [];
    for (let i = 0; i < m; i += 1) {
      let col: ColNode;
      if (i < existingCols.length) {
        col = existingCols[i];
      } else {
        col = deepClone(templateCol);
        rewriteNodeIds(col, `__loc${i}`);
      }
      applyBranch(col, branchItems[i]);
      targetCols.push(col);
    }

    // Chunk into rows of at most 2; 2 cols split 50/50, a lone col is full width.
    const groups: ColNode[][] = [];
    for (let i = 0; i < targetCols.length; i += 2) {
      groups.push(targetCols.slice(i, i + 2));
    }

    // Reuse existing container rows in order, then clone the template row (the
    // copy's own cols are discarded; only the row-level h/pad/grid survive).
    const newRows: RowNode[] = [];
    for (let g = 0; g < groups.length; g += 1) {
      const group = groups[g];
      let row: RowNode;
      if (g < containerRows.length) {
        row = containerRows[g];
      } else {
        row = deepClone(templateRow);
        rewriteNodeIds(row, `__locrow${g}`);
      }
      row.cols = group;
      const grid = group.length === 1 ? "12" : "6";
      for (const col of group) col.grid = grid;
      newRows.push(row);
    }

    // Rebuild the section rows: drop every container row and splice the new set
    // back at the first container row's position (contiguous, before the trailing
    // pad). Authored pad rows and their order are untouched.
    const rows = anchor.rows ?? [];
    const firstIndex = rows.findIndex((node) => containerRows.includes(node as RowNode));
    if (firstIndex < 0) return;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (containerRows.includes(rows[i] as RowNode)) rows.splice(i, 1);
    }
    rows.splice(firstIndex, 0, ...newRows);
  } catch {
    // Overrides must never break rendering.
  }
}

/* ---------------- structured media kinds: gallery + aboutCards ---------------- */

/** Parse a `gallery`/`aboutCards` payload; `null` when malformed/empty. */
function parseMediaItems(value: string): StructuredMediaItem[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const items: StructuredMediaItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const item = entry as { image?: unknown; title?: unknown; desc?: unknown };
      if (typeof item.image !== "string" || item.image.length === 0) return null;
      if (typeof item.title !== "string") return null;
      if (typeof item.desc !== "string") return null;
      items.push({ image: item.image, title: item.title, desc: item.desc });
    }
    return items;
  } catch {
    return null;
  }
}

/**
 * Clamp a media payload to its block config: clear fields the block does not
 * expose and truncate to `maxItems`. Defends render time against a direct-DB
 * payload that bypassed the save validator.
 */
function normalizeMediaItems(
  items: StructuredMediaItem[],
  cfg?: GalleryBlockConfig,
): StructuredMediaItem[] {
  const fields = cfg?.fields;
  const allowTitle = !fields || fields.includes("title");
  const allowDesc = !fields || fields.includes("desc");
  const normalized = items.map((item) => ({
    image: item.image,
    title: allowTitle ? item.title : "",
    desc: allowDesc ? item.desc : "",
  }));
  const max = cfg?.maxItems;
  return typeof max === "number" ? normalized.slice(0, max) : normalized;
}

/**
 * Replace a gallery2 widget's items from a structured payload. `org` and `thumb`
 * both take the one uploaded image; `layout`/config fields stay untouched.
 */
export function applyGallery(
  widget: WidgetNode,
  items: StructuredMediaItem[],
  cfg?: GalleryBlockConfig,
): void {
  try {
    if (!widget || !Array.isArray(items) || items.length === 0) return;
    const normalized = normalizeMediaItems(items, cfg);
    if (normalized.length === 0) return;
    widget.items = normalized.map((item) => ({
      org: item.image,
      thumb: item.image,
      title: item.title,
      desc: item.desc,
    }));
  } catch {
    // Overrides must never break rendering.
  }
}

/** The nearest ancestor `col` wrapping exactly one widget (a block-5 card). */
function nearestCardColPlace(entry: LocatedWidget): NodePlace | null {
  for (let i = entry.path.length - 1; i >= 0; i -= 1) {
    const place = entry.path[i];
    if (place.node.kind === "col" && countWidgets(place.node) === 1) return place;
  }
  return null;
}

/** The nearest ancestor `row` of a widget (its card row). */
function nearestRowPlace(entry: LocatedWidget): NodePlace | null {
  for (let i = entry.path.length - 1; i >= 0; i -= 1) {
    if (entry.path[i].node.kind === "row") return entry.path[i];
  }
  return null;
}

/** Inject one media item into a block-5 card text widget (title / image / desc). */
function injectAboutCardWidget(widget: WidgetNode, item: StructuredMediaItem): void {
  let html = injectTextRuns(widget.html, item.title, { start: 0, end: 0 });
  html = replaceNthSrc(html, "img", 0, item.image);
  html = injectTextRuns(html, item.desc, { start: 1 });
  widget.html = html;
}

/** Inject a media item into the text widget inside a cloned card block. */
function injectAboutCardNode(node: Node, item: StructuredMediaItem): void {
  const widgets: WidgetNode[] = [];
  forEachWidget(node, (widget) => widgets.push(widget));
  const card = widgets.find((widget) => widget.type === "text") ?? widgets[0];
  if (card) injectAboutCardWidget(card, item);
}

/**
 * Restructure an already-deep-cloned section so block 5 renders EXACTLY
 * `items.length` cards (title + embedded image + description). The section tree
 * is edited in place (the caller owns the clone):
 *
 *  - the first non-empty `text` widget is the heading; the text widgets after it
 *    are the cards (each a `row > col > widget` block);
 *  - existing cards re-inject title/image/desc into the authored markup;
 *  - extra items deep-clone the LAST card's `col` (`<id>__card<i>`) and push it
 *    into the last card row, cloning the row shell once that row is full (2 cols);
 *  - missing items splice trailing card cols (and rows left col-less);
 *  - unknown shapes: no-op. Never throws.
 */
export function applyAboutCards(
  section: Section,
  items: StructuredMediaItem[],
  cfg?: GalleryBlockConfig,
): void {
  try {
    if (!section || !Array.isArray(items) || items.length === 0) return;
    const normalized = normalizeMediaItems(items, cfg);
    if (normalized.length === 0) return;

    const located: LocatedWidget[] = [];
    collectLocatedWidgets(section.rows, located);
    const textEntries = located.filter((entry) => entry.widget.type === "text");
    const heading = textEntries.findIndex(
      (entry) => typeof entry.widget.html === "string" && entry.widget.html.trim().length > 0,
    );
    if (heading < 0) return;
    const cardEntries = textEntries.slice(heading + 1);
    if (cardEntries.length === 0) return;

    const common = Math.min(normalized.length, cardEntries.length);
    for (let i = 0; i < common; i += 1) {
      injectAboutCardWidget(cardEntries[i].widget, normalized[i]);
    }

    if (normalized.length > cardEntries.length) {
      const lastEntry = cardEntries[cardEntries.length - 1];
      const colPlace = nearestCardColPlace(lastEntry);
      const rowPlace = nearestRowPlace(lastEntry);
      if (!colPlace || !rowPlace) return;
      const lastRow = rowPlace.node as RowNode;
      let insertAt = rowPlace.index + 1;
      for (let i = cardEntries.length; i < normalized.length; i += 1) {
        const colClone = deepClone(colPlace.node) as ColNode;
        rewriteWidgetIds(colClone, i);
        injectAboutCardNode(colClone, normalized[i]);
        if (lastRow.cols.length >= 2) {
          const rowClone = deepClone(lastRow);
          rowClone.cols = [colClone];
          rowPlace.parentArray.splice(insertAt, 0, rowClone);
          insertAt += 1;
        } else {
          lastRow.cols.push(colClone);
        }
      }
      return;
    }

    if (normalized.length < cardEntries.length) {
      for (let i = cardEntries.length - 1; i >= normalized.length; i -= 1) {
        const entry = cardEntries[i];
        const colPlace = nearestCardColPlace(entry);
        if (!colPlace) continue;
        const rowPlace = nearestRowPlace(entry);
        const index = colPlace.parentArray.indexOf(colPlace.node);
        if (index >= 0) colPlace.parentArray.splice(index, 1);
        if (rowPlace && (rowPlace.node as RowNode).cols.length === 0) {
          const rowIndex = rowPlace.parentArray.indexOf(rowPlace.node);
          if (rowIndex >= 0) rowPlace.parentArray.splice(rowIndex, 1);
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
  /**
   * Override key → structured gallery block config (`gallery` kind). When set,
   * the media appliers clear disallowed fields and truncate to `maxItems`, so a
   * direct-DB payload cannot bypass the editor's field/count contract.
   */
  galleryConfigs?: Record<string, GalleryBlockConfig>;
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

  // Deferred structured keys (`eras` + `gallery`/`aboutCards`): their appliers
  // restructure a section or splice sections, which would shift the positional
  // KO↔EN pairing for any key processed afterwards. Collect them and apply once
  // the whole widget loop has run (anchors resolve against the untouched primary).
  const deferred: Array<{
    key: string;
    ref: RegistryKeyParts;
    value: string;
    kind: "eras" | "gallery" | "aboutCards" | "locations";
  }> = [];

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (typeof value !== "string") continue;

    const parsed = parseRegistryKey(key);
    if (!parsed) continue;
    // Board/site keys (and other pages) address different documents.
    if (expectedPageKey && parsed.pageKey !== expectedPageKey) continue;

    // History timeline (`<page>#<sectionId>/eras/eras`): page-level era
    // section splicing, applied after the loop.
    if (parsed.field === "eras" && parsed.widgetId === "eras") {
      deferred.push({ key, ref: parsed, value, kind: "eras" });
      continue;
    }

    // Structured gallery (`<page>#<sectionId>/<galleryWidgetId>/gallery`):
    // replaces a gallery2 widget's whole item list, applied after the loop.
    if (parsed.field === "gallery") {
      deferred.push({ key, ref: parsed, value, kind: "gallery" });
      continue;
    }

    // Block-5 card list (`<page>#<sectionId>/aboutCards/aboutCards`):
    // restructures the cloned card nodes, applied after the loop.
    if (parsed.field === "aboutCards" && parsed.widgetId === "aboutCards") {
      deferred.push({ key, ref: parsed, value, kind: "aboutCards" });
      continue;
    }

    // Branch list (`<page>#<sectionId>/locations/locations`): page-level — item 0
    // is the HQ section (immediately preceding the anchor), items 1+ restructure
    // the branch columns. Applied after the widget loop (like `eras`).
    if (parsed.field === "locations" && parsed.widgetId === "locations") {
      deferred.push({ key, ref: parsed, value, kind: "locations" });
      continue;
    }

    // Hero slide list (`<page>#<sectionId>/visual/slides`): replaces the whole
    // `section.visual` array instead of one widget field.
    if (parsed.field === "slides" && parsed.widgetId === "visual") {
      const section = resolvePairedSection(clone, parsed, options.primaryPage ?? null);
      const slides = section ? parseSlides(value) : null;
      if (section && slides) applySlides(section, slides);
      continue;
    }

    // Location card list (`<page>#<sectionId>/cards/cards`): restructures the
    // cloned card nodes (add/remove/reorder) instead of one widget field.
    if (parsed.field === "cards" && parsed.widgetId === "cards") {
      const section = resolvePairedSection(clone, parsed, options.primaryPage ?? null);
      const cards = section ? parseCards(value) : null;
      if (section && cards) applyCards(section, cards);
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

  // Deferred structured keys: apply only after every per-widget override has
  // landed, so the section structure is still the authored one while the loop's
  // positional pairing runs. The config lookup closes the direct-DB bypass.
  for (const { key, ref, value, kind } of deferred) {
    const cfg = options.galleryConfigs?.[key];
    if (kind === "eras") {
      const anchor = resolvePairedSection(clone, ref, options.primaryPage ?? null);
      const eras = anchor ? parseEras(value) : null;
      if (anchor && eras) applyEras(clone.sections, anchor, eras);
      continue;
    }
    if (kind === "gallery") {
      const widget = resolvePairedWidget(clone, ref, options.primaryPage ?? null);
      if (!widget || widget.type !== "gallery2") continue;
      const items = parseMediaItems(value);
      if (items) applyGallery(widget, items, cfg);
      continue;
    }
    if (kind === "locations") {
      const anchor = resolvePairedSection(clone, ref, options.primaryPage ?? null);
      const locations = anchor ? parseLocations(value) : null;
      if (anchor && locations) applyLocations(clone.sections, anchor, locations);
      continue;
    }
    const section = resolvePairedSection(clone, ref, options.primaryPage ?? null);
    const items = section ? parseMediaItems(value) : null;
    if (section && items) applyAboutCards(section, items, cfg);
  }

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
