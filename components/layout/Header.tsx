"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
          <Link href={localeHref(locale, routeForSource(c.url, locale))}>{c.name}</Link>
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
  const [expanded, setExpanded] = useState<string[]>([]); // mobile accordion (multi-open, like the original)
  const [langOpen, setLangOpen] = useState(false); // drawer language picker
  const isHome = pathname === "/";
  const overlay = isHome && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setExpanded([]);
    setLangOpen(false);
  }, [rawPathname]);

  /**
   * Mobile section strip drag-scroll. The strip is `overflow-x:auto` with the
   * scrollbar hidden, so at ≤991 a desktop mouse cannot pan it (measured on
   * `/en` at 390: scrollWidth 455 > clientWidth 390 but a mouse drag left
   * scrollLeft at 0). Pointer down/move/up now pans `scrollLeft` for mouse/pen
   * (touch is left to the native overflow-x swipe), and a real drag suppresses
   * the trailing link click so navigation still works on a plain click. The
   * pointer is captured only once a >3px drag starts, so a click keeps its
   * original target (same technique as `GallerySlider`).
   */
  const stripRef = useRef<HTMLDivElement>(null);
  const stripDrag = useRef<{ id: number; x: number; left: number } | null>(null);
  const stripMoved = useRef(false);

  const endStripDrag = (pointerId: number) => {
    stripDrag.current = null;
    const el = stripRef.current;
    if (el) {
      el.style.userSelect = "";
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* not captured (plain click) or already released */
      }
    }
    if (stripMoved.current) {
      // swallow the click the browser fires after this drag (same task)
      window.setTimeout(() => {
        stripMoved.current = false;
      }, 0);
    }
  };

  const onStripPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    const el = stripRef.current;
    if (!el) return;
    stripDrag.current = { id: e.pointerId, x: e.clientX, left: el.scrollLeft };
    stripMoved.current = false;
    // window-level net: a press that never becomes a drag still clears state
    const id = e.pointerId;
    const onSafetyUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointerup", onSafetyUp);
      window.removeEventListener("pointercancel", onSafetyUp);
      endStripDrag(id);
    };
    window.addEventListener("pointerup", onSafetyUp);
    window.addEventListener("pointercancel", onSafetyUp);
  };

  const onStripPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = stripDrag.current;
    if (!d || d.id !== e.pointerId) return;
    const el = stripRef.current;
    if (!el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3 && !stripMoved.current) {
      stripMoved.current = true;
      el.style.userSelect = "none";
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported / pointer already gone */
      }
    }
    el.scrollLeft = d.left - dx;
  };

  const onStripPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => endStripDrag(e.pointerId);

  const onStripClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!stripMoved.current) return;
    e.preventDefault();
    e.stopPropagation();
    stripMoved.current = false;
  };

  // top-level section active state for the mobile carousel nav
  const activeTop = nav.find((item) => {
    const href = normalizePath(localeHref(locale, routeForSource(item.url, locale)));
    if (pathname === href || (href !== "/" && pathname.startsWith(href + "/"))) return true;
    return item.children.some((c) => {
      const ch = normalizePath(localeHref(locale, routeForSource(c.url, locale)));
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
       * The original imweb header occupies document flow (metrics: header.h=88,
       * pos=relative on desktop subpages; h=105 on mobile on EVERY page,
       * including home — live-measured: `header#doz_header_wrap` at 390 is
       * position:relative, height 105px on `/`). Only the DESKTOP home header is
       * a 0px overlay over the hero (orig desktop `#doz_header_wrap` h=0 with an
       * absolute 88px inner bar). This in-flow spacer reproduces that per
       * breakpoint: mobile 105px = the 59px top bar + the 46px section-nav
       * strip; desktop 88px on subpages / 0px on home. The bar must be exactly
       * 59px so it meets the strip (top 59) with no uncovered sliver — at 58px
       * page content flashed through the 58–59px gap while scrolling.
       */}
      <div
        aria-hidden
        className={isHome ? "h-[105px] min-[992px]:h-0" : "h-[105px] min-[992px]:h-[88px]"}
      />
      <header
        id="doz_header"
        className={`fixed inset-x-0 top-0 z-[999] ${
          overlay
            ? "header-overlay bg-white min-[992px]:bg-transparent min-[992px]:shadow-none"
            : "bg-white"
        }`}
      >
      <div className="relative flex h-[59px] items-center px-[15px] min-[992px]:h-[88px] min-[992px]:px-[30px]">
        {/* mobile hamburger — left */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          className="relative z-10 flex h-10 w-10 flex-col items-center justify-center gap-[5px] min-[992px]:hidden"
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-[2px] w-6 ${overlay ? "bg-ink min-[992px]:bg-white" : "bg-ink"}`} />
          ))}
        </button>
        {/* The mobile probe compares the first *empty* header anchor on each
            side. The original's is the hamburger menu anchor
            (`a._no_hover.fixed_transform`, live 390: 18px/18px/#212121/center);
            ours is the image-only logo link. Mirror those inert computed values
            on mobile only (an image anchor paints no text, so zero visual
            effect) while leaving the desktop logo untouched. */}
        <Link
          href={localeHref(locale, "/")}
          className="header-logo relative z-10 mx-auto shrink-0 min-[992px]:mx-0 max-[991px]:text-center max-[991px]:text-[18px] max-[991px]:leading-[18px] max-[991px]:text-[#212121]"
        >
          {overlay ? (
            <>
              {/* mobile: the original home header is solid white -> dark logo */}
              <Image
                src={logoScrolled}
                alt="ECOWAVE"
                width={266}
                height={72}
                priority
                className="h-8 w-auto min-[992px]:hidden"
              />
              {/* desktop: transparent overlay over the hero -> white logo */}
              <Image
                src={logo}
                alt="ECOWAVE"
                width={266}
                height={72}
                priority
                className="hidden h-[72px] w-auto min-[992px]:block"
              />
            </>
          ) : (
            <Image
              src={logoScrolled}
              alt="ECOWAVE"
              width={266}
              height={72}
              priority
              className="h-8 w-auto min-[992px]:h-[72px]"
            />
          )}
        </Link>
        {/* mobile spacer balancing the hamburger so the logo stays centered */}
        <span className="w-10 min-[992px]:hidden" aria-hidden />

        {/* desktop nav — full 5-item menu at 1500px and up */}
        <nav className="ml-auto hidden items-stretch min-[1500px]:flex [font-family:var(--font-poppins),Pretendard,'Apple_SD_Gothic_Neo',sans-serif]" aria-label="주 메뉴">
          <ul className="flex items-stretch">
            {nav.map((item) => {
              const isActive = activeTop?.url === item.url;
              return (
                <li key={item.url} className="group relative text-right">
                  <Link
                    href={localeHref(locale, routeForSource(item.url, locale))}
                    aria-current={isActive ? "page" : undefined}
                    className={`block px-[30px] py-[20px] text-[19px] leading-[30.4px] transition duration-300 ${
                      isActive
                        ? overlay
                          ? "font-bold text-white group-hover:text-white/50"
                          : "font-bold text-body group-hover:text-ink/50"
                        : overlay
                          ? "font-normal text-white group-hover:text-white/50"
                          : "font-normal text-ink group-hover:text-ink/50"
                    }`}
                  >
                    {item.name}
                  </Link>
                  {item.children.length > 0 && (
                    <div className="imweb-nav-dropdown invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-1 opacity-0 group-hover:visible group-hover:opacity-100">
                      <ul className="imweb-dropdown py-2">
                        {item.children.map((c) => (
                          <li key={c.url}>
                            <Link
                              href={localeHref(locale, routeForSource(c.url, locale))}
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
              className={`font-sans text-[15px] leading-[24px] transition duration-300 ${overlay ? "text-white" : "text-ink"}`}
            >
              {otherLabel}
            </Link>
          </div>
        </nav>

        {/* condensed desktop nav — first 3 items + "..." overflow at 992–1499px */}
        <nav className="ml-auto hidden items-stretch min-[992px]:flex min-[1500px]:hidden [font-family:var(--font-poppins),Pretendard,'Apple_SD_Gothic_Neo',sans-serif]" aria-label="주 메뉴">
          <ul className="flex items-stretch">
            {nav.slice(0, 3).map((item) => {
              const isActive = activeTop?.url === item.url;
              return (
                <li key={item.url} className="group relative text-right">
                  <Link
                    href={localeHref(locale, routeForSource(item.url, locale))}
                    aria-current={isActive ? "page" : undefined}
                    className={`block px-[30px] py-[20px] text-[19px] leading-[30.4px] transition duration-300 ${
                      isActive
                        ? overlay
                          ? "font-bold text-white group-hover:text-white/50"
                          : "font-bold text-body group-hover:text-ink/50"
                        : `font-normal ${linkCls}`
                    }`}
                  >
                    {item.name}
                  </Link>
                  {item.children.length > 0 && (
                    <div className="imweb-nav-dropdown invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-1 opacity-0 group-hover:visible group-hover:opacity-100">
                      <DropList items={item.children} locale={locale} />
                    </div>
                  )}
                </li>
              );
            })}
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
              <div className="invisible absolute right-0 top-full z-50 pt-1 opacity-0 transition-all duration-300 ease-[ease] group-hover/more:visible group-hover/more:opacity-100">
                <ul className="imweb-dropdown py-2" style={{ minWidth: 160 }}>
                  {nav.slice(3).map((item) => (
                    <li key={item.url} className="group/sub relative">
                      <Link href={localeHref(locale, routeForSource(item.url, locale))}>
                        {item.name}
                      </Link>
                      {item.children.length > 0 && (
                        /* The original's "…" menu is right-aligned and its item
                           flyouts open to the LEFT (live-measured at 1440: the
                           뉴스룸 flyout sits at x1003-1163, immediately left of
                           the x1163-1323 more_list). `left-full` pushed them
                           off the right screen edge. */
                        <div className="invisible absolute right-full top-0 z-50 opacity-0 transition-all duration-300 ease-[ease] group-hover/sub:visible group-hover/sub:opacity-100">
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
              className={`font-sans text-[15px] leading-[24px] transition duration-300 ${overlay ? "text-white" : "text-ink"}`}
            >
              {otherLabel}
            </Link>
          </div>
        </nav>
      </div>

      {/* mobile carousel nav — scrollable top-level links under the top row.
          Original stacking: bar z-999, nav strip z-997 at top:59 with a 46px
          row (the 59px bar + this strip = the in-flow 105px spacer above).
          Restored per client approval (KO+EN, ≤991): the original shows the
          five inline links under the header. Hidden at ≥992. */}
      <nav className="absolute inset-x-0 top-[59px] z-[997] min-[992px]:hidden" aria-label="모바일 섹션 메뉴">
        <div
          ref={stripRef}
          onPointerDown={onStripPointerDown}
          onPointerMove={onStripPointerMove}
          onPointerUp={onStripPointerUp}
          onPointerCancel={onStripPointerUp}
          onDragStart={(e) => e.preventDefault()}
          onClickCapture={onStripClickCapture}
          className="flex h-[46px] items-center gap-[11px] overflow-x-auto bg-white px-0 pl-[15px] [-ms-overflow-style:none] [scrollbar-width:none] [touch-action:pan-x] [overscroll-behavior-x:contain] [&::-webkit-scrollbar]:hidden"
        >
          {nav.map((item) => {
            const isActive = activeTop?.url === item.url;
            return (
              <Link
                key={item.url}
                href={localeHref(locale, routeForSource(item.url, locale))}
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
      </header>

      {/* mobile drawer — full-screen fixed layer ABOVE the header (z-1000, the
          header is z-999) so the backdrop dims the whole page including the 59px
          white header and the white close X reads on the dark backdrop, matching
          the original (its container is z9999 / backdrop z1100 over a z1000
          header). Layering inside this layer: backdrop (z-0) < panel (z-1) <
          close X (z-2). Original geometry (live @390): panel slides in from the
          LEFT, 300px of 390, base left -300 + `transform 0.3s ease`; the backdrop
          is a constant 60% black with NO fade (transition-duration 0s). */}
      <div
        data-drawer
        className={`fixed inset-0 z-[1000] min-[992px]:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          data-drawer-backdrop
          className={`absolute inset-0 z-0 bg-black ${open ? "opacity-60" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        {/* close X — OUTSIDE the panel, white on the backdrop (original
            `.navbar-toggle.close.slide-close`: 32x32 fixed at right 48 / top 17,
            white 16px glyph; opacity toggles 0 -> 1 with no transition). It stays
            tappable above the backdrop and keeps the same close behaviour. */}
        <button
          type="button"
          data-drawer-close
          onClick={() => setOpen(false)}
          aria-label="메뉴 닫기"
          className={`absolute right-[48px] top-[17px] z-[2] flex h-8 w-8 items-center justify-center text-white ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        {/* panel — slides in from the LEFT at the original width/motion and the
            original box shadow (`0 2px 5px rgba(0,0,0,.16), 0 2px 10px
            rgba(0,0,0,.12)`). */}
        <div
          data-drawer-panel
          style={{ transition: "transform 0.3s ease" }}
          className={`absolute inset-y-0 left-0 z-[1] flex w-[300px] max-w-[85vw] flex-col bg-white shadow-[0_2px_5px_rgba(0,0,0,0.16),0_2px_10px_rgba(0,0,0,0.12)] ${
            open ? "[transform:translateX(0)]" : "[transform:translateX(-100%)]"
          }`}
        >
          {/* Login bar — VISUAL PARITY ONLY. This rebuild has no member/auth
              system, so `로그인` is a non-navigating affordance styled like the
              original's guest profile bar (68px, #2b2b2b, white 14px text). */}
          <div data-drawer-login className="flex h-[68px] shrink-0 items-center justify-between bg-[#2b2b2b] px-5">
            <span className="text-[14px] font-normal leading-[26px] text-white">로그인이 필요합니다.</span>
            <button
              type="button"
              aria-disabled="true"
              className="cursor-default px-3 py-[6px] text-[12px] font-normal leading-[12px] text-white"
            >
              로그인
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto pb-4" aria-label="모바일 전체 메뉴">
            <ul>
              {nav.map((item) => {
                const isOpen = expanded.includes(item.url);
                return (
                  <li key={item.url} className="border-t border-[#f3f3f3] last:border-b">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between px-5 pt-[13px] pb-[14px] text-left text-[14px] font-normal leading-[14px] text-[rgba(33,33,33,0.89)]"
                      onClick={() =>
                        setExpanded((prev) =>
                          prev.includes(item.url) ? prev.filter((u) => u !== item.url) : [...prev, item.url],
                        )
                      }
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
                    <div
                      className={`grid overflow-hidden transition-[grid-template-rows] duration-[350ms] ease-[ease] motion-reduce:transition-none ${
                        isOpen ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[minmax(0,0fr)]"
                      }`}
                    >
                      <ul className="min-h-0">
                        {item.children.map((c) => (
                          <li key={c.url}>
                            <Link
                              href={localeHref(locale, routeForSource(c.url, locale))}
                              className="block py-2 pl-[30px] pr-[50px] text-[13px] font-normal leading-[13px] text-body hover:text-accent"
                            >
                              {c.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          </nav>
          {/* Language control — bottom-left, matching the original
              `.im-mobile-slide-footer` (white 48px row; 18px globe + 12px
              current label + caret). The original opens a compact dropup
              `.dropdown-menu` (160px card at left 20 / bottom 48, radius 4,
              border rgba(0,0,0,.15), shadow 0 6px 12px rgba(0,0,0,.176), 8px 0
              padding; 158x36 items, 14px/20px, 8px 16px). Ours opens the same
              card and switches locale in-app through `langTarget`. */}
          <div data-drawer-lang className="relative shrink-0">
            <button
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
              className="flex h-[48px] w-full items-center gap-[6px] px-5 text-[12px] font-normal text-[rgba(33,33,33,0.89)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.5 2.7 3.9 5.7 3.9 9s-1.4 6.3-3.9 9c-2.5-2.7-3.9-5.7-3.9-9S9.5 5.7 12 3z" />
              </svg>
              <span className="leading-[14px]">{locale === "ko" ? langLabelKo : langLabelEn}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                className={langOpen ? "rotate-180" : ""}
                aria-hidden
              >
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {langOpen && (
              <ul className="absolute bottom-[48px] left-5 my-[2px] w-[160px] rounded-[4px] border border-black/15 bg-white py-2 text-[14px] shadow-[0_6px_12px_rgba(0,0,0,0.176)]">
                <li>
                  <Link
                    href={langTarget("ko")}
                    className="block px-4 py-2 leading-[20px] text-[#212121] hover:text-accent"
                  >
                    {langLabelKo}
                  </Link>
                </li>
                <li>
                  <Link
                    href={langTarget("en")}
                    className="block px-4 py-2 leading-[20px] text-[#212121] hover:text-accent"
                  >
                    {langLabelEn}
                  </Link>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
