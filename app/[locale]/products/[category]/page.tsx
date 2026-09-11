import { notFound } from "next/navigation";
import BoardPageShell from "@/components/content/BoardPageShell";
import { BoardCardGrid, CategoryChips, Pagination } from "@/components/ui/Boards";
import { PRODUCT_BOARDS } from "@/lib/content";
import { getBoard } from "@/lib/content";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";

const PAGE_SIZE = 12;

/** Product category board (eco-wave / clean-b / flowell). */
export function generateStaticParams() {
  const cats = ["eco-wave", "clean-b", "flowell"];
  return cats.flatMap((category) =>
    [{ locale: "ko" }, { locale: "en" }].map((locale) => ({ category, ...locale })),
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
  const board = getBoard(l, slug);
  const categories = [...new Set(board.posts.map((p) => p.category).filter(Boolean))] as string[];
  const filtered = cat ? board.posts.filter((p) => p.category === cat) : board.posts;
  const page = Math.max(1, Number(pageParam || "1"));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const base = localeHref(l, `/products/${category}`);

  return (
    <BoardPageShell
      locale={l}
      pageKey={slug}
      big
      renderBoard={() => (
        <>
          <CategoryChips
            categories={categories}
            active={cat || undefined}
            allLabel={t.board.all}
            hrefFor={(c) => (c ? `${base}?cat=${encodeURIComponent(c)}` : base)}
          />
          <BoardCardGrid posts={slice} boardHref={base} emptyLabel={t.board.noPosts} />
          <Pagination
            page={page}
            totalPages={totalPages}
            basePath={cat ? `${base}?cat=${encodeURIComponent(cat)}` : base}
          />
        </>
      )}
    />
  );
}
