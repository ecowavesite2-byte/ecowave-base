import BoardPageShell from "@/components/content/BoardPageShell";
import { BoardCardGrid, BoardHeader, Pagination } from "@/components/ui/Boards";
import { getBoard } from "@/lib/content";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";

const PAGE_SIZE = 12;

/** News board. */
export default async function NewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;
  const l = isLocale(locale) ? locale : defaultLocale;
  const t = ui(l);
  const board = getBoard(l, "news");
  const page = Math.max(1, Number(pageParam || "1"));
  const totalPages = Math.max(1, Math.ceil(board.posts.length / PAGE_SIZE));
  const slice = board.posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const base = localeHref(l, "/news");

  return (
    <BoardPageShell
      locale={l}
      pageKey="news"
      renderBoard={() => (
        <>
          <BoardHeader name={board.name || t.board.notice} count={board.posts.length} searchLabel={t.common.search} />
          <BoardCardGrid posts={slice} boardHref={base} emptyLabel={t.board.noPosts} />
          <Pagination page={page} totalPages={totalPages} basePath={base} />
        </>
      )}
    />
  );
}
