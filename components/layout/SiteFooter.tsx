import { Rows } from "@/components/content/SectionRenderer";
import { getResolvedPage, getResolvedSite } from "@/lib/content/resolved";
import { localeHref, type Locale } from "@/lib/i18n";
import { isFooterSection } from "@/lib/page-hero";
import { routeForSource } from "@/lib/routes";
import type { Node, WidgetNode } from "@/lib/types";

/**
 * Site footer rendered from the crawled footer section rows (identical on
 * every original page): black band, logo + company info left, TOP button +
 * 5 sitemap columns right. The crawl missed the sitemap sub-links, so they
 * are injected from the nav tree (identical set on the live original).
 * Rendered at layout level so board detail pages keep the footer too.
 */
export default async function SiteFooter({ locale }: { locale: Locale }) {
  const page = await getResolvedPage(locale, "home");
  const sec = page.sections.find(isFooterSection);
  if (!sec) return null;

  const rows = structuredClone(sec.rows) as Node[];
  const nav = (await getResolvedSite(locale)).nav;
  for (const n of rows) {
    if (n.kind !== "row") continue;
    for (const col of n.cols) {
      // The sitemap column is the one whose rows hold the per-group link
      // columns (>=2 of them). KO and EN give it different grid widths (the EN
      // crawl puts logo/info on grid 5 and the sitemap on grid 7, the KO
      // footer the reverse), so match the structure, not `grid === "5"` — an id
      // fix alone would otherwise inject the sub-links into EN's logo column.
      const sitemapRow = col.children.find((c) => c.kind === "row" && c.cols.length > 1);
      if (!sitemapRow || sitemapRow.kind !== "row") continue;
      sitemapRow.cols.forEach((smcol, i) => {
        const links = nav[i]?.children || [];
        if (links.length === 0) return;
        const w = {
          kind: "widget",
          id: `sitemap-links-${i}`,
          type: "sitemap-links",
          links: links.map((c) => ({
            name: c.name,
            href: localeHref(locale, routeForSource(c.url)),
          })),
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

  return (
    <footer data-footer className="relative" style={{ backgroundColor: sec.bgColor || "#000" }}>
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
