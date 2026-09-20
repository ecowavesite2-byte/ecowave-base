import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import SiteFooter from "@/components/layout/SiteFooter";
import FloatingTop from "@/components/layout/FloatingTop";
import HtmlLang from "@/components/layout/HtmlLang";
import { getSite } from "@/lib/content";
import { isLocale, defaultLocale, type Locale } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";

export function generateStaticParams() {
  return [{ locale: "ko" }, { locale: "en" }];
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l: Locale = isLocale(locale) ? locale : defaultLocale;
  return {
    title: {
      default: l === "ko" ? "에코웨이브" : "ECOWAVE",
      template: l === "ko" ? "%s | 에코웨이브" : "%s | ECOWAVE",
    },
    description:
      l === "ko"
        ? "깨끗한 물을 위한 기술 혁신과 친환경 가치 실현, 에코웨이브"
        : "Clean Water, Healthy People — ECOWAVE",
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const l: Locale = isLocale(locale) ? locale : defaultLocale;
  const site = getSite(l);
  const normalLogo =
    (site.logos.find((x) => /normal_logo/.test(x.cls)) || site.logos[0])?.src ||
    "/images/upload/S20250811e0bd2f7c414df/f04049636b82b.png";
  const scrollLogo = site.logos.find((x) => /scroll_logo/.test(x.cls))?.src || normalLogo;
  const strings = ui(l);
  return (
    <>
      <HtmlLang lang={l} />
      <Header
        locale={l}
        nav={site.nav}
        logo={normalLogo}
        logoScrolled={scrollLogo}
        langLabelKo={strings.lang.ko}
        langLabelEn={strings.lang.en}
      />
      {children}
      <SiteFooter locale={l} />
      <FloatingTop />
    </>
  );
}
