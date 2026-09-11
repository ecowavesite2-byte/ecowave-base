import PageHero from "@/components/ui/PageHero";
import SectionRenderer from "@/components/content/SectionRenderer";
import { getPage } from "@/lib/content";
import type { Locale } from "@/lib/i18n";
import {
  heroFor,
  isBoardSection,
  isFooterSection,
  FOOTER_SECTION_ID,
} from "@/lib/page-hero";
import React from "react";

/**
 * Shell for board pages: page hero + the page's own banner/other sections
 * (from the crawl) + the board UI in place of the imweb board widget.
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
  const desktop = page.sections.filter(
    (s) =>
      !/mobile_section/.test(s.cls || "") &&
      !isFooterSection(s) &&
      s.id !== FOOTER_SECTION_ID,
  ).slice(1); // first desktop section = page-title hero
  const boardIdx = desktop.findIndex(isBoardSection);
  const before = boardIdx === -1 ? desktop : desktop.slice(0, boardIdx);
  const after = boardIdx === -1 ? [] : desktop.slice(boardIdx + 1);
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} big={big} />
      <SectionRenderer sections={before} />
      <section className="mx-auto max-w-[1440px] px-5 pb-24 lg:px-10">{renderBoard()}</section>
      <SectionRenderer sections={after} />
    </main>
  );
}
