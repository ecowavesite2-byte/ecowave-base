/**
 * Overlay labels for pillar-card images (home vision cards).
 *
 * The crawl encodes a card's label + title in the image widget's `alt`
 * attribute as markup; the renderer parses it, and the admin editor edits the
 * two strings while the storage stays the raw alt markup. Both sides share
 * these helpers so the format can never drift.
 *
 * Authored shapes (measured on the originals):
 *  - desktop `img-title`: `<div class="img-title">…<p>Company</p>…<h5>회사소개</h5></div>
 *    <span class="material-symbols-outlined">add</span>` → label above title + "+"
 *  - mobile: `<h5>회사소개</h5><span>Company</span>` → title above label, no "+".
 */

export type OverlayAlt = {
  label: string;
  title: string;
  plus: boolean;
  layout: "desktop" | "mobile" | "none";
  hasOverlay: boolean;
};

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decode(value: string): string {
  return value.replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

function strip(value: string): string {
  return decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function encode(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Parse an image widget's overlay markup from its `alt` attribute. */
export function parseOverlayAlt(alt?: string | null): OverlayAlt {
  if (!alt) return { label: "", title: "", plus: false, layout: "none", hasOverlay: false };
  const html = decode(alt);
  if (/img-title/i.test(html)) {
    const label = strip(html.match(/top-t[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
    const title = strip(html.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)?.[1] || "");
    return { label, title, plus: /material-symbols-outlined/i.test(html), layout: "desktop", hasOverlay: true };
  }
  const title = strip(html.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)?.[1] || "");
  if (!title) return { label: "", title: "", plus: false, layout: "none", hasOverlay: false };
  const spans = [...html.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => strip(match[1]))
    .filter(Boolean);
  return { label: spans[0] || "", title, plus: false, layout: "mobile", hasOverlay: true };
}

/**
 * Rebuild the alt markup for an edited label/title, keeping the parsed layout
 * (desktop label-above-title with "+", mobile title-above-label without).
 * A parsed overlay that lost all copy keeps its markup as-is (returns `null`
 * so the caller can skip the override instead of erasing the design).
 */
export function serializeOverlayAlt(
  parsed: OverlayAlt,
  label: string,
  title: string,
): string | null {
  if (!parsed.hasOverlay) return null;
  if (!label.trim() && !title.trim()) return null;
  if (parsed.layout === "desktop") {
    const plus = parsed.plus
      ? `<span class="material-symbols-outlined">add</span>`
      : "";
    return (
      `<div class="img-title"><div class="t-wrap"><div class="top-t"><P>${encode(label)}</P></div>` +
      `<h5>${encode(title)}</h5></div>${plus}</div>`
    );
  }
  return `<h5>${encode(title)}</h5><span>${encode(label)}</span>`;
}
