import PageHero from "@/components/ui/PageHero";
import { BoardCardGrid, BoardHeader } from "@/components/ui/Boards";
import { getBoard } from "@/lib/content";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

/** Newsroom: news board embed. */
export default async function NewsroomPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const hero = heroFor("/newsroom", l);
  const t = ui(l);
  const board = getBoard(l, "news");
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} />
      <section className="mx-auto max-w-[1440px] px-5 pb-24 lg:px-10">
        <BoardHeader name={board.name || t.board.notice} count={board.posts.length} searchLabel={t.common.search} />
        <BoardCardGrid posts={board.posts.slice(0, 6)} boardHref={localeHref(l, "/news")} emptyLabel={t.board.noPosts} />
      </section>
    </main>
  );
}
