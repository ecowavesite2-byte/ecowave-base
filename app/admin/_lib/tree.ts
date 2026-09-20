import type { Node, PageContent, Section, WidgetNode } from "@/lib/types";

/**
 * Display helpers for the pages editor. Pure and dependency-free (types only),
 * so both the server page list and the client editor island can import it.
 */

export type Viewport = "PC" | "MOBILE" | "PC+MO";

export interface WidgetEntry {
  sectionId: string;
  sectionLabel: string;
  viewport: Viewport;
  widget: WidgetNode;
}

export interface Selection {
  sectionId: string;
  widgetId: string;
}

export interface Coverage {
  total: number;
  filled: number;
}

/** Viewport split encoded in the crawled section class tokens. */
export function sectionViewport(section: Section): Viewport {
  const cls = section.cls ?? "";
  if (/(?:^|\s)mobile_hide(?:\s|$)/.test(cls)) return "PC";
  const pc = /(?:^|\s)pc_section(?:\s|$)/.test(cls);
  const mobile = /(?:^|\s)mobile_section(?:\s|$)/.test(cls);
  if (mobile && pc) return "PC+MO";
  if (mobile) return "MOBILE";
  if (pc) return "PC";
  return "PC+MO";
}

function collectWidgets(nodes: Node[], out: WidgetNode[]): void {
  for (const node of nodes) {
    if (node.kind === "widget") {
      out.push(node);
    } else if (node.kind === "col") {
      collectWidgets(node.children, out);
    } else {
      for (const col of node.cols) collectWidgets(col.children, out);
    }
  }
}

/** Widgets in render order (rows → cols → children, aside last). */
export function sectionWidgets(section: Section): WidgetNode[] {
  const out: WidgetNode[] = [];
  collectWidgets(section.rows, out);
  if (section.aside) collectWidgets(section.aside.items, out);
  return out;
}

export function stripTags(html: string): string {
  return html
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

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function basename(src: string): string {
  const clean = src.split(/[?#]/)[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

function paddingHeight(widget: WidgetNode): number {
  if (typeof widget._h === "number") return widget._h;
  const html = widget.html ?? "";
  const match = html.match(/data-height="(-?[\d.]+)"/) ?? html.match(/[^-]height:\s*(-?[\d.]+)px/);
  return match ? parseFloat(match[1]) : 0;
}

/** Human label for a widget row (derived, never the raw type alone). */
export function widgetLabel(widget: WidgetNode): string {
  switch (widget.type) {
    case "text": {
      const text = stripTags(widget.html ?? "");
      return text ? truncate(text, 40) : "(empty text)";
    }
    case "menu_title":
      return widget.text ? truncate(widget.text, 40) : "(untitled)";
    case "image":
      if (widget.alt?.trim()) return truncate(widget.alt.trim(), 40);
      if (widget.src) return basename(widget.src);
      return "(image)";
    case "button":
      return widget.text ? truncate(widget.text, 40) : "(button)";
    case "gallery2":
      return `Gallery · ${widget.items?.length ?? 0} items`;
    case "padding":
      return `Spacer ${paddingHeight(widget)}px`;
    case "board":
      return `Board · ${widget.ref ?? "(ref)"}`;
    case "code":
      return "Code block";
    case "video":
      return "Video";
    case "form":
      return "Inquiry form";
    case "hr":
      return "Divider";
    case "newest":
      return "Newest posts";
    default:
      return widget.type;
  }
}

const GLYPHS: Record<string, string> = {
  text: "T",
  menu_title: "T",
  image: "▣",
  gallery2: "▦",
  button: "▢",
  padding: "↕",
  board: "☰",
  form: "▤",
  code: "</>",
  video: "▶",
  hr: "―",
  newest: "•",
};

export function widgetGlyph(type: string): string {
  return GLYPHS[type] ?? "◆";
}

function snippetOf(widget: WidgetNode): string {
  if (widget.type === "text") return truncate(stripTags(widget.html ?? ""), 30);
  if (widget.type === "menu_title") return widget.text ? truncate(widget.text, 30) : "";
  if (widget.type === "button") return widget.text ? truncate(widget.text, 30) : "";
  return "";
}

export function sectionLabel(section: Section, index: number): string {
  for (const widget of sectionWidgets(section)) {
    const snippet = snippetOf(widget);
    if (snippet) return `Section ${index + 1} · ${snippet}`;
  }
  return `Section ${index + 1}`;
}

export function walkWidgets(section: Section, index?: number): WidgetEntry[];
export function walkWidgets(page: PageContent): WidgetEntry[];
export function walkWidgets(input: Section | PageContent, index = 0): WidgetEntry[] {
  if ("sections" in input) {
    return input.sections.flatMap((section, i) => walkWidgets(section, i));
  }
  const label = sectionLabel(input, index);
  const viewport = sectionViewport(input);
  return sectionWidgets(input).map((widget) => ({
    sectionId: input.id,
    sectionLabel: label,
    viewport,
    widget,
  }));
}

export type SectionShape =
  | { mode: "flat"; widgets: WidgetNode[] }
  | { mode: "tree"; nodes: Node[] };

/**
 * `1 row → 1 col` sections collapse their row/col layer away; anything else is
 * returned as the full row/col tree so the editor can reveal it.
 */
export function flattenSection(section: Section): SectionShape {
  const only = section.rows.length === 1 ? section.rows[0] : undefined;
  if (!section.aside && only?.kind === "row" && only.cols.length === 1) {
    const widgets: WidgetNode[] = [];
    collectWidgets(only.cols[0].children, widgets);
    return { mode: "flat", widgets };
  }
  return { mode: "tree", nodes: section.rows };
}

export function findWidget(
  page: PageContent,
  sectionId: string,
  widgetId: string,
): WidgetNode | null {
  const section = page.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  return sectionWidgets(section).find((w) => w.id === widgetId) ?? null;
}

/**
 * Translatable field slots: text html, image alt, button text, gallery item
 * title/desc. `filled` counts the non-empty ones (used for coverage badges).
 */
export function countTranslatableFields(page: PageContent): Coverage {
  let total = 0;
  let filled = 0;

  const consider = (value: string | null | undefined) => {
    total += 1;
    if (value && value.trim()) filled += 1;
  };

  for (const entry of walkWidgets(page)) {
    const widget = entry.widget;
    if (widget.type === "text") {
      total += 1;
      if (stripTags(widget.html ?? "")) filled += 1;
    } else if (widget.type === "image") {
      consider(widget.alt);
    } else if (widget.type === "button") {
      consider(widget.text);
    } else if (widget.type === "gallery2") {
      for (const item of widget.items ?? []) {
        consider(item.title);
        consider(item.desc);
      }
    }
  }

  return { total, filled };
}

export function coveragePercent(coverage: Coverage): number {
  if (coverage.total === 0) return 100;
  return Math.round((coverage.filled / coverage.total) * 100);
}

/**
 * Target-language completeness measured against the reference's *filled*
 * slots, so crawl-empty fields (e.g. empty alt text) do not count as
 * untranslated. `total` is the reference filled count, `filled` the target's.
 */
export function translationCoverage(target: Coverage, reference: Coverage): Coverage {
  const total = reference.filled;
  return { total, filled: Math.min(target.filled, total) };
}
