import PageHero from "@/components/ui/PageHero";
import {
  ProductBoard,
  PRODUCT_HERO,
  PRODUCT_PAGE_SIZE,
  orderedCategories,
} from "@/components/products/ProductBoard";
import { getResolvedBoard } from "@/lib/content/resolved";
import { defaultLocale, isLocale, localeHref } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

/**
 * Products landing: the original /32 board is the eco-wave board rendered
 * with the category tab row and pagination (page size 6).
 */
export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cat?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { cat, page: pageParam } = await searchParams;
  const l = isLocale(locale) ? locale : defaultLocale;
  const hero = await heroFor("/products", l);
  const meta = PRODUCT_HERO.products;
  const t = ui(l);

  const slug = "products/eco-wave";
  const board = await getResolvedBoard(l, slug);
  const categories = orderedCategories(l, slug, board.posts);
  const filtered = cat ? board.posts.filter((p) => p.category === cat) : board.posts;
  const page = Math.max(1, Number(pageParam || "1"));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCT_PAGE_SIZE));
  const slice = filtered.slice((page - 1) * PRODUCT_PAGE_SIZE, page * PRODUCT_PAGE_SIZE);

  const listingBase = localeHref(l, "/products");
  const cardBase = localeHref(l, slug);
  const catQuery = cat ? `?cat=${encodeURIComponent(cat)}` : "";
  const tabs = [
    { label: t.board.all, href: listingBase, active: !cat },
    ...categories.map((c) => ({
      label: c,
      href: `${listingBase}?cat=${encodeURIComponent(c)}`,
      active: cat === c,
    })),
  ];

  return (
    <main>
      <PageHero title={meta.label} subtitle={meta.subtitle} tabs={hero.tabs} big />
      <section className="mx-auto max-w-[1280px] px-[15px]">
        <ProductBoard
          posts={slice}
          tabs={tabs}
          boardHref={cardBase}
          paginationBase={`${listingBase}${catQuery}`}
          page={page}
          totalPages={totalPages}
          emptyLabel={t.board.noPosts}
        />
      </section>
    </main>
  );
}
