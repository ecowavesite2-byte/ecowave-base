import type { Node, PageContent, Section, WidgetNode } from "../types";

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
 * Hero slide lists (`visual/slides`) replace a whole array, so they resolve a
 * SECTION instead (see `resolvePairedSection`).
 *
 * Pure and dependency-free (types only) — safe on server, client and in tests.
 */

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

/**
 * Widget types skipped when pairing KO ↔ EN positionally: they carry no
 * overridable content (padding spacers, horizontal rules, raw code embeds), so
 * they must not shift the alignment of the editable widgets around them.
 * Mirrors `PAIR_IGNORED_TYPES` in scripts/gen-content-registry.mjs (a unit test
 * asserts the two sets stay identical).
 */
export const PAIR_IGNORED_TYPES = new Set(["padding", "hr", "code"]);

function findWidgetInSection(section: Section, widgetId: string): WidgetNode | null {
  return sectionWidgets(section).find((widget) => widget.id === widgetId) ?? null;
}

/** Section by id, or null (shared by the widget and section resolvers). */
function findSection(page: PageContent, sectionId: string): Section | null {
  return (page.sections ?? []).find((section) => section?.id === sectionId) ?? null;
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
 * Resolve the target-locale widget addressed by a primary-locale registry ref.
 *
 * 1. id lookup in `target` (ko, or any locale whose ids happen to align);
 * 2. positional pairing against `primary`: section index by `sectionId`, widget
 *    index within that section, guarded by a `type` equality check.
 *
 * Returns `null` when there is no counterpart (unknown key → skipped silently).
 */
export function resolvePairedWidget(
  target: PageContent,
  ref: PairRef,
  primary?: PageContent | null,
): WidgetNode | null {
  const direct = findWidgetById(target, ref.sectionId, ref.widgetId);
  if (direct) return direct;
  if (!primary) return null;

  const primarySections = primary.sections ?? [];
  const sectionIndex = primarySections.findIndex((section) => section?.id === ref.sectionId);
  if (sectionIndex < 0) return null;

  const primaryWidgets = sectionWidgets(primarySections[sectionIndex]).filter(
    (widget) => !PAIR_IGNORED_TYPES.has(widget.type),
  );
  const widgetIndex = primaryWidgets.findIndex((widget) => widget.id === ref.widgetId);
  if (widgetIndex < 0) return null;

  const targetSection = (target.sections ?? [])[sectionIndex];
  if (!targetSection) return null;

  const targetWidgets = sectionWidgets(targetSection).filter(
    (widget) => !PAIR_IGNORED_TYPES.has(widget.type),
  );
  const targetWidget = targetWidgets[widgetIndex] ?? null;
  if (!targetWidget) return null;
  if (targetWidget.type !== primaryWidgets[widgetIndex].type) return null;

  return targetWidget;
}

/**
 * Resolve the target-locale SECTION addressed by a primary-locale registry ref
 * (used by the `visual/slides` hero-list def, which replaces a whole slide
 * array rather than one widget field). Id lookup first, then positional pairing
 * against `primary` exactly like `resolvePairedWidget`.
 */
export function resolvePairedSection(
  target: PageContent,
  ref: PairRef,
  primary?: PageContent | null,
): Section | null {
  const direct = findSection(target, ref.sectionId);
  if (direct) return direct;
  if (!primary) return null;

  const primarySections = primary.sections ?? [];
  const index = primarySections.findIndex((section) => section?.id === ref.sectionId);
  if (index < 0) return null;
  return (target.sections ?? [])[index] ?? null;
}
