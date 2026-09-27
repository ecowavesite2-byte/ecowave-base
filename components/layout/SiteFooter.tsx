import { buildFooterRows, FooterFrame } from "./FooterBody";
import { getResolvedPage, getResolvedSite } from "@/lib/content/resolved";
import { isFooterSection } from "@/lib/page-hero";
import type { Locale } from "@/lib/i18n";

/**
 * Site footer rendered from the crawled footer section rows (identical on
 * every original page): black band, logo + company info left, TOP button +
 * 5 sitemap columns right. The crawl missed the sitemap sub-links, so they
 * are injected from the nav tree (identical set on the live original).
 * Rendered at layout level so board detail pages keep the footer too.
 *
 * The row surgery + markup live in the shared `FooterBody` module so the admin
 * Content → Footer preview renders the exact same footer (no drift).
 */
export default async function SiteFooter({ locale }: { locale: Locale }) {
  const page = await getResolvedPage(locale, "home");
  const sec = page.sections.find(isFooterSection);
  if (!sec) return null;

  const nav = (await getResolvedSite(locale)).nav;
  const rows = buildFooterRows(sec, nav, locale);
  return <FooterFrame section={sec} rows={rows} locale={locale} />;
}
