import { notFound } from "next/navigation";
import PageHero from "@/components/ui/PageHero";
import {
  ProductBoard,
  PRODUCT_PAGE_SIZE,
} from "@/components/products/ProductBoard";
import {
  buildProductTabs,
  catQueryFor,
  filterPostsByCategory,
  resolveActiveFilterId,
  resolveFilterIdAcrossLocales,
} from "@/components/products/product-tabs";
import { PRODUCT_BOARDS } from "@/lib/content";
import {
  getResolvedBoard,
  getResolvedProductPage,
} from "@/lib/content/resolved";
import { defaultLocale, isLocale, localeHref } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

/** Product category board (eco-wave / clean-b / flowell). */
export function generateStaticParams() {
  const cats = ["eco-wave", "clean-b", "flowell"];
  return cats.flatMap((category) =>
    [{ locale: "ko" }, { locale: "en" }].map((locale) => ({
      category,
      ...locale,
    })),
  );
}

export default async function ProductBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; category: string }>;
  searchParams: Promise<{ cat?: string; page?: string }>;
}) {
  const { locale, category } = await params;
  const { cat, page: pageParam } = await searchParams;
  const l = isLocale(locale) ? locale : defaultLocale;
  if (!PRODUCT_BOARDS.includes(`products/${category}` as never)) notFound();

  const slug = `products/${category}`;
  const t = ui(l);
  const board = await getResolvedBoard(l, slug);
  const hero = await heroFor(`/products/${category}`, l);
  const meta = await getResolvedProductPage(l, slug);
  // The language switch preserves `?cat=`; filter ids are localized, so map a
  // foreign-locale id onto this locale's filter at the same position. Without
  // this the EN→KO switch silently reset the board to "all".
  let activeId = resolveActiveFilterId(meta.filters, cat);
  if (activeId === null && cat) {
    const other = await getResolvedProductPage(l === "ko" ? "en" : "ko", slug);
    activeId = resolveFilterIdAcrossLocales(meta.filters, other.filters, cat);
  }
  const filtered = filterPostsByCategory(board.posts, activeId);
  // the original product boards paginate 6 cards per page
  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / PRODUCT_PAGE_SIZE),
  );
  const page = Math.min(totalPages, Math.max(1, Number(pageParam || "1")));
  const slice = filtered.slice(
    (page - 1) * PRODUCT_PAGE_SIZE,
    page * PRODUCT_PAGE_SIZE,
  );

  const base = localeHref(l, `/products/${category}`);
  // Pagination keeps only the RESOLVED filter id, so an unknown `?cat=` never
  // leaks into the pager links.
  const catQuery = catQueryFor(activeId);
  // Use the RESOLVED id (not the raw request) so the matching tab stays
  // highlighted after a language switch mapped a foreign category id.
  const tabs = buildProductTabs(meta.filters, t.board.all, base, activeId);

  return (
    <main>
      <PageHero
        title={meta.title}
        subtitle={meta.subtitle}
        tabs={hero.tabs}
        big
      />
      <section className="mx-auto max-w-[1280px] px-[15px]">
        <ProductBoard
          posts={slice}
          tabs={tabs}
          boardHref={base}
          paginationBase={`${base}${catQuery}`}
          page={page}
          totalPages={totalPages}
          emptyLabel={t.board.noPosts}
        />
      </section>
    </main>
  );
}
