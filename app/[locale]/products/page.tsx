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
import {
  getResolvedBoard,
  getResolvedProductPage,
} from "@/lib/content/resolved";
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
  const t = ui(l);

  const slug = "products/eco-wave";
  const board = await getResolvedBoard(l, slug);
  // landing shares the eco-wave board payload (original /32 == /37 boards)
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
  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / PRODUCT_PAGE_SIZE),
  );
  const page = Math.min(totalPages, Math.max(1, Number(pageParam || "1")));
  const slice = filtered.slice(
    (page - 1) * PRODUCT_PAGE_SIZE,
    page * PRODUCT_PAGE_SIZE,
  );

  const listingBase = localeHref(l, "/products");
  const cardBase = localeHref(l, slug);
  // Pagination keeps only the RESOLVED filter id, so an unknown `?cat=` never
  // leaks into the pager links.
  const catQuery = catQueryFor(activeId);
  // Use the RESOLVED id (not the raw request) so the matching tab stays
  // highlighted after a language switch mapped a foreign category id.
  const tabs = buildProductTabs(
    meta.filters,
    t.board.all,
    listingBase,
    activeId,
  );

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
