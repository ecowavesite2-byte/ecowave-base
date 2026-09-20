import sanitizeHtml from "sanitize-html";
import type { BoardContent, Node, PageContent } from "../types";

/**
 * Style-preserving sanitizer for every HTML field saved through the admin lane.
 *
 * The crawl carries layout in inline styles (margin/padding/width/height/
 * min-height/background/…) and stable `id`s, so fidelity is the priority:
 *
 *  - NO `allowedStyles` property allowlist: with it unset, sanitize-html keeps
 *    the `style` attribute verbatim (structural properties survive untouched).
 *  - the security boundary lives at the VALUE level: a style value containing
 *    `url(`, `expression(`, `behavior` or `position:fixed` is split into its
 *    declarations (paren/quote aware) and only the offending declarations are
 *    dropped — every other declaration in the same value is preserved.
 *  - tags, `on*` handlers, classes and URL schemes stay restricted.
 *
 * `id` is explicitly allow-listed (no wildcards) because the crawled renderer
 * and widget ancestry depend on it.
 */

export const ALLOWED_TAGS = [
  "p",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "div",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "img",
  "figure",
  "figcaption",
  "blockquote",
];

export const ALLOWED_CLASSES = ["font1", "font2", "widget", "padding"];

/** Unsafe CSS constructs rejected everywhere inside a style declaration. */
const DANGEROUS_STYLE = /(url\s*\(|expression\s*\(|behavior\s*:|position\s*:\s*fixed)/i;

/**
 * Split a `style` value into declarations on top-level `;` only, so a `;`
 * inside `url(data:…;base64,…)` or a quoted string does not split a declaration
 * into harmless-looking fragments.
 */
function splitDeclarations(css: string): string[] {
  const declarations: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (const ch of css) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);

    if (ch === ";" && depth === 0) {
      declarations.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) declarations.push(current);
  return declarations;
}

/**
 * Keep the style value byte-for-byte when it is safe; otherwise drop only the
 * declarations carrying an unsafe token and preserve the rest.
 */
function guardStyleValue(value: string): string {
  if (!DANGEROUS_STYLE.test(value)) return value;
  return splitDeclarations(value)
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => !DANGEROUS_STYLE.test(declaration))
    .join("; ");
}

type Styles = Record<string, string>;
type StripFn = (tagName: string, attribs: Styles) => { tagName: string; attribs: Styles };

/** Drop `on*` handlers (defence in depth) and pre-filter style values. */
const stripHandlers: StripFn = (tagName, attribs) => {
  const cleaned: Styles = {};
  for (const [key, value] of Object.entries(attribs)) {
    if (/^on/i.test(key)) continue;
    cleaned[key] = key === "style" ? guardStyleValue(value) : value;
  }
  return { tagName, attribs: cleaned };
};

const transformTags: Record<string, StripFn> = {};
for (const tag of ALLOWED_TAGS) transformTags[tag] = stripHandlers;

const options = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    "*": ["id", "class", "style", "data-height", "data-widget-type"],
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
  },
  allowedClasses: { "*": ALLOWED_CLASSES },
  // Intentionally no `allowedStyles`: sanitize-html then passes `style` through
  // verbatim, preserving structural crawled properties. The value-level guard
  // in `transformTags` (below) is the security boundary.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  transformTags,
};

/** Sanitize a single HTML fragment (widget html, board post body, …). */
export function sanitizeHtmlFragment(html: string): string {
  if (typeof html !== "string" || html.length === 0) return "";
  return sanitizeHtml(html, options);
}

function sanitizeNodeHtml(node: Node): void {
  if (node.kind === "widget") {
    if (typeof node.html === "string") node.html = sanitizeHtmlFragment(node.html);
    return;
  }
  if (node.kind === "col") {
    for (const child of node.children) sanitizeNodeHtml(child);
    return;
  }
  for (const col of node.cols) {
    for (const child of col.children) sanitizeNodeHtml(child);
  }
}

/** Sanitize every HTML field in a page (widget html + hero slides). */
export function sanitizePageContent(page: PageContent): PageContent {
  const next = structuredClone(page);
  for (const section of next.sections) {
    if (Array.isArray(section.visual)) {
      for (const slide of section.visual) {
        if (typeof slide.html === "string") slide.html = sanitizeHtmlFragment(slide.html);
      }
    }
    for (const row of section.rows) sanitizeNodeHtml(row);
    if (section.aside) {
      for (const item of section.aside.items) sanitizeNodeHtml(item);
    }
  }
  return next;
}

/** Sanitize every board post body. */
export function sanitizeBoardContent(board: BoardContent): BoardContent {
  const next = structuredClone(board);
  for (const post of next.posts) {
    if (typeof post.content === "string") post.content = sanitizeHtmlFragment(post.content);
  }
  return next;
}
