import HeroCarousel from "@/components/sections/home/HeroCarousel";
import NoticeTicker, { isNoticeTickerSection } from "@/components/sections/home/NoticeTicker";
import SectionRenderer, { MOBILE_SECTION } from "@/components/content/SectionRenderer";
import { getResolvedBoard, getResolvedPage } from "@/lib/content/resolved";
import { isLocale, defaultLocale } from "@/lib/i18n";
import { isFooterSection } from "@/lib/page-hero";
import type { BoardPost, PageContent } from "@/lib/types";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const page: PageContent = await getResolvedPage(l, "home");
  const news = await getResolvedBoard(l, "news");

  // the visual hero is rebuilt by HeroCarousel; every other section renders
  // through SectionRenderer, which resolves the pc/mobile visibility per
  // breakpoint (RC1)
  const heroSec = page.sections.find((s) => s.visual && !MOBILE_SECTION.test(s.cls || ""));
  const tickerSec = page.sections.find(isNoticeTickerSection);
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
  const rest = page.sections.filter((s) => !s.visual && !isNoticeTickerSection(s) && !isFooterSection(s));

  return (
    <main>
      {/* hero */}
      {heroSec?.visual && <HeroCarousel slides={heroSec.visual} />}

      {/* all content sections from the crawl (row widths, hover cards, reveal anims) */}
      <SectionRenderer sections={rest} locale={l} />

      {/* notice ticker — bespoke markup lives in NoticeTicker (shared with the
          admin preview). Measured original at 390: 63 padding, 89 header
          (Notice 15px + 28px/33.6 heading after imweb's mobile downscale),
          20 padding, 291 newest band (298px of cards pulled up 7px),
          57 padding = 520. Desktop keeps the 1040 row, 126/116/39 paddings
          and the 114 tail (unchanged). */}
      {tickerSec && <NoticeTicker section={tickerSec} posts={tickerPosts} locale={l} />}
    </main>
  );
}
