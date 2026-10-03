import Link from "next/link";

export type HeroTab = { label: string; href: string; active?: boolean };

export type MobileNavItem = { label: string; href: string; active?: boolean };

/**
 * Mobile sibling sub-page nav — imweb's `nav.sub-menu.h-menu-type4`, the
 * bordered table grid rendered inside the sub-page hero band. Generalized from
 * the products-only variant to every group that has one on the original
 * (company.* / rnd.* / products.*; news/notices/support have none):
 *  - `cols` = 3 (company 6 items, rnd 3 items) or 2 (products 3 items); the
 *    original class values `row-cnt-3 row-cnt-mobile-{cols}` are emitted so the
 *    audit probes can detect the component.
 *  - measured at 390: 40px cells, shared 1px #d0d0d0 borders (left/top on the
 *    ul, bottom/right per cell), active cell #3970EB + white text, 14px/22.4px
 *    labels, grid x15 / w360, title y65 h36 → grid top y134.5 (`mt-[33.5px]`).
 *  - the 2-column variant reserves an empty filler cell for an odd item count.
 *  - mobile-only: hidden at >=992 (the original's desktop sub-menu is
 *    `sub_menu_hide`; desktop keeps the breadcrumb).
 */
function HeroSubNav({
  items,
  cols,
  activeIndex,
}: {
  items: MobileNavItem[];
  cols: 2 | 3;
  activeIndex: number;
}) {
  const rows = Math.ceil(
    (items.length + (cols === 2 && items.length % 2 === 1 ? 1 : 0)) / cols,
  );
  // the original ul has an explicit height (40/row) and no top border — the
  // first row's cells own the top 1px — so the box is exactly 40·rows, shared
  // borders included.
  const gridHeight = rows <= 1 ? "h-10" : "h-20";
  return (
    <div className="min-[992px]:hidden">
      <nav
        className={`nav sub-menu h-menu-type4 row-cnt-3 row-cnt-mobile-${cols} menu-horizontal mt-[33.5px]`}
        aria-label="하위 메뉴"
      >
        <ul
          className={`grid ${cols === 2 ? "grid-cols-2" : "grid-cols-3"} ${gridHeight} border-l border-[#d0d0d0]`}
        >
          {items.map((n, i) => (
            <li
              key={n.href}
              className={`h-10 border-b border-r border-[#d0d0d0] ${i < cols ? "border-t" : ""} max-[991px]:text-center max-[991px]:text-[0px] max-[991px]:leading-[0px] ${i === activeIndex ? "bg-[#3970eb]" : "bg-white"}`}
            >
              <Link
                href={n.href}
                aria-current={i === activeIndex ? "page" : undefined}
                className={`flex h-full w-full items-center justify-center text-center text-[14px] leading-[22.4px] ${
                  i === activeIndex ? "text-white" : "text-[#212121]"
                }`}
              >
                {n.label}
              </Link>
            </li>
          ))}
          {cols === 2 && items.length % 2 === 1 && (
            <li
              aria-hidden
              className="h-10 border-b border-r border-[#d0d0d0] bg-white max-[991px]:text-center max-[991px]:text-[0px] max-[991px]:leading-[0px]"
            />
          )}
        </ul>
      </nav>
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
  return (
    tabs[0]?.active === true && /\/support(\/|$)/.test(tabs[0]?.href ?? "")
  );
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
 * news/notices 127, products.flowell/clean-b 222, rnd* 227,
 * company/ceo/about/philosophy/history/organization/global 267,
 * products landing + eco-wave 297. Desktop heights (310/290/353) unchanged.
 *
 * `/support` (the blank landing) is the exception: the live /28 authors TWO
 * stacked empty sections (145 + 145 at 390, 290 + 290 at 1440) and our page
 * replaces the *second* one with its intro band + form, so the single hero band
 * has to carry the whole 290px of empty rhythm the original leaves before its
 * content — otherwise the band starts 145px higher than every sibling subpage's
 * first block (products 297 / company 267 / rnd 227) and the /28 parity is lost.
 */
function mobileHeroHeight(tabs: HeroTab[]): number {
  const href = activeRoute(tabs);
  if (/^\/(news|notices)(\/|$)/.test(href)) return 127;
  if (/^\/support(\/|$)/.test(href)) return 290;
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
}) {
  const h = height ?? heroHeight(tabs);
  const mh = mobileHeroHeight(tabs);
  // static classes so Tailwind always emits every measured mobile height
  const mobileHeightClass =
    mh === 127
      ? "min-h-[127px]"
      : mh === 222
        ? "min-h-[222px]"
        : mh === 227
          ? "min-h-[227px]"
          : mh === 290
            ? "min-h-[290px]"
            : mh === 297
              ? "min-h-[297px]"
              : "min-h-[267px]";
  // Restored to the original's authored mobile band (see mobileHeroHeight):
  // pt 65 puts the 30px/36px title at y65 and the sub-menu (when present) at
  // y134.5, exactly like the original `mobile_section_first`. The earlier
  // wave-3 shrink (pt 40 / band 140) is superseded.
  // the original support hero is an empty spacer band (no menu_title widget)
  const blank = isSupportLanding(tabs);
  const crumbs = breadcrumb(tabs);
  const hasSubtitle = Boolean(subtitle);
  // Sub-page sibling grid (imweb `nav.sub-menu.h-menu-type4`): the original
  // renders it only on company.* / rnd.* / products.* — news/notices/support
  // have none. Items are the nav group's children in document order (the group
  // root is excluded); the active cell is the current child, or the first child
  // on a group landing (which the original renders as that child's page).
  const groupRoute = (tabs[0]?.href ?? "").replace(/^\/en(?=\/|$)/, "");
  const hasSubNav =
    /^\/(company|rnd|products)(\/|$)/.test(groupRoute) && tabs.length > 1;
  const subNavItems: MobileNavItem[] = hasSubNav ? tabs.slice(1) : [];
  const subNavCols: 2 | 3 = /^\/products(\/|$)/.test(groupRoute) ? 2 : 3;
  const subNavActive = (() => {
    const i = subNavItems.findIndex((t) => t.active);
    if (i >= 0) return i;
    return tabs[0]?.active && subNavItems.length > 0 ? 0 : -1;
  })();
  // mobile title: the original mobile products hero combines the desktop
  // title + subtitle into "<KR>(<EN>)" (e.g. 에코웨이브(Eco wave)); every other
  // group already uses the child label as the page title.
  const mobileTitle = hasSubtitle ? `${subtitle}(${title})` : title;
  // bottom inset below the title: 73px puts the 65px H1 box at 247..325
  // (hero top 88) exactly like the original; the 72px product title sits higher
  const padBottom = hasSubtitle
    ? "lg:pb-[88px]"
    : big
      ? "lg:pb-[117px]"
      : "lg:pb-[73px]";
  // static classes so Tailwind always emits them (the three measured heights)
  const heightClass =
    h === 290
      ? "lg:min-h-[290px]"
      : h === 353
        ? "lg:min-h-[353px]"
        : "lg:min-h-[310px]";

  return (
    <section className="bg-white">
      <div
        className={`mx-auto flex max-w-[1280px] flex-col justify-start px-[15px] pb-0 pt-[65px] lg:flex-row lg:items-end lg:justify-between lg:pt-0 ${mobileHeightClass} ${heightClass} ${padBottom}`}
      >
        {!blank && title && (hasSubtitle || hasSubNav) ? (
          hasSubNav ? (
            <>
              {/* desktop: page title (+ product subtitle) and the breadcrumb */}
              <div className="hidden min-[992px]:block">
                <h1
                  className={`font-bold text-black text-[30px] leading-[1.2] ${big ? "lg:text-[72px] lg:leading-[1.1]" : "lg:text-[65px]"}`}
                >
                  {title}
                </h1>
                {hasSubtitle && (
                  <p className="mt-[3px] text-[15px] leading-[45px] text-body">
                    <span className="text-[22px]">{subtitle}</span>
                  </p>
                )}
              </div>
              {/* mobile: single title (products combine KR(EN) like the original
                  mobile twin) + the `h-menu-type4` sibling grid at y134.5 */}
              <div className="w-full min-[992px]:hidden">
                <h1 className="text-[30px] font-bold leading-[1.2] text-black">
                  {mobileTitle}
                </h1>
                <HeroSubNav
                  items={subNavItems}
                  cols={subNavCols}
                  activeIndex={subNavActive}
                />
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
          <h1
            className={`font-bold leading-[1.2] text-black ${big ? "text-[30px] lg:text-[72px]" : "text-[30px] lg:text-[65px]"}`}
          >
            {title}
          </h1>
        ) : null}
        {!blank && crumbs.length > 0 && (
          <nav
            className={`mt-4 hidden min-[992px]:block lg:mt-0 ${hasSubtitle ? "lg:mb-[9px]" : ""}`}
            aria-label="현재 위치"
          >
            <ul className="flex flex-wrap items-center gap-y-2">
              {crumbs.map((t, i) => (
                <li key={t.href + t.label} className="flex items-center">
                  {i > 0 && (
                    <span
                      aria-hidden
                      className="mx-2.5 text-[16px] text-[rgba(54,54,54,0.4)] lg:text-[18px]"
                    >
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
