import Link from "next/link";

export type HeroTab = { label: string; href: string; active?: boolean };

export type MobileNavItem = { label: string; href: string; active?: boolean };

/**
 * Mobile sibling category nav, transcribed from the original 390px products
 * hero (live-measured rows 4–5 of `mobile_section_first`):
 *  - type4 `nav.sub-menu.h-menu-type4.row-cnt-mobile-2` = 2-col bordered grid,
 *    180×40 cells, shared 1px #d0d0d0 borders, active cell #3970EB + white,
 *    14px/22.4px labels;
 *  - type2 `nav.sub-menu.h-menu-type2.row-cnt-mobile-3` = centred 50%-radius
 *    pills, 13px/20.8px, padding 4px 15px, active #3970EB fill + 1px border,
 *    inactive rgba(54,54,54,.7) plain text. Live-measured: this pill nav is
 *    only VISIBLE on /32 (landing) and /37 (eco-wave); on /36 (flowell) and
 *    /38 (clean-b) the original carries `sub_menu_hide` on it (display:none),
 *    so `pills` gates it.
 */
function ProductSiblingNav({ items, pills }: { items: MobileNavItem[]; pills: boolean }) {
  return (
    <div className="min-[992px]:hidden">
      <nav className="mt-[8px]" aria-label="제품 카테고리">
        <ul className="grid grid-cols-2 border-l border-t border-[#d0d0d0]">
          {items.map((n) => (
            <li
              key={n.href}
              className={`h-10 border-b border-r border-[#d0d0d0] ${n.active ? "bg-[#3970eb]" : "bg-white"}`}
            >
              <Link
                href={n.href}
                aria-current={n.active ? "page" : undefined}
                className={`flex h-full w-full items-center justify-center text-center text-[14px] leading-[22.4px] ${
                  n.active ? "text-white" : "text-[#212121]"
                }`}
              >
                {n.label}
              </Link>
            </li>
          ))}
          {items.length % 2 === 1 && (
            <li aria-hidden className="h-10 border-b border-r border-[#d0d0d0] bg-white" />
          )}
        </ul>
      </nav>
      {pills && (
        <nav className="mt-[15px]" aria-label="제품 바로가기">
          <ul className="flex flex-wrap items-center justify-center">
            {items.map((n) => (
              <li key={n.href} className="mx-[0.25px]">
                <Link
                  href={n.href}
                  aria-current={n.active ? "page" : undefined}
                  className={`inline-block rounded-full px-[15px] py-[4px] text-[13px] leading-[20.8px] ${
                    n.active
                      ? "border border-[#3970eb] bg-[#3970eb] text-white"
                      : "border border-transparent text-[rgba(54,54,54,0.7)]"
                  }`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/**
 * Original imweb page-hero (`section_first`) heights measured at 1440px:
 * 310px on most subpages, 290px on the support landing (an empty spacer band)
 * and 353px on the products section. The first desktop section of every page
 * JSON sums to exactly these values (rows 139+111+60 / 290 / 139+154+60).
 * `tabs[0]` is the nav group, so its `active` flag tells the landing route
 * (e.g. /support) apart from a child route under it (e.g. /notices).
 */
function isSupportLanding(tabs: HeroTab[]): boolean {
  return tabs[0]?.active === true && /\/support(\/|$)/.test(tabs[0]?.href ?? "");
}

function heroHeight(tabs: HeroTab[]): number {
  if (isSupportLanding(tabs)) return 290;
  if (/\/products(\/|$)/.test(tabs[0]?.href ?? "")) return 353;
  return 310;
}

/** active route of the hero (strips the `/en` locale prefix), e.g. /products/flowell */
function activeRoute(tabs: HeroTab[]): string {
  const active = tabs.find((t) => t.active) ?? tabs[0];
  return (active?.href ?? "").replace(/^\/en(?=\/|$)/, "");
}

/**
 * Original mobile (`mobile_section_first`) heights measured at 390px:
 * news/notices 127, support 145, products.flowell/clean-b 222, rnd* 227,
 * company/ceo/about/philosophy/history/organization/global 267,
 * products landing + eco-wave 297. Desktop heights (310/290/353) unchanged.
 */
function mobileHeroHeight(tabs: HeroTab[]): number {
  const href = activeRoute(tabs);
  if (/^\/(news|notices)(\/|$)/.test(href)) return 127;
  if (/^\/support(\/|$)/.test(href)) return 145;
  if (/^\/products\/(flowell|clean-b)(\/|$)/.test(href)) return 222;
  if (/^\/products(\/|$)/.test(href)) return 297;
  if (/^\/rnd(\/|$)/.test(href)) return 227;
  return 267;
}

/**
 * imweb renders `group › current-page` (not the full sibling list). The current
 * page is the active tab, or the section's first child when we are on the
 * section landing route (e.g. /company -> 에코웨이브 › ceo인사말).
 */
function breadcrumb(tabs: HeroTab[]): HeroTab[] {
  if (tabs.length <= 1) return tabs;
  const active = tabs.find((t) => t.active);
  const current = active && active !== tabs[0] ? active : tabs[1];
  return [tabs[0], current];
}

/**
 * Subpage hero: white band with the big page title on the left and the
 * breadcrumb on the right (imweb menu_title + sub_menu). Height matches the
 * original first section so the hero photo below starts at the same y.
 */
export default function PageHero({
  title,
  tabs = [],
  big = false,
  height,
  subtitle,
  mobileNav,
  mobileTitle,
  mobilePills = false,
}: {
  title: string;
  tabs?: HeroTab[];
  big?: boolean;
  /** override the first-section height (290 | 310 | 353; anything else → 310) */
  height?: number;
  /**
   * Product heroes only: the EN category line (`title`) is followed by a
   * smaller KR subtitle (e.g. "Eco wave" / "에코웨이브"). Additive — when
   * omitted every existing route renders exactly as before.
   */
  subtitle?: string;
  /**
   * Products only, mobile only: sibling category nav (Eco wave / clean B /
   * Flowell). When provided the mobile hero renders the KR combined title
   * (`mobileTitle`) plus the measured type4 grid + type2 pill navs instead of
   * the desktop title+subtitle; desktop is unchanged.
   */
  mobileNav?: MobileNavItem[];
  /** Products only, mobile only: KR combined hero title, e.g. `에코웨이브(Eco wave)`. */
  mobileTitle?: string;
  /** Products only, mobile only: render the type2 pill sibling nav (landing + eco-wave only). */
  mobilePills?: boolean;
}) {
  const h = height ?? heroHeight(tabs);
  const mh = mobileHeroHeight(tabs);
  // static classes so Tailwind always emits every measured mobile height
  const mobileHeightClass =
    mh === 127
      ? "min-h-[127px]"
      : mh === 145
        ? "min-h-[145px]"
        : mh === 222
          ? "min-h-[222px]"
          : mh === 227
            ? "min-h-[227px]"
            : mh === 297
              ? "min-h-[297px]"
              : "min-h-[267px]";
  // the original support hero is an empty spacer band (no menu_title widget)
  const blank = isSupportLanding(tabs);
  const crumbs = breadcrumb(tabs);
  // product hero with subtitle: the (72px) title + (22px) subtitle block keeps
  // the same 72px H1 box as the plain `big` hero (top y238) and puts the
  // subtitle at y327, i.e. the block bottom sits 88px above the 353px hero's
  // bottom (hero top 88) — measured live.
  const hasSubtitle = Boolean(subtitle);
  // bottom inset below the title: 73px puts the 65px H1 box at 247..325
  // (hero top 88) exactly like the original; the 72px product title sits higher
  const padBottom = hasSubtitle ? "lg:pb-[88px]" : big ? "lg:pb-[117px]" : "lg:pb-[73px]";
  // static classes so Tailwind always emits them (the three measured heights)
  const heightClass =
    h === 290 ? "lg:min-h-[290px]" : h === 353 ? "lg:min-h-[353px]" : "lg:min-h-[310px]";

  return (
    <section className="bg-white">
      <div className={`mx-auto flex max-w-[1280px] flex-col justify-start px-[15px] pb-0 pt-[65px] lg:flex-row lg:items-end lg:justify-between lg:pt-0 ${mobileHeightClass} ${heightClass} ${padBottom}`}>
        {!blank && title && hasSubtitle ? (
          mobileNav && mobileNav.length > 0 ? (
            <>
              <div className="hidden min-[992px]:block">
                <h1 className="font-bold text-black text-[30px] leading-[1.2] lg:text-[72px] lg:leading-[1.1]">
                  {title}
                </h1>
                <p className="mt-[3px] text-[15px] leading-[45px] text-body">
                  <span className="text-[22px]">{subtitle}</span>
                </p>
              </div>
              {/* mobile: KR combined title + sibling category nav (original
                  mobile_section_first rows 2/3/4/5: H1 mt20/h36/mb10, 16px
                  divider band, type4 grid, type2 pills) */}
              <div className="w-full min-[992px]:hidden">
                <h1 className="mb-[10px] text-[30px] font-bold leading-[1.2] text-black">
                  {mobileTitle ?? title}
                </h1>
                <div aria-hidden className="h-[16px]" />
                <ProductSiblingNav items={mobileNav} pills={mobilePills} />
              </div>
            </>
          ) : (
            <div>
              {/* ORIG product hero is a rich-text <strong> "Eco wave" measured
                  72px / line-height 79.2px (=1.1) at desktop; keep the mobile
                  30px/1.2 (36px) which matches the original mobile h1. */}
              <h1 className="font-bold text-black text-[30px] leading-[1.2] lg:text-[72px] lg:leading-[1.1]">
                {title}
              </h1>
              {/* crawled product hero: the subtitle <p> is 15px with an inline
                  `line-height:3` (45px) and a 22px <span> inside — the probe
                  measures the <p> (15/45) and the <span> (22px). */}
              <p className="mt-[3px] text-[15px] leading-[45px] text-body">
                <span className="text-[22px]">{subtitle}</span>
              </p>
            </div>
          )
        ) : !blank && title ? (
          <h1 className={`font-bold leading-[1.2] text-black ${big ? "text-[30px] lg:text-[72px]" : "text-[30px] lg:text-[65px]"}`}>
            {title}
          </h1>
        ) : null}
        {!blank && crumbs.length > 0 && (
          <nav className={`mt-4 hidden min-[992px]:block lg:mt-0 ${hasSubtitle ? "lg:mb-[9px]" : ""}`} aria-label="현재 위치">
            <ul className="flex flex-wrap items-center gap-y-2">
              {crumbs.map((t, i) => (
                <li key={t.href + t.label} className="flex items-center">
                  {i > 0 && (
                    <span aria-hidden className="mx-2.5 text-[16px] text-[rgba(54,54,54,0.4)] lg:text-[18px]">
                      ›
                    </span>
                  )}
                  <Link
                    href={t.href}
                    className={`inline-block pb-1.5 text-[16px] font-normal transition duration-300 lg:text-[18px] ${
                      i === crumbs.length - 1
                        ? hasSubtitle
                          ? "text-body"
                          : "text-ink"
                        : "text-[rgba(54,54,54,0.7)] hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </section>
  );
}
