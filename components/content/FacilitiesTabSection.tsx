import { Rows } from "@/components/content/SectionRenderer";
import FacilitiesTabs, { type FacilitiesTab } from "@/components/content/FacilitiesTabs";
import type { Locale } from "@/lib/i18n";
import type { Node, Section, WidgetNode } from "@/lib/types";

/**
 * rnd.facilities tab band — the shared rebuild of the raw imweb `code` widget
 * (`tab-menu` + 21KB `tab-content` with all three gallery panes).
 *
 * Extracted verbatim from `app/[locale]/rnd/facilities/page.tsx` so the public
 * page and the admin `SectionPreview` render the SAME markup: those two call
 * sites must never drift. Server-compatible (no hooks, no "use client"): it
 * renders `Rows` (server `SectionRenderer`) and the `FacilitiesTabs` client
 * island. Props are `{ section, tabs, locale }`.
 */

function widgetsInRows(rows: Node[]): WidgetNode[] {
  const out: WidgetNode[] = [];
  const walk = (n: Node) => {
    if (n.kind === "widget") out.push(n);
    else if (n.kind === "row") n.cols.forEach((c) => c.children.forEach(walk));
    else if (n.kind === "col") n.children.forEach(walk);
  };
  rows.forEach(walk);
  return out;
}

function hasCodeMarkup(node: Node, marker: string): boolean {
  return widgetsInRows([node]).some(
    (w) => w.type === "code" && (w.html || "").includes(marker),
  );
}

/** True when the section carries the raw imweb tab `code` widget. */
export function isTabSection(section: Section): boolean {
  return widgetsInRows(section.rows).some(
    (w) => w.type === "code" && (w.html || "").includes("tab-menu"),
  );
}

/**
 * The imweb heading text widget is `visibility:hidden` on the live original but
 * still occupies its 88px band. Keep the space, hide the glyphs.
 */
function hideFirstText(rows: Node[]): Node[] {
  let done = false;
  const walk = (nodes: Node[]): Node[] =>
    nodes.map((n) => {
      if (done) return n;
      if (n.kind === "widget") {
        if (n.type !== "text") return n;
        done = true;
        return { ...n, html: `<div style="visibility:hidden">${n.html || ""}</div>` };
      }
      if (n.kind === "row")
        return { ...n, cols: n.cols.map((c) => ({ ...c, children: walk(c.children) })) };
      if (n.kind === "col") return { ...n, children: walk(n.children) };
      return n;
    });
  return walk(rows);
}

/**
 * imweb renders a zero-height padding widget at `min-height:1px` PLUS the 15px
 * `.inside .widget` gutter (measured live at 390 on the original facilities §2:
 * the 0px spacer renders widget 1 + margin 15 = 16px row). The local rebuild
 * dropped it entirely (renderPadding returns null for `_h <= 0`), leaving the
 * section 16px short. The `.spacer` mobile formula already folds the gutter in
 * (`height: calc(var(--h) * 0.5px + 15px)`), so `_h = 2` maps to exactly 16px;
 * on desktop the crawled `--row-h` (31) still pins the row.
 */
function materializeZeroPaddings(rows: Node[]): Node[] {
  const walk = (nodes: Node[]): Node[] =>
    nodes.map((n) => {
      if (n.kind === "widget") {
        if (n.type === "padding") {
          const raw = (n as unknown as { _h?: number })._h;
          const h =
            typeof raw === "number"
              ? raw
              : (() => {
                  const m = (n.html || "").match(/data-height="(-?[\d.]+)"/);
                  return m ? parseFloat(m[1]) : 0;
                })();
          if (h <= 0) return { ...n, _h: 2 } as Node;
        }
        return n;
      }
      if (n.kind === "row")
        return { ...n, cols: n.cols.map((c) => ({ ...c, children: walk(c.children) })) };
      if (n.kind === "col") return { ...n, children: walk(n.children) };
      return n;
    });
  return walk(rows);
}

/** tab band: normal rows up to the tab menu, the interactive gallery, then the trailing rows */
export default function FacilitiesTabSection({
  section,
  tabs,
  locale,
}: {
  section: Section;
  tabs: FacilitiesTab[];
  locale: Locale;
}) {
  const rows = materializeZeroPaddings(section.rows);
  const menuIdx = rows.findIndex((r) => hasCodeMarkup(r, "tab-menu"));
  const bodyIdx = rows.findIndex((r) => hasCodeMarkup(r, "tab-content"));
  const head = hideFirstText(menuIdx === -1 ? rows : rows.slice(0, menuIdx));
  const tail = bodyIdx === -1 ? [] : rows.slice(bodyIdx + 1);
  return (
    <section
      // `pc-at-mobile` re-applies imweb's mobile type downscale (heading 48->28)
      // and the `vGutter` Rows prop re-applies the 7.5px `.inside .widget` band
      // to the nested text rows — exactly what SectionRenderer does for the
      // pc-authored sections everywhere else. Measured live at 390 on the
      // original §2: heading row 49 (was 58), intro row 105 (was 90).
      className="relative pc-at-mobile"
      style={{ backgroundColor: section.bgColor || "#F9F9F9" }}
    >
      {/* The tab gallery itself is rebuilt by FacilitiesTabs (not owned here);
          its mobile grid geometry is corrected from this scope. The original
          mobile grid is a 2-column table whose image cells are `(100% - ~40px)/2`
          wide with a 5px cell pad and a 10px row pitch, and the cell keeps the
          175:261 aspect from the live 390 measurement (grid 370x1355 vs the
          local 390x1339). The override is proportional (no pinned width/height)
          so it tracks the original's scaling across the 768-991 band instead of
          collapsing it, and the original's trailing gutter is 8px, not 16px.
          Measured live: 390 grid 370x1355 (img 175x261), 991 grid 974x3614
          (img 479x714). */}
      <style>{`
        @media (max-width: 991.98px) {
          [data-fac-tabs] .grid {
            padding-left: 10px;
            padding-right: 10px;
            padding-top: 5px;
            padding-bottom: 5px;
            column-gap: 20px;
            row-gap: 10px;
            margin-top: 70px;
            margin-bottom: 8px;
          }
          [data-fac-tabs] .grid img {
            aspect-ratio: 175 / 261;
            height: auto;
          }
        }
      `}</style>
      <div className="relative">
        <Rows rows={head} locale={locale} vGutter />
        <div data-fac-tabs>
          <FacilitiesTabs tabs={tabs} />
        </div>
        <Rows rows={tail} locale={locale} vGutter />
      </div>
    </section>
  );
}
