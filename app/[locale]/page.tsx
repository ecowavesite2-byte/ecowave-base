import Link from "next/link";
import HeroCarousel from "@/components/sections/home/HeroCarousel";
import Reveal from "@/components/ui/Reveal";
import SectionRenderer, { Rows, MOBILE_SECTION } from "@/components/content/SectionRenderer";
import { getBoardForRender, getPageForRender } from "@/lib/content/drafts";
import { isLocale, defaultLocale, localeHref } from "@/lib/i18n";
import type { ColNode, Node, PageContent, RowNode } from "@/lib/types";

const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";
const TICKER_SECTION_ID = "s2025081139ff276cae8d6";

/** does this col contain the round "+" button (the ticker header's 3-col)? */
function colHasButton(col: ColNode): boolean {
  const walk = (nodes: Node[]): boolean =>
    nodes.some((n) =>
      n.kind === "widget" ? n.type === "button" : n.kind === "row" ? n.cols.some((c) => walk(c.children)) : walk(n.children),
    );
  return walk(col.children);
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const page: PageContent = await getPageForRender(l, "home");
  const news = await getBoardForRender(l, "news");

  // the visual hero (desktop + mobile slide sets) is rebuilt by HeroCarousel;
  // every other section — pc and mobile — renders through SectionRenderer,
  // which resolves the pc/mobile visibility per breakpoint (RC1)
  const heroSec = page.sections.find((s) => s.visual && !MOBILE_SECTION.test(s.cls || ""));
  const mobileHeroSec = page.sections.find((s) => s.visual && MOBILE_SECTION.test(s.cls || ""));
  const tickerSec = page.sections.find((s) => s.id === TICKER_SECTION_ID);
  const tickerHeaderRows: RowNode[] = tickerSec
    ? tickerSec.rows.filter(
        (r): r is RowNode => r.kind === "row" && (r.h === 126 || r.h === 116 || r.h === 39),
      )
    : [];
  const tickerHeaderRow = tickerHeaderRows.find((r) => r.h === 116);
  const rest = page.sections.filter((s) => !s.visual && s.id !== TICKER_SECTION_ID && s.id !== FOOTER_SECTION_ID);

  return (
    <main>
      {/* hero */}
      {heroSec?.visual && <HeroCarousel slides={heroSec.visual} mobileSlides={mobileHeroSec?.visual} />}

      {/* all content sections from the crawl (row widths, hover cards, reveal anims) */}
      <SectionRenderer sections={rest} locale={l} />

      {/* notice ticker — measured original: 1040 row, 126 spacer, 116 header
          (Notice 20px + 48px title, plus-circle button right after 57 spacer),
          39 spacer, newest cards (179px image, 19px title, 16px/1.4 text),
          114 spacer */}
      {tickerSec && (
        <section className="relative overflow-x-clip" style={{ backgroundColor: tickerSec.bgColor || "#f7f7f7" }}>
          <div className="mx-auto max-w-[1040px] px-[15px] lg:px-0">
            {tickerHeaderRows.map((r, i) =>
              r === tickerHeaderRow ? (
                // MB3: on mobile the header row is a single grid column, so the
                // 3-col "+" button (a 57px spacer + 44px round button) stacks
                // UNDER the title and adds ~95px (local 615 vs original 520).
                // The original mobile screenshot shows a blank right side and
                // the cards start ~26px below the title, so hide the whole
                // button column below the `lg` (1024px) grid breakpoint.
                // Desktop keeps the 9/3 grid (and the 116px min-height).
                <div
                  key={i}
                  className="imweb-row grid grid-cols-1 min-[1024px]:min-h-[var(--row-h)] lg:grid-cols-12"
                  style={{ ["--row-h" as string]: r.h ? `${r.h}px` : undefined } as React.CSSProperties}
                >
                  {r.cols.map((c, j) => (
                    <div
                      key={j}
                      className={`imweb-col ${colHasButton(c) ? "hidden lg:col-span-3 lg:block" : "lg:col-span-9"}`}
                    >
                      <Rows rows={c.children} locale={l} nested wdepth={1} />
                    </div>
                  ))}
                </div>
              ) : (
                <Rows key={i} rows={[r]} locale={l} />
              ),
            )}
            {/* newest row: measured min-height 310, cards overlap upward by 15.
                Mobile (orig 390): full-bleed 405px track (margin -7.5), 2 columns,
                card 188x283, thumb 186x142; desktop flex-1 row unchanged (lg:). */}
            <div className="min-h-[310px]">
            <div className="-mx-[22.5px] -mt-[15px] flex flex-wrap lg:-mx-[15px] lg:flex-row">
              {news.posts.slice(0, 4).map((p, i) => (
                <Reveal key={p.idx} delay={i * 0.12} className={`w-1/2 p-[7.5px] lg:w-auto lg:flex-1 lg:p-[15px]${i >= 2 ? " hidden lg:block" : ""}`}>
                  <Link href={localeHref(l, `/news/${p.idx}`)} className="group block h-[283px] overflow-hidden bg-white lg:h-auto lg:overflow-visible">
                    <div className="relative h-[142px] w-full overflow-hidden lg:h-[179px]">
                      {p.thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumb} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="h-[141px] bg-white px-[15px] pt-[15px] pb-[23px] lg:h-auto">
                      <h3 className="truncate text-[19px] font-normal text-black">{p.title}</h3>
                      {p.excerpt && <p className="mt-[5px] line-clamp-2 text-[16px] leading-[1.4] text-black">{p.excerpt}</p>}
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
            </div>
            <div className="spacer" style={{ ["--h" as string]: 114 }} />
          </div>
        </section>
      )}
    </main>
  );
}
