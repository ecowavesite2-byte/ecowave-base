import PageHero from "@/components/ui/PageHero";
import SectionRenderer, { isPageHeroSection, MOBILE_SECTION } from "@/components/content/SectionRenderer";
import FacilitiesTabSection, { isTabSection } from "@/components/content/FacilitiesTabSection";
import { applySharedIntroRows, getResolvedFacilitiesTabs, getResolvedPage } from "@/lib/content/resolved";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { heroFor, isFooterSection, FOOTER_SECTION_ID } from "@/lib/page-hero";

export function generateStaticParams() {
  return [{ locale: "ko" }, { locale: "en" }];
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l: Locale = isLocale(locale) ? locale : defaultLocale;
  const page = await getResolvedPage(l, "rnd/facilities");
  const hero = await heroFor("/rnd/facilities", l);
  const tabs = await getResolvedFacilitiesTabs(l);

  // R&D sub-hero banner is shared: serve the canonical rnd.technology rows in
  // place of this page's own dead copy BEFORE the filtering/splitting below.
  const withSharedIntro = await applySharedIntroRows(l, "rnd/facilities", page.sections);

  // keep both pc and mobile section sets; SectionRenderer resolves visibility per breakpoint.
  // drop only the leading page-title hero band of each channel (rebuilt as <PageHero>)
  const all = withSharedIntro.filter((s) => !isFooterSection(s) && s.id !== FOOTER_SECTION_ID);
  const dropped = new Set<string>();
  const firstPc = all.find((s) => !MOBILE_SECTION.test(s.cls || ""));
  const firstMobile = all.find((s) => MOBILE_SECTION.test(s.cls || ""));
  if (firstPc && isPageHeroSection(firstPc)) dropped.add(firstPc.id);
  if (firstMobile && isPageHeroSection(firstMobile)) dropped.add(firstMobile.id);
  const sections = all.filter((s) => !dropped.has(s.id));
  const tabIdx = sections.findIndex(isTabSection);
  const tabSection = tabIdx === -1 ? null : sections[tabIdx];
  const before = tabIdx === -1 ? sections : sections.slice(0, tabIdx);
  const after = tabIdx === -1 ? [] : sections.slice(tabIdx + 1);

  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} />
      {tabSection ? (
        <>
          <SectionRenderer sections={before} />
          <FacilitiesTabSection section={tabSection} tabs={tabs} locale={l} />
          <SectionRenderer sections={after} />
        </>
      ) : (
        <SectionRenderer sections={sections} />
      )}
    </main>
  );
}
