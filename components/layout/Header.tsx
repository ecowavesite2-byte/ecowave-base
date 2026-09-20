"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { localeHref, type Locale } from "@/lib/i18n";
import { routeForSource } from "@/lib/routes";
import type { NavItem } from "@/lib/types";

type Props = {
  locale: Locale;
  nav: NavItem[];
  logo: string;
  logoScrolled: string;
  langLabelKo: string;
  langLabelEn: string;
};

/** Strip the locale prefix so middleware-rewritten paths behave like canonical ones. */
function normalizePath(pathname: string): string {
  return pathname.replace(/^\/(ko|en)(?=\/|$)/, "") || "/";
}

/** Original-style dropdown list (white, radius 10, 51px items, accent hover). */
function DropList({ items, locale }: { items: { name: string; url: string }[]; locale: Locale }) {
  return (
    <ul className="imweb-dropdown py-2">
      {items.map((c) => (
        <li key={c.url}>
          <Link href={localeHref(locale, routeForSource(c.url))}>{c.name}</Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Site header — transparent over the homepage hero, solid after scroll.
 * Dropdowns on desktop, drawer + accordion on mobile. The language selector
 * sits at the end (right side) of the header; both entries are links.
 */
export default function Header({ locale, nav, logo, logoScrolled, langLabelKo, langLabelEn }: Props) {
  const rawPathname = usePathname() || "/";
  const pathname = normalizePath(rawPathname);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false); // mobile drawer
  const [expanded, setExpanded] = useState<string | null>(null); // mobile accordion
  const isHome = pathname === "/";
  const overlay = isHome && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setExpanded(null);
  }, [rawPathname]);

  // top-level section active state for the mobile carousel nav
  const activeTop = nav.find((item) => {
    const href = normalizePath(localeHref(locale, routeForSource(item.url)));
    if (pathname === href || (href !== "/" && pathname.startsWith(href + "/"))) return true;
    return item.children.some((c) => {
      const ch = normalizePath(localeHref(locale, routeForSource(c.url)));
      return pathname === ch || (ch !== "/" && pathname.startsWith(ch + "/"));
    });
  });

  const otherLocale: Locale = locale === "ko" ? "en" : "ko";
  const otherLabel = locale === "ko" ? langLabelEn.toUpperCase() : langLabelKo;
  const linkCls = overlay ? "text-white group-hover:text-white/50" : "text-ink group-hover:text-ink/50";

  const langTarget = (target: Locale) => {
    if (target === locale) return pathname;
    if (target === "en") {
      return pathname.startsWith("/en") ? pathname : "/en" + (pathname === "/" ? "" : pathname);
    }
    return pathname.startsWith("/en") ? pathname.slice(3) || "/" : pathname;
  };

  return (
    <>
      {/*
       * The original imweb header is `position: relative` and occupies document
       * flow (88px desktop / 104px mobile) on every subpage; only the home page
       * is a 0px overlay over the hero. This in-flow spacer reproduces that so
       * subpage content is not shifted ~88px too high, while the header itself
       * keeps its fixed/overlay scroll behaviour (metrics: header.h=88, pos=relative).
       */}
      {!isHome && <div aria-hidden className="h-[104px] min-[992px]:h-[88px]" />}
      <header
        id="doz_header"
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          overlay ? "bg-transparent" : "bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]"
        }`}
      >
      <div className="relative flex h-[58px] items-center px-[15px] min-[992px]:h-[88px] min-[992px]:px-[30px]">
        {/* mobile hamburger — left */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          className="relative z-10 flex h-10 w-10 flex-col items-center justify-center gap-[5px] min-[992px]:hidden"
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-[2px] w-6 ${overlay ? "bg-white" : "bg-ink"}`} />
          ))}
        </button>
        <Link href={localeHref(locale, "/")} className="relative z-10 mx-auto shrink-0 min-[992px]:mx-0">
          <Image
            src={overlay ? logo : logoScrolled}
            alt="ECOWAVE"
            width={266}
            height={72}
            priority
            className="h-8 w-auto min-[992px]:h-[72px]"
          />
        </Link>
        {/* mobile spacer balancing the hamburger so the logo stays centered */}
        <span className="w-10 min-[992px]:hidden" aria-hidden />

        {/* desktop nav — full 5-item menu at 1500px and up */}
        <nav className="ml-auto hidden items-stretch min-[1500px]:flex [font-family:var(--font-poppins),Pretendard,'Apple_SD_Gothic_Neo',sans-serif]" aria-label="주 메뉴">
          <ul className="flex items-stretch">
            {nav.map((item) => {
              return (
                <li key={item.url} className="group relative">
                  <Link
                    href={localeHref(locale, routeForSource(item.url))}
                    className={`block px-[30px] py-[20px] text-[19px] font-normal leading-[30px] transition duration-300 ${
                      overlay ? "text-white group-hover:text-white/50" : "text-ink group-hover:text-ink/50"
                    }`}
                  >
                    {item.name}
                  </Link>
                  {item.children.length > 0 && (
                    <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-1 opacity-0 transition-opacity duration-500 ease-in-out group-hover:visible group-hover:opacity-100">
                      <ul className="imweb-dropdown py-2">
                        {item.children.map((c) => (
                          <li key={c.url}>
                            <Link
                              href={localeHref(locale, routeForSource(c.url))}
                            >
                              {c.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* language selector — single link to the other locale, like the original */}
          <div className="flex items-center self-center">
            <Link
              href={langTarget(otherLocale)}
              className={`text-[15px] transition duration-300 ${overlay ? "text-white hover:text-white/50" : "text-ink hover:text-ink/50"}`}
            >
              {otherLabel}
            </Link>
          </div>
        </nav>

        {/* condensed desktop nav — first 3 items + "..." overflow at 992–1499px */}
        <nav className="ml-auto hidden items-stretch min-[992px]:flex min-[1500px]:hidden [font-family:var(--font-poppins),Pretendard,'Apple_SD_Gothic_Neo',sans-serif]" aria-label="주 메뉴">
          <ul className="flex items-stretch">
            {nav.slice(0, 3).map((item) => (
              <li key={item.url} className="group relative">
                <Link
                  href={localeHref(locale, routeForSource(item.url))}
                  className={`block px-[30px] py-[20px] text-[19px] font-normal leading-[30px] transition duration-300 ${linkCls}`}
                >
                  {item.name}
                </Link>
                {item.children.length > 0 && (
                  <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-1 opacity-0 transition-opacity duration-500 ease-in-out group-hover:visible group-hover:opacity-100">
                    <DropList items={item.children} locale={locale} />
                  </div>
                )}
              </li>
            ))}
            <li className="group/more relative">
              <button
                type="button"
                aria-label="더보기"
                className={`flex h-[70px] w-[79px] items-center justify-center transition-colors ${overlay ? "text-white" : "text-ink"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
              <div className="invisible absolute right-0 top-full z-50 pt-1 opacity-0 transition-all duration-200 group-hover/more:visible group-hover/more:opacity-100">
                <ul className="imweb-dropdown py-2" style={{ minWidth: 160 }}>
                  {nav.slice(3).map((item) => (
                    <li key={item.url} className="group/sub relative">
                      <Link href={localeHref(locale, routeForSource(item.url))}>
                        {item.name}
                      </Link>
                      {item.children.length > 0 && (
                        <div className="invisible absolute left-full top-0 z-50 opacity-0 transition-all duration-200 group-hover/sub:visible group-hover/sub:opacity-100">
                          <DropList items={item.children} locale={locale} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          </ul>
          <div className="flex items-center self-center">
            <Link
              href={langTarget(otherLocale)}
              className={`text-[15px] transition duration-300 ${overlay ? "text-white hover:text-white/50" : "text-ink hover:text-ink/50"}`}
            >
              {otherLabel}
            </Link>
          </div>
        </nav>
      </div>

      {/* mobile carousel nav — scrollable top-level links under the top row */}
      <nav className="min-[992px]:hidden" aria-label="모바일 섹션 메뉴">
        <div className="flex h-[46px] items-center gap-[11px] overflow-x-auto bg-white px-0 pl-[15px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map((item) => {
            const isActive = activeTop?.url === item.url;
            return (
              <Link
                key={item.url}
                href={localeHref(locale, routeForSource(item.url))}
                aria-current={isActive ? "page" : undefined}
                className={`whitespace-nowrap text-[14px] leading-[45px] transition duration-300 ${
                  isActive ? "font-bold text-accent" : "font-normal text-[#212121]"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* mobile drawer */}
      <div className={`fixed inset-0 z-40 min-[992px]:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute inset-y-0 right-0 flex w-[320px] max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-300 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex h-[58px] items-center justify-between border-b border-line px-5">
            <Image src={logoScrolled} alt="ECOWAVE" width={150} height={40} className="h-9 w-auto" />
            <button type="button" onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="p-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#212121" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-5 py-4" aria-label="모바일 전체 메뉴">
            <ul className="divide-y divide-line">
              {nav.map((item) => {
                const isOpen = expanded === item.url;
                return (
                  <li key={item.url} className="py-1">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between py-3 text-left text-[16px] font-semibold text-ink"
                      onClick={() => setExpanded(isOpen ? null : item.url)}
                    >
                      {item.name}
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#959595"
                        strokeWidth="2"
                        className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <ul className={`${isOpen ? "block" : "hidden"} pb-3 pl-1`}>
                      {item.children.map((c) => (
                        <li key={c.url}>
                          <Link
                            href={localeHref(locale, routeForSource(c.url))}
                            className="block py-2.5 pl-3 text-[15px] text-body hover:text-accent"
                          >
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex items-center gap-2 border-t border-line px-5 py-4 text-[14px] text-muted">
            <Link href={langTarget("ko")} className={`transition duration-300 hover:text-accent ${locale === "ko" ? "font-semibold text-ink" : ""}`}>
              {langLabelKo}
            </Link>
            <span className="opacity-40">|</span>
            <Link href={langTarget("en")} className={`transition duration-300 hover:text-accent ${locale === "en" ? "font-semibold text-ink" : ""}`}>
              {langLabelEn}
            </Link>
          </div>
        </div>
      </div>
      </header>
    </>
  );
}
