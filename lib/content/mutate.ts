import type { BoardContent, Node, PageContent, Section, WidgetNode } from "../types";
import { sanitizeHtmlFragment } from "./sanitize";

/**
 * Typed, immutable content mutators. Each helper returns a NEW content object
 * (via `structuredClone`) and throws a clear error when its target is missing,
 * so the route handler can map "not found" to a 400/404.
 */

function findSection(page: PageContent, sectionId: string): Section {
  const section = page.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error(`Section not found: ${sectionId}`);
  return section;
}

function findNode(node: Node, id: string): WidgetNode | undefined {
  if (node.kind === "widget") return node.id === id ? node : undefined;
  if (node.kind === "col") {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
    return undefined;
  }
  for (const col of node.cols) {
    for (const child of col.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

function findWidget(section: Section, id: string): WidgetNode | undefined {
  for (const row of section.rows) {
    const found = findNode(row, id);
    if (found) return found;
  }
  if (section.aside) {
    for (const item of section.aside.items) {
      const found = findNode(item, id);
      if (found) return found;
    }
  }
  return undefined;
}

function requireWidget(page: PageContent, sectionId: string, widgetId: string): WidgetNode {
  const section = findSection(page, sectionId);
  const widget = findWidget(section, widgetId);
  if (!widget) throw new Error(`Widget not found: ${widgetId} (section ${sectionId})`);
  return widget;
}

export function setTextHtml(
  page: PageContent,
  opts: { sectionId: string; widgetId: string; html: string },
): PageContent {
  const next = structuredClone(page);
  const widget = requireWidget(next, opts.sectionId, opts.widgetId);
  widget.html = sanitizeHtmlFragment(opts.html);
  return next;
}

export function setImage(
  page: PageContent,
  opts: { sectionId: string; widgetId: string; src?: string; alt?: string },
): PageContent {
  const next = structuredClone(page);
  const widget = requireWidget(next, opts.sectionId, opts.widgetId);
  if (opts.src !== undefined) widget.src = opts.src;
  if (opts.alt !== undefined) widget.alt = opts.alt;
  return next;
}

export function setGalleryItem(
  page: PageContent,
  opts: { sectionId: string; widgetId: string; index: number; title?: string; desc?: string },
): PageContent {
  const next = structuredClone(page);
  const widget = requireWidget(next, opts.sectionId, opts.widgetId);
  const items = widget.items;
  const item = items?.[opts.index];
  if (!items || !item) {
    throw new Error(`Gallery item not found: ${opts.widgetId}[${opts.index}]`);
  }
  if (opts.title !== undefined) item.title = opts.title;
  if (opts.desc !== undefined) item.desc = opts.desc;
  return next;
}

export interface BoardPostFields {
  title?: string;
  category?: string;
  excerpt?: string;
  date?: string | null;
  isNotice?: boolean;
  thumb?: string | null;
  content?: string;
}

export function updateBoardPost(
  board: BoardContent,
  idx: string,
  fields: BoardPostFields,
): BoardContent {
  const next = structuredClone(board);
  const post = next.posts.find((p) => p.idx === idx);
  if (!post) throw new Error(`Board post not found: ${idx}`);

  if (fields.title !== undefined) post.title = fields.title;
  if (fields.category !== undefined) post.category = fields.category;
  if (fields.excerpt !== undefined) post.excerpt = fields.excerpt;
  if (fields.date !== undefined) post.date = fields.date;
  if (fields.isNotice !== undefined) post.isNotice = fields.isNotice;
  if (fields.thumb !== undefined) post.thumb = fields.thumb;
  if (fields.content !== undefined) post.content = sanitizeHtmlFragment(fields.content);

  return next;
}
