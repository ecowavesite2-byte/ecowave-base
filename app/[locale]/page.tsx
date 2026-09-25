import Link from "next/link";
import HeroCarousel from "@/components/sections/home/HeroCarousel";
import SectionRenderer, { Rows, MOBILE_SECTION } from "@/components/content/SectionRenderer";
import { getResolvedBoard, getResolvedPage } from "@/lib/content/resolved";
import { isLocale, defaultLocale, localeHref } from "@/lib/i18n";
import { isFooterSection } from "@/lib/page-hero";
import type { BoardPost, ColNode, Node, PageContent, RowNode, Section } from "@/lib/types";

/**
 * Mobile heights of the ticker's padding widgets, measured live at 390 on the
 * original (126->63, 39->20, 114->57). imweb's mobile runtime renders a padding
 * widget at half its desktop height; the global `.spacer` mobile formula
 * (`h*0.5 + 15`) folds in the `.inside .widget` vertical gutter, but this
 * section is `grid_v_gutter_0` (no widget margins) so its paddings are exactly
 * halved. Literal classes because Tailwind only emits strings it can read.
 * Desktop values are unchanged.
 */
const TICKER_SPACER_CLASS: Record<number, string> = {
  126: "h-[63px] min-[1024px]:h-[126px]",
  39: "h-[20px] min-[1024px]:h-[39px]",
};

/**
 * imweb's font-size-keyed `line-height: 1.2 !important` also applies at mobile
 * (measured on the original ticker heading: the 48px span downscales to 28px
 * and computes line-height 33.6px), but globals.css scopes that rule to >=992.
 * Re-apply it here for the ticker's 28px mobile heading so the header row
 * matches the original 89px. Same pattern SectionRenderer uses for its inline
 * mobile table rules.
 */
const TICKER_HEADING_MOBILE_CSS =
  "@media (max-width:991px){.ticker-notice .rich-text.text-widget span[style*='font-size: 48px']{line-height:1.2 !important}}";

/** does this col contain the round "+" button (the ticker header's 3-col)? */
function colHasButton(col: ColNode): boolean {
  const walk = (nodes: Node[]): boolean =>
    nodes.some((n) =>
      n.kind === "widget" ? n.type === "button" : n.kind === "row" ? n.cols.some((c) => walk(c.children)) : walk(n.children),
    );
  return walk(col.children);
}

/**
 * Locale-agnostic ticker detection: the home notice ticker is the section
 * embedding a `newest` board widget (exactly one such widget site-wide). The
 * KO and EN crawls give the section different ids, so an id check only matched
 * KO and let the EN ticker fall through to the generic SectionRenderer stream.
 */
function containsNewestWidget(sec: Section): boolean {
  const walk = (nodes: Node[]): boolean =>
    nodes.some((n) =>
      n.kind === "widget" ? n.type === "newest" : n.kind === "row" ? n.cols.some((c) => walk(c.children)) : walk(n.children),
    );
  return walk(sec.rows);
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const page: PageContent = await getResolvedPage(l, "home");
  const news = await getResolvedBoard(l, "news");

  // the visual hero is rebuilt by HeroCarousel; every other section renders
  // through SectionRenderer, which resolves the pc/mobile visibility per
  // breakpoint (RC1)
  const heroSec = page.sections.find((s) => s.visual && !MOBILE_SECTION.test(s.cls || ""));
  const tickerSec = page.sections.find(containsNewestWidget);
  const tickerHeaderRows: RowNode[] = tickerSec
    ? tickerSec.rows.filter(
        (r): r is RowNode => r.kind === "row" && (r.h === 126 || r.h === 116 || r.h === 39),
      )
    : [];
  const tickerHeaderRow = tickerHeaderRows.find((r) => r.h === 116);
  // Ticker post selection: a `picks` override lists board post ids to render in
  // that exact order (missing ids skipped); without one the ticker keeps the
  // historic first four news posts. The chosen board is only fetched when it is
  // not the already-resolved `news`.
  const tickerPicks = tickerSec?.picks;
  let tickerPosts: BoardPost[];
  if (tickerPicks?.idxs?.length) {
    const board = tickerPicks.board === "news" ? news : await getResolvedBoard(l, tickerPicks.board);
    const byIdx = new Map(board.posts.map((post) => [post.idx, post]));
    tickerPosts = tickerPicks.idxs
      .map((idx) => byIdx.get(idx))
      .filter((post): post is BoardPost => post !== undefined);
  } else {
    tickerPosts = news.posts.slice(0, 4);
  }
  // Stale picks (deleted ids / board mismatch) can resolve to zero posts; fall
  // back to the latest news so the ticker never renders empty.
  if (tickerPosts.length === 0) tickerPosts = news.posts.slice(0, 4);
  const rest = page.sections.filter((s) => !s.visual && !containsNewestWidget(s) && !isFooterSection(s));

  return (
    <main>
      {/* hero */}
      {heroSec?.visual && <HeroCarousel slides={heroSec.visual} />}

      {/* all content sections from the crawl (row widths, hover cards, reveal anims) */}
      <SectionRenderer sections={rest} locale={l} />

      {/* notice ticker — measured original at 390: 63 padding, 89 header
          (Notice 15px + 28px/33.6 heading after imweb's mobile downscale),
          20 padding, 291 newest band (298px of cards pulled up 7px),
          57 padding = 520. Desktop keeps the 1040 row, 126/116/39 paddings
          and the 114 tail (unchanged). */}
      {tickerSec && (
        <section
          className="ticker-notice pc-at-mobile relative overflow-x-clip"
          style={{ backgroundColor: tickerSec.bgColor || "#f7f7f7" }}
        >
          <style dangerouslySetInnerHTML={{ __html: TICKER_HEADING_MOBILE_CSS }} />
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
              ) : TICKER_SPACER_CLASS[r.h ?? 0] ? (
                // measured mobile heights (see TICKER_SPACER_CLASS): the global
                // `.spacer` mobile formula would add +15px this section does not
                // have — it is `grid_v_gutter_0` (no `.inside .widget` margin).
                <div key={i} aria-hidden className={TICKER_SPACER_CLASS[r.h ?? 0]} />
              ) : (
                <Rows key={i} rows={[r]} locale={l} />
              ),
            )}
            {/* newest row: measured at 390 the original band is 298px of cards
                pulled up 7px (net 291) inside a 291px row; at >=1024 the cards
                are 327 and the block keeps min-height 310 with a 15px pull-up. */}
            <div className="min-[1024px]:min-h-[310px]">
            <div className="-mx-[22.5px] -mt-[7px] flex flex-wrap min-[1024px]:-mt-[15px] lg:-mx-[15px] lg:flex-row">
              {/* No entrance animation: the original `newest` board widget is
                  `data-widget-anim="none"` with no per-card `wg_animated` class
                  (probe: first `._post_item_wrap` computes opacity 1,
                  animation-name none, visibility visible); the previous local
                  staggered `fadeInUp` had no counterpart. */}
              {tickerPosts.map((p, i) => (
                // `min-w-0`: the title uses `truncate` (nowrap), so each flex
                // item's automatic min-width is its full title width. Longer EN
                // titles otherwise gave unequal `flex-1` widths and wrapped the
                // 4th card onto a second row (band 632 vs the 327 original);
                // min-w-0 lets flex-1 equalize all cards on one row (KO titles
                // are short enough that the auto minimum never bit).
                <div key={p.idx} className={`w-1/2 min-w-0 p-[7.5px] lg:w-auto lg:flex-1 lg:p-[15px] ${i >= 2 ? " hidden lg:block" : ""}`}>
                  <Link href={localeHref(l, `/${tickerPicks?.board ?? "news"}/${p.idx}`)} className="group block h-[283px] overflow-hidden bg-white lg:h-auto lg:overflow-visible">
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
                </div>
              ))}
            </div>
            </div>
            <div aria-hidden className="h-[57px] min-[1024px]:h-[114px]" />
          </div>
        </section>
      )}
    </main>
  );
}
