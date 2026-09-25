/**
 * Plain-text ↔ styled-HTML bridge for the `lines` registry kind.
 *
 * Admins edit TEXT only; the authored markup and inline styles stay fixed. A
 * crawled rich-text widget is a sequence of tags + text nodes (one node per
 * styled run: headline, sub-line, accent line…), so a `lines` value is those
 * runs joined with `\n` — one line per design line. Applying a value injects
 * each line back into its original node, so the styling is preserved exactly.
 *
 * Dependency-free (regex tokenizer, no DOM): safe on the server, in the client
 * preview and in tests. The registry generator mirrors `extractTextRuns` in
 * `scripts/gen-content-registry.mjs` (it is a plain .mjs script) — keep the two
 * tokenizers in sync.
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

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function encodeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Is this text node anything but whitespace/entities? */
function isRun(node: string): boolean {
  return decodeEntities(node).replace(/\s+/g, " ").trim().length > 0;
}

/**
 * Plain-text runs of an HTML string, in document order (whitespace-only nodes
 * skipped). `"<p><span>A</span></p><p><span>B</span></p>"` → `["A", "B"]`.
 */
export function extractTextRuns(html: string | null | undefined): string[] {
  const parts = String(html ?? "").split(TOKEN);
  const runs: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (isRun(parts[i])) runs.push(decodeEntities(parts[i]).replace(/\s+/g, " ").trim());
  }
  return runs;
}

/**
 * Inject a `\n`-separated plain-text value into the text nodes of `html`,
 * preserving every tag/style. Mapping rules:
 *  - line i replaces text node i;
 *  - extra lines beyond the node count are appended to the last node (joined
 *    with a space), so added copy is never dropped;
 *  - absent lines clear the remaining nodes;
 *  - an html with no text nodes (or no html at all) returns the encoded text.
 */
export function injectTextRuns(html: string | null | undefined, value: string): string {
  const source = String(html ?? "");
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  if (extractTextRuns(source).length === 0) {
    // No text nodes to inject into. A markup-only widget (logo/structure html)
    // must stay untouched — replacing it with plain text would drop the markup.
    // Only tag-free html falls back to escaped text.
    return source.includes("<") ? source : encodeText(lines.filter(Boolean).join(" "));
  }

  const parts = source.split(TOKEN);
  let runIndex = 0;
  let lastRunPart = -1;

  for (let i = 0; i < parts.length; i += 2) {
    if (!isRun(parts[i])) continue;
    const line = lines[runIndex];
    runIndex += 1;
    lastRunPart = i;
    if (line === undefined || line === "") {
      parts[i] = "";
      continue;
    }
    const lead = EDGE_LEAD.exec(parts[i])?.[0] ?? "";
    const trail = EDGE_TRAIL.exec(parts[i])?.[0] ?? "";
    parts[i] = lead + encodeText(line) + trail;
  }

  if (runIndex < lines.length && lastRunPart >= 0) {
    const overflow = lines.slice(runIndex).filter(Boolean).join(" ");
    if (overflow) parts[lastRunPart] = parts[lastRunPart].trimEnd() + " " + encodeText(overflow);
  }

  return parts.join("");
}
