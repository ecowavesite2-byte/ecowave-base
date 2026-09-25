import type { HeroSlide, Node, PageContent, Section, WidgetNode } from "../types";

/**
 * Locale pairing for override application.
 *
 * Registry keys are built from the KO (primary) tree, but imweb assigns
 * different section/widget ids per locale. So a target-locale override is
 * resolved either by id (fast path — correct for ko) or by positional pairing
 * against the primary tree, exactly mirroring the registry generator:
 * sections pair by index, widgets pair by index within their section, and the
 * pairing is rejected unless the widget `type` matches.
 *
 * Hero slides (`visual[i]` refs) are not widget nodes; they pair by slide index
 * within the positionally-paired section.
 *
 * Pure and dependency-free (types only) — safe on server, client and in tests.
 */

/** Registry target for a def: a widget node or a hero slide (`visual[i]`). */
export type ResolvedTarget = WidgetNode | HeroSlide;

/** `visual[2]` → 2; null for ordinary widget refs. */
const VISUAL_REF = /^visual\[(\d+)\]$/;

/** Does this ref address a hero slide rather than a widget node? */
export function visualRefIndex(widgetId: string): number | null {
  const match = VISUAL_REF.exec(widgetId);
  return match ? Number(match[1]) : null;
}

/** Rows → cols → children, widget order (mirrors `merge`/generator traversal). */
export function collectWidgets(nodes: Node[] | undefined, out: WidgetNode[]): void {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (node.kind === "widget") {
      out.push(node);
    } else if (node.kind === "col") {
      collectWidgets(node.children, out);
    } else if (node.kind === "row") {
      for (const col of node.cols ?? []) collectWidgets(col.children, out);
    }
  }
}

/** Widgets of one section in render order (rows → cols → children, then aside). */
export function sectionWidgets(section: Section): WidgetNode[] {
  const out: WidgetNode[] = [];
  collectWidgets(section.rows, out);
  if (section.aside) collectWidgets(section.aside.items, out);
  return out;
}

/** A primary-locale registry reference (section id + widget id). */
export interface PairRef {
  sectionId: string;
  widgetId: string;
}

function findWidgetInSection(section: Section, widgetId: string): WidgetNode | null {
  return sectionWidgets(section).find((widget) => widget.id === widgetId) ?? null;
}

/** Section by id, or null (shared by the widget and slide resolvers). */
function findSection(page: PageContent, sectionId: string): Section | null {
  return (page.sections ?? []).find((section) => section?.id === sectionId) ?? null;
}

/** Hero slide at `index` of the section named by `sectionId`. */
function findVisualSlide(page: PageContent, sectionId: string, index: number): HeroSlide | null {
  const section = findSection(page, sectionId);
  const slide = section?.visual?.[index];
  return slide ?? null;
}

/**
 * Fast path: locate a widget by id in the target tree, preferring the section
 * named by the ref (so the ko path is a direct section lookup).
 */
function findWidgetById(
  page: PageContent,
  sectionId: string,
  widgetId: string,
): WidgetNode | null {
  const sections = page.sections ?? [];

  const named = sections.find((section) => section?.id === sectionId);
  if (named) {
    const widget = findWidgetInSection(named, widgetId);
    if (widget) return widget;
  }

  for (const section of sections) {
    if (!section || section === named) continue;
    const widget = findWidgetInSection(section, widgetId);
    if (widget) return widget;
  }
  return null;
}

/**
 * Resolve the target-locale target addressed by a primary-locale registry ref.
 *
 * 1. id lookup in `target` (ko, or any locale whose ids happen to align);
 * 2. positional pairing against `primary`: section index by `sectionId`, widget
 *    index within that section (slide index for `visual[i]` refs), guarded by a
 *    `type` equality check for widgets.
 *
 * Returns `null` when there is no counterpart (unknown key → skipped silently).
 */
export function resolvePairedWidget(
  target: PageContent,
  ref: PairRef,
  primary?: PageContent | null,
): ResolvedTarget | null {
  const visualIndex = visualRefIndex(ref.widgetId);
  if (visualIndex !== null) {
    const directSlide = findVisualSlide(target, ref.sectionId, visualIndex);
    if (directSlide) return directSlide;
    if (!primary) return null;

    const primarySections = primary.sections ?? [];
    const primarySectionIndex = primarySections.findIndex(
      (section) => section?.id === ref.sectionId,
    );
    if (primarySectionIndex < 0) return null;
    if (visualIndex >= (primarySections[primarySectionIndex]?.visual?.length ?? 0)) return null;

    const targetSection = (target.sections ?? [])[primarySectionIndex];
    return targetSection?.visual?.[visualIndex] ?? null;
  }

  const direct = findWidgetById(target, ref.sectionId, ref.widgetId);
  if (direct) return direct;
  if (!primary) return null;

  const primarySections = primary.sections ?? [];
  const sectionIndex = primarySections.findIndex((section) => section?.id === ref.sectionId);
  if (sectionIndex < 0) return null;

  const primaryWidgets = sectionWidgets(primarySections[sectionIndex]);
  const widgetIndex = primaryWidgets.findIndex((widget) => widget.id === ref.widgetId);
  if (widgetIndex < 0) return null;

  const targetSection = (target.sections ?? [])[sectionIndex];
  if (!targetSection) return null;

  const targetWidget = sectionWidgets(targetSection)[widgetIndex] ?? null;
  if (!targetWidget) return null;
  if (targetWidget.type !== primaryWidgets[widgetIndex].type) return null;

  return targetWidget;
}
