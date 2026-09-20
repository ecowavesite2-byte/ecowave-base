import PageHero from "@/components/ui/PageHero";
import SectionRenderer, { MOBILE_SECTION, isPageHeroSection } from "@/components/content/SectionRenderer";
import { getPageForRender } from "@/lib/content/drafts";
import type { Locale } from "@/lib/i18n";
import type { Node, Section } from "@/lib/types";
import {
  heroFor,
  isBoardSection,
  isFooterSection,
  FOOTER_SECTION_ID,
} from "@/lib/page-hero";
import React from "react";

/** imweb board rows carry 15px vertical row padding on each side of the widget */
const BOARD_ROW_PAD = 15;

/** recursively detect the imweb board widget inside a node tree */
function hasBoardNode(nodes: Node[]): boolean {
  return nodes.some((n) =>
    n.kind === "widget"
      ? n.type === "board"
      : n.kind === "col"
        ? hasBoardNode(n.children)
        : hasBoardNode(n.cols),
  );
}

/** sum of the measured desktop row heights of a section's rows */
function rowsHeight(rows: Node[]): number {
  return rows.reduce((sum, r) => sum + (r.kind === "row" ? r.h ?? 0 : 0), 0);
}

/**
 * Desktop row heights of the padding bands before/after the board widget.
 *
 * SC6: these are DESKTOP measurements and must not be applied verbatim as
 * inline padding on mobile — imweb halves the padding widgets at mobile
 * (110 -> 55) and keeps the 15px row padding unscaled. Render the measured
 * height as an exact half on mobile and the full value at >=992px (the shared
 * `.spacer` renders 55%, not 50%) plus a fixed BOARD_ROW_PAD strip, so desktop
 * stays `row + 15` and mobile becomes `row/2 + 15`.
 */
function boardSectionRows(section: Section | undefined): { found: boolean; top: number; bottom: number } {
  if (!section) return { found: false, top: 0, bottom: 0 };
  const boardRow = section.rows.findIndex((r) => r.kind === "row" && hasBoardNode(r.cols));
  if (boardRow < 0) return { found: false, top: 0, bottom: 0 };
  return {
    found: true,
    top: rowsHeight(section.rows.slice(0, boardRow)),
    bottom: rowsHeight(section.rows.slice(boardRow + 1)),
  };
}

/**
 * Shell for board pages: page hero + the page's own banner/other sections
 * (from the crawl) + the board UI in place of the imweb board widget.
 *
 * Both the pc and mobile section sets are kept in DOM order; SectionRenderer
 * resolves visibility per breakpoint. The page-title hero band (desktop and
 * mobile variants) is replaced by <PageHero> and dropped.
 */
export default async function BoardPageShell({
  locale,
  pageKey,
  big = false,
  renderBoard,
}: {
  locale: Locale;
  pageKey: string;
  big?: boolean;
  renderBoard: () => React.ReactNode;
}) {
  const page = await getPageForRender(locale, pageKey);
  const hero = heroFor("/" + pageKey, locale);
  const all = page.sections.filter((s) => !isFooterSection(s) && s.id !== FOOTER_SECTION_ID);
  const isMobile = (s: Section) => MOBILE_SECTION.test(s.cls || "");
  const dropped = new Set<string>();
  const firstPc = all.find((s) => !isMobile(s));
  const firstMobile = all.find(isMobile);
  if (firstPc && isPageHeroSection(firstPc)) dropped.add(firstPc.id);
  if (firstMobile && isPageHeroSection(firstMobile)) dropped.add(firstMobile.id);
  const content = all.filter((s) => !dropped.has(s.id));
  const boardIdx = content.findIndex(isBoardSection);
  const before = boardIdx === -1 ? content : content.slice(0, boardIdx);
  const after = boardIdx === -1 ? [] : content.slice(boardIdx + 1);
  const boardPad = boardSectionRows(boardIdx === -1 ? undefined : content[boardIdx]);
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} big={big} />
      <SectionRenderer sections={before} locale={locale} />
      <section className="mx-auto max-w-[1280px] px-[15px]">
        {boardPad.found && (
          <>
            {boardPad.top > 0 && (
              <>
                {/* imweb halves padding widgets at mobile (110 -> 55); the shared
                    .spacer renders 55% (globals.css), so use the exact half here */}
                <div aria-hidden className="min-[992px]:hidden" style={{ height: Math.round(boardPad.top / 2) }} />
                <div aria-hidden className="hidden min-[992px]:block" style={{ height: boardPad.top }} />
              </>
            )}
            <div aria-hidden style={{ height: BOARD_ROW_PAD }} />
          </>
        )}
        {renderBoard()}
        {boardPad.found && (
          <>
            <div aria-hidden style={{ height: BOARD_ROW_PAD }} />
            {boardPad.bottom > 0 && (
              <>
                <div aria-hidden className="min-[992px]:hidden" style={{ height: Math.round(boardPad.bottom / 2) }} />
                <div aria-hidden className="hidden min-[992px]:block" style={{ height: boardPad.bottom }} />
              </>
            )}
          </>
        )}
      </section>
      <SectionRenderer sections={after} locale={locale} />
    </main>
  );
}
