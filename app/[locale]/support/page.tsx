import PageHero from "@/components/ui/PageHero";
import { BoardLineList } from "@/components/ui/Boards";
import { getBoard } from "@/lib/content";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

/** Customer support: notices list embed. */
export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const hero = heroFor("/support", l);
  const t = ui(l);
  const board = getBoard(l, "notices");
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} />
      <section className="mx-auto max-w-[1440px] px-5 pb-24 lg:px-10">
        <BoardLineList posts={board.posts} boardHref={localeHref(l, "/notices")} emptyLabel={t.board.noPosts} viewsLabel={t.board.views} />
      </section>
    </main>
  );
}
