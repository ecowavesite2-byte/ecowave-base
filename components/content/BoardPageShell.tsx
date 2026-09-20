import PageHero from "@/components/ui/PageHero";
import SectionRenderer, { MOBILE_SECTION, isPageHeroSection } from "@/components/content/SectionRenderer";
import { getPage } from "@/lib/content";
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
 * imweb renders the board widget inside a section whose rows before/after it
 * are padding bands. Reproduce that vertical rhythm around the local board UI
 * (the widget height itself is replaced by our own markup).
 */
function boardSectionPadding(section: Section | undefined): { top: number; bottom: number } {
  if (!section) return { top: 0, bottom: 0 };
  const boardRow = section.rows.findIndex((r) => r.kind === "row" && hasBoardNode(r.cols));
  if (boardRow < 0) return { top: 0, bottom: 0 };
  return {
    top: rowsHeight(section.rows.slice(0, boardRow)) + BOARD_ROW_PAD,
    bottom: rowsHeight(section.rows.slice(boardRow + 1)) + BOARD_ROW_PAD,
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
  const page = getPage(locale, pageKey);
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
  const boardPad = boardSectionPadding(boardIdx === -1 ? undefined : content[boardIdx]);
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} big={big} />
      <SectionRenderer sections={before} locale={locale} />
      <section
        className="mx-auto max-w-[1280px] px-[15px]"
        style={{ paddingTop: boardPad.top, paddingBottom: boardPad.bottom }}
      >
        {renderBoard()}
      </section>
      <SectionRenderer sections={after} locale={locale} />
    </main>
  );
}
