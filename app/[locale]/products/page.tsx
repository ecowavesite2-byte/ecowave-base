import PageHero from "@/components/ui/PageHero";
import { BoardCardGrid } from "@/components/ui/Boards";
import { getBoard } from "@/lib/content";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

/** Products landing: page hero + preview grid of the flagship board. */
export default async function ProductsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const hero = heroFor("/products", l);
  const t = ui(l);
  const board = getBoard(l, "products/eco-wave");
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} />
      <section className="mx-auto max-w-[1440px] px-5 pb-24 lg:px-10">
        <BoardCardGrid
          posts={board.posts.slice(0, 6)}
          boardHref={localeHref(l, "/products/eco-wave")}
          emptyLabel={t.board.noPosts}
        />
      </section>
    </main>
  );
}
