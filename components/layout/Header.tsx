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

/**
 * Site header — transparent over the homepage hero, solid after scroll.
 * Dropdowns on desktop, drawer + accordion on mobile. The language selector
 * sits at the end (right side) of the header.
 */
export default function Header({
  locale,
  nav,
  logo,
  logoScrolled,
  langLabelKo,
  langLabelEn,
}: Props) {
  const pathname = usePathname() || "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false); // mobile drawer
  const [expanded, setExpanded] = useState<string | null>(null); // mobile accordion
  const overlay =
    pathname === "/" || pathname === "/en" || pathname.startsWith("/en/");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setExpanded(null);
  }, [pathname]);

  const solid = scrolled || !overlay;

  const langTarget = (target: Locale) => {
    if (target === locale) return pathname;
    if (target === "en") {
      return pathname.startsWith("/en")
        ? pathname
        : "/en" + (pathname === "/" ? "" : pathname);
    }
    return pathname.startsWith("/en") ? pathname.slice(3) || "/" : pathname;
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? "bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-5 lg:h-[105px] lg:px-10">
        <Link href={localeHref(locale, "/")} className="relative z-10 shrink-0">
          <Image
            src={solid ? logoScrolled : logo}
            alt="ECOWAVE"
            width={190}
            height={44}
            priority
            className="h-9 w-auto lg:h-11"
          />
        </Link>

        {/* desktop nav */}
        <nav
          className="hidden flex-1 items-center justify-center lg:flex"
          aria-label="주 메뉴"
        >
          <ul className="flex items-stretch">
            {nav.map((item) => {
              const href = localeHref(locale, routeForSource(item.url));
              const active =
                pathname === href ||
                (href !== "/" && pathname.startsWith(href)) ||
                item.children.some(
                  (c) => pathname === localeHref(locale, routeForSource(c.url)),
                );
              return (
                <li key={item.url} className="group relative">
                  <Link
                    href={localeHref(locale, routeForSource(item.url))}
                    className={`block px-[30px] py-9 text-[17px] xl:text-[19px] font-normal leading-[30px] transition-colors ${
                      solid ? "text-ink" : "text-white"
                    } ${active ? "font-semibold" : ""} group-hover:!text-accent`}
                  >
                    {item.name}
                  </Link>
                  {item.children.length > 0 && (
                    <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-1 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                      <ul className="min-w-[190px] whitespace-nowrap border-t-2 border-accent bg-white py-2 shadow-lg">
                        {item.children.map((c) => (
                          <li key={c.url}>
                            <Link
                              href={localeHref(locale, routeForSource(c.url))}
                              className="block px-6 py-2.5 text-[15px] text-body hover:bg-soft hover:text-accent"
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
        </nav>

        {/* language selector — end of header */}
        <div
          className={`relative z-10 hidden items-center gap-1 text-[14px] lg:flex ${
            solid ? "text-muted" : "text-white/80"
          }`}
        >
          <span className={locale === "ko" ? "font-semibold text-current" : ""}>
            {langLabelKo}
          </span>
          <span className="mx-1.5 opacity-40">|</span>
          <Link
            href={langTarget("en")}
            className={locale === "en" ? "font-semibold" : "hover:text-accent"}
          >
            {langLabelEn}
          </Link>
        </div>

        {/* mobile hamburger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          className="relative z-10 flex h-10 w-10 flex-col items-center justify-center gap-[5px] lg:hidden"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-[2px] w-6 ${solid ? "bg-ink" : "bg-white"}`}
            />
          ))}
        </button>
      </div>

      {/* mobile drawer */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute inset-y-0 right-0 flex w-[320px] max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-300 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex h-[72px] items-center justify-between border-b border-line px-5">
            <Image
              src={logo}
              alt="ECOWAVE"
              width={150}
              height={36}
              className="h-8 w-auto"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="메뉴 닫기"
              className="p-2"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#212121"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav
            className="flex-1 overflow-y-auto px-5 py-4"
            aria-label="모바일 메뉴"
          >
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
          <div className="border-t border-line px-5 py-4 text-[14px] text-muted">
            <span className={locale === "ko" ? "font-semibold text-ink" : ""}>
              {langLabelKo}
            </span>
            <span className="mx-2 opacity-40">|</span>
            <Link
              href={langTarget("en")}
              className={locale === "en" ? "font-semibold text-ink" : ""}
            >
              {langLabelEn}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
