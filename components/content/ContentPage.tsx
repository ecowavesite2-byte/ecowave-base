import PageHero from "@/components/ui/PageHero";
import SectionRenderer, { MOBILE_SECTION, isPageHeroSection } from "@/components/content/SectionRenderer";
import { getResolvedPage } from "@/lib/content/resolved";
import { resolvePageAlias } from "@/lib/content/paths";
import { isSharedIntroSection, sharedIntroFor } from "@/lib/content/shared-intro";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { heroFor, isFooterSection, FOOTER_SECTION_ID } from "@/lib/page-hero";
import type { Section } from "@/lib/types";

/** matches a real mobile-only section, not the desktop `mobile_section_first` marker */
const isMobileSection = (s: Section) => MOBILE_SECTION.test(s.cls || "");

/**
 * Generic static content page: imweb-style page hero (title + sibling tabs)
 * followed by the crawled section tree (hero/footer chrome excluded).
 *
 * Both the pc and mobile section sets are rendered; SectionRenderer resolves
 * visibility per breakpoint. The page-title hero band is rebuilt as <PageHero>,
 * so the first section of each channel is dropped when it is that band.
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
  const page = await getResolvedPage(l, pageKey);
  const hero = await heroFor("/" + pageKey, l);

  const all = page.sections.filter((s) => !isFooterSection(s) && s.id !== FOOTER_SECTION_ID);

  // Shared intro band: the canonical `company.ceo` copy is the single source,
  // and every other `/company*` page renders ITS rows in place of its own dead
  // copy. Replace the rows in place (never the section) so each page keeps its
  // local `id`/`cls`/`bg`: philosophy's band id is in PH48_SECTION_IDS, so
  // swapping it would regress that page's mobile typography. `/company` aliases
  // `company.ceo`, so it already serves the canonical copy and must not swap.
  const shared = sharedIntroFor(pageKey);
  if (shared && resolvePageAlias(pageKey) !== shared.canonicalPageKey) {
    const canonical = await getResolvedPage(l, shared.canonicalPageKey);
    const band = canonical.sections.find((s) => isSharedIntroSection(s, shared));
    if (band) {
      const rows = structuredClone(band.rows); // never mutate the cached page
      for (let i = 0; i < all.length; i += 1) {
        if (isSharedIntroSection(all[i], shared)) all[i] = { ...all[i], rows };
      }
    }
  }

  const dropped = new Set<string>();
  const firstPc = all.find((s) => !isMobileSection(s));
  const firstMobile = all.find(isMobileSection);
  if (firstPc && isPageHeroSection(firstPc)) dropped.add(firstPc.id);
  if (firstMobile && isPageHeroSection(firstMobile)) dropped.add(firstMobile.id);
  const sections = all.filter((s) => !dropped.has(s.id));

  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} big={big} />
      <SectionRenderer sections={sections} />
    </main>
  );
}
