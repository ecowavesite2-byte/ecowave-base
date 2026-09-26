/**
 * Plain-text ↔ styled-HTML bridge for the `lines` / `title` / `desc` fields.
 *
 * Admins edit TEXT (optionally with inline HTML) while the authored markup and
 * inline styles stay fixed. A crawled rich-text widget is a sequence of tags +
 * text nodes (one node per styled run: headline, sub-line, accent line…), so a
 * value is those runs joined with `\n` — one line per design line. Applying a
 * value injects each line back into its original node.
 *
 * Value lines may contain inline HTML: a line holding a real tag (`<b>x</b>`)
 * is inserted verbatim, while plain lines are escaped — so copy like
 * `pH < 7` can never break the markup.
 *
 * Dependency-free (regex tokenizer, no DOM): safe on the server, in the client
 * preview and in tests. The registry generator mirrors `extractTextRuns` in
 * `scripts/gen-content-registry.mjs` (plain .mjs) — a parity test guards drift.
 */

/** Tag-or-text tokenizer: even indices are text nodes, odd are tags. */
const TOKEN = /(<[^>]*>)/g;

/**
 * Run-boundary whitespace, INCLUDING html whitespace entities. Capturing only
 * `\s` would drop a trailing `&nbsp;` (e.g. `고객과 함께&nbsp;`) and concatenate
 * the adjacent styled spans ("…실현을 통해보다 건강하고…").
 */
const EDGE_LEAD = /^(?:\s|&nbsp;|&#160;)*/;
const EDGE_TRAIL = /(?:\s|&nbsp;|&#160;)*$/;

/** A line containing a real html tag (vs a bare "<" like "pH < 7"). */
const TAG_RE = /<[a-z][^>]*>/i;

/**
 * Zero-width characters (ZWSP/ZWNJ/ZWJ/BOM) are invisible copy no admin can
 * edit; they are stripped from run detection so a node holding only them is not
 * treated as a run. The authored bytes stay in the markup untouched.
 */
const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Decode + drop zero-width characters + collapse whitespace; the run value. */
function normalizeRun(value: string): string {
  return decodeEntities(value).replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
}

function encodeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escape plain copy; keep authored inline HTML (admin-provided) verbatim. A
 * mixed line escapes only the text between its tags, so `<b>x</b> & pH < 7`
 * keeps the markup while the bare `&`/`<` stay safe.
 */
function encodeLine(line: string): string {
  if (!TAG_RE.test(line)) return encodeText(line);
  const parts = line.split(/(<\/?[a-z][^>]*>)/i);
  return parts.map((part, index) => (index % 2 === 1 ? part : encodeText(part))).join("");
}

/** Is this text node anything but whitespace/entities/zero-width characters? */
function isRun(node: string): boolean {
  return normalizeRun(node).length > 0;
}

/**
 * Plain-text runs of an HTML string, in document order (whitespace-only nodes
 * skipped). `"<p><span>A</span></p><p><span>B</span></p>"` → `["A", "B"]`.
 */
export function extractTextRuns(html: string | null | undefined): string[] {
  const parts = String(html ?? "").split(TOKEN);
  const runs: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (isRun(parts[i])) runs.push(normalizeRun(parts[i]));
  }
  return runs;
}

/**
 * Per-run font sizes (px) inferred from the nearest preceding `font-size: Npx`
 * tag. Used to split a hero slide into big (title) and small (subtitle) copy
 * without touching the authored markup. `0` marks an unknown size.
 */
export function extractRunSizes(html: string | null | undefined): number[] {
  const parts = String(html ?? "").split(TOKEN);
  let current = 0;
  const sizes: number[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 1) {
      const match = /font-size\s*:\s*([\d.]+)px/i.exec(parts[i]);
      if (match) current = parseFloat(match[1]);
    } else if (isRun(parts[i])) {
      sizes.push(current);
    }
  }
  return sizes;
}

/** Run range a value maps onto (inclusive indices; `end` omitted = to the end). */
export interface InjectRange {
  start?: number;
  end?: number;
}

/**
 * Inject a `\n`-separated value into the text nodes of `html`, preserving every
 * tag/style. Mapping rules:
 *  - line i replaces the run at `start + i` (up to `end` when given);
 *  - runs outside the range keep their authored copy;
 *  - extra lines beyond the range's runs are appended to its last run;
 *  - absent lines clear the remaining in-range runs;
 *  - an html with no text nodes (or none in range) stays untouched; a tag-free
 *    html returns the encoded text instead.
 */
export function injectTextRuns(
  html: string | null | undefined,
  value: string,
  range: InjectRange = {},
): string {
  const source = String(html ?? "");
  const start = range.start ?? 0;
  const end = range.end;
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim());

  if (extractTextRuns(source).length === 0) {
    // No text nodes to inject into. A markup-only widget (logo/structure html)
    // must stay untouched — replacing it with plain text would drop the markup.
    // Only tag-free html falls back to escaped text.
    return source.includes("<") ? source : encodeLine(lines.filter(Boolean).join(" "));
  }

  const parts = source.split(TOKEN);
  let runIndex = 0;
  let lineIndex = 0;
  let lastInRange = -1;

  for (let i = 0; i < parts.length; i += 2) {
    if (!isRun(parts[i])) continue;
    const index = runIndex;
    runIndex += 1;
    if (index < start) continue;
    if (end !== undefined && index > end) continue;
    lastInRange = i;
    const line = lines[lineIndex];
    lineIndex += 1;
    if (line === undefined || line === "") {
      parts[i] = "";
      continue;
    }
    const lead = EDGE_LEAD.exec(parts[i])?.[0] ?? "";
    const trail = EDGE_TRAIL.exec(parts[i])?.[0] ?? "";
    parts[i] = lead + encodeLine(line) + trail;
  }

  if (lineIndex < lines.length && lastInRange >= 0) {
    const overflow = lines.slice(lineIndex).filter(Boolean).join(" ");
    if (overflow) parts[lastInRange] = parts[lastInRange].trimEnd() + " " + encodeLine(overflow);
  }

  return parts.join("");
}
