import { Rows } from "@/components/content/SectionRenderer";
import { localeHref, type Locale } from "@/lib/i18n";
import { routeForSource } from "@/lib/routes";
import type { NavItem, Node, Section, WidgetNode } from "@/lib/types";

/**
 * Shared footer body — the single source of truth for the public footer
 * (`components/layout/SiteFooter.tsx`) AND the admin Content → Footer preview.
 *
 * `buildFooterRows` performs the row surgery SiteFooter has always done (sitemap
 * sub-link injection from the resolved nav + the spacer rebalance), and
 * `FooterFrame` renders the exact public markup. Both callers therefore cannot
 * drift: the admin preview passes the draft-applied section + resolved nav and
 * gets byte-for-byte the same footer the public site renders.
 *
 * Lives in `components/layout` because it IS the public layout's footer body;
 * the admin preview imports it from here too. It must NOT be given a
 * `"use client"` directive: `SiteFooter` (a server component) calls
 * `buildFooterRows` directly, while the admin preview imports the same module
 * into its own client tree.
 */

/**
 * Inject the sitemap sub-links into a cloned footer row tree and rebalance the
 * leading/trailing spacer rows, mirroring the live original. Never mutates the
 * passed section (the rows are deep-cloned first).
 *
 * The crawl missed the sitemap sub-links, so they are injected from the nav tree
 * (identical set on the live original). The sitemap column is the one whose rows
 * hold the per-group link columns (>=2 of them): KO and EN give it different
 * grid widths, so match the structure, not a fixed grid.
 */
export function buildFooterRows(sec: Section, nav: NavItem[], locale: Locale): Node[] {
  const rows = structuredClone(sec.rows) as Node[];
  for (const n of rows) {
    if (n.kind !== "row") continue;
    for (const col of n.cols) {
      const sitemapRow = col.children.find((c) => c.kind === "row" && c.cols.length > 1);
      if (!sitemapRow || sitemapRow.kind !== "row") continue;
      sitemapRow.cols.forEach((smcol, i) => {
        const links = (nav[i]?.children || []).map((c) => ({
          name: c.name,
          href: localeHref(locale, routeForSource(c.url, locale)),
        }));
        // The first sitemap column is the site's primary nav group ("에코웨이브"
        // / "Ecowave"). Append one discoverable route into the admin dashboard
        // to its links — rendered by the existing `sitemap-links` widget, so it
        // matches the column's other links exactly. Injected at render time
        // (never in content JSON), so the public footer and the admin
        // Content → Footer preview share it. `/admin` is locale-independent
        // (the dashboard has its own KO/EN toggle), hence no `localeHref`. The
        // whole sitemap block is hidden below 992 by `FooterFrame`'s CSS, so the
        // link is desktop-only automatically.
        if (i === 0) links.push({ name: locale === "ko" ? "관리자" : "Admin", href: "/admin" });
        if (links.length === 0) return;
        const w = {
          kind: "widget",
          id: `sitemap-links-${i}`,
          type: "sitemap-links",
          links,
        } as unknown as WidgetNode;
        // replace the (empty on crawl) links row with the real sub-links
        const headRow = smcol.children.find((c) => c.kind === "row");
        smcol.children = [...(headRow ? [headRow] : []), w];
      });
    }
  }

  // imweb insets every row's content ~15px from the row's top; the shared
  // footer's logo/info therefore starts 20px lower than our top-aligned rows
  // render (live-measured: logo +51px below the band top on the original vs
  // +31px local — identical on company/rnd/patents). Move that space from the
  // trailing empty spacer row to the leading one so the footer stays 412px
  // tall (matching the original) while its content aligns.
  const topRow = rows.find((n) => n.kind === "row");
  const bottomRow = [...rows].reverse().find((n) => n.kind === "row");
  if (topRow?.kind === "row" && bottomRow?.kind === "row" && topRow !== bottomRow) {
    topRow.h = (topRow.h ?? 31) + 20;
    bottomRow.h = Math.max(0, (bottomRow.h ?? 31) - 20);
  }

  return rows;
}

/**
 * The shared `<footer>` wrapper: black band, logo + company info left, TOP
 * button + sitemap columns right. Rendered identically on the public site and
 * in the admin preview.
 */
export function FooterFrame({
  section,
  rows,
  locale,
}: {
  section: Section;
  rows: Node[];
  locale: Locale;
}) {
  return (
    <footer data-footer className="relative" style={{ backgroundColor: section.bgColor || "#000" }}>
      {/*
       * Original mobile (390) footer is 300px: imweb renders the TOP button +
       * 5-column sitemap column as `.col-dz-5` with w=0/h=0 (its rows carry
       * `hidden-xs`, i.e. display:none below imweb's 992px breakpoint). The
       * desktop footer keeps that column, so hide it only below 992px. The
       * selector targets the sitemap column structurally — the one whose direct
       * row holds the >=2 link columns — because its grid width differs by
       * locale (grid-5 on KO, grid-7 on EN; a `col-span-5` selector would hide
       * EN's logo/info column instead).
       *
       * Live-verified (2026-09-23) that imweb's `.hidden-xs` flips at 992, NOT
       * bootstrap's 767: the original's 12 `.hidden-xs` footer rows compute
       * `display:none` at 767/768/900/991 and `display:block` at 992+, and the
       * original shows 0 visible footer links at 900 vs 15 at 1200 — exactly
       * like the local `display:none` below 991.98px. Moving this breakpoint to
       * 767 would therefore REGRESS 768-991 by revealing a sitemap the original
       * keeps hidden; keep 991.98.
       */}
      <style>{`
        @media (max-width: 991.98px) {
          [data-footer] .imweb-col:has(> .imweb-row > .imweb-col + .imweb-col) { display: none; }
        }
      `}</style>
      {/* imweb `.inside` insets the footer band 16px below its top on mobile;
          desktop offset is handled by the leading spacer row (51px). */}
      <div aria-hidden className="h-[16px] min-[992px]:hidden" />
      <Rows rows={rows} locale={locale} />
    </footer>
  );
}
