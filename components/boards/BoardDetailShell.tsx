import SectionRenderer, { MOBILE_SECTION, isPageHeroSection } from "@/components/content/SectionRenderer";
import { getResolvedPage } from "@/lib/content/resolved";
import type { Locale } from "@/lib/i18n";
import type { Node, Section } from "@/lib/types";
import { isBoardSection, isFooterSection, FOOTER_SECTION_ID } from "@/lib/page-hero";
import type { ReactNode } from "react";

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
 * Same measurement as BoardPageShell: imweb halves the padding widgets at
 * mobile (110 -> 55) but keeps the 15px row padding unscaled, so the bands
 * render at half height below 992 and full height above.
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
 * Shell for board DETAIL pages: the same page sections the list page shows
 * (dark banner / form / spacers, from the crawl) wrapped around the post view
 * instead of the board list. This is what the original imweb board does in
 * `bmode=view` — the detail is the page's sections with the board widget in
 * view mode.
 *
 * `hero` is the page's <PageHero> node (each board configures its own title /
 * subtitle / mobile nav), `children` is the post view (PostDetail).
 *
 * The page-title hero band is dropped (replaced by `hero`), the black footer
 * band is left to the global layout, and the board widget's own section is
 * replaced by `children` while keeping its measured top/bottom padding bands.
 */
export default async function BoardDetailShell({
  locale,
  pageKey,
  hero,
  children,
}: {
  locale: Locale;
  pageKey: string;
  hero: ReactNode;
  children: ReactNode;
}) {
  const page = await getResolvedPage(locale, pageKey);
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
      {hero}
      <SectionRenderer sections={before} locale={locale} />
      <section className="mx-auto max-w-[1280px] px-[15px]">
        {boardPad.found && (
          <>
            {boardPad.top > 0 && (
              <>
                {/* imweb halves padding widgets at mobile (110 -> 55) and adds the
                    15px widget gutter, so render the measured desktop band at the
                    exact half below 992 and the full value above */}
                <div aria-hidden className="min-[992px]:hidden" style={{ height: Math.round(boardPad.top / 2) }} />
                <div aria-hidden className="hidden min-[992px]:block" style={{ height: boardPad.top }} />
              </>
            )}
            <div aria-hidden style={{ height: BOARD_ROW_PAD }} />
          </>
        )}
        {children}
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
