import PageHero from "@/components/ui/PageHero";
import SectionRenderer from "@/components/content/SectionRenderer";
import { getPage } from "@/lib/content";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { heroFor, isFooterSection, FOOTER_SECTION_ID } from "@/lib/page-hero";

/**
 * Generic static content page: imweb-style page hero (title + sibling tabs)
 * followed by the crawled section tree (hero/footer chrome excluded).
 */
export default async function ContentPage({
  params,
  pageKey,
  big = false,
}: {
  params: Promise<{ locale: string }>;
  pageKey: string;
  big?: boolean;
}) {
  const { locale } = await params;
  const l: Locale = isLocale(locale) ? locale : defaultLocale;
  const page = getPage(l, pageKey);
  const hero = heroFor("/" + pageKey, l);
  const desktop = page.sections.filter(
    (s) => !/mobile_section/.test(s.cls || "") && !isFooterSection(s) && s.id !== FOOTER_SECTION_ID,
  );
  // the first desktop section of every subpage is the page-title hero
  const sections = desktop.slice(1);
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} big={big} />
      <SectionRenderer sections={sections} />
    </main>
  );
}
