import BoardPageShell from "@/components/content/BoardPageShell";
import { BoardCardGrid, BoardHeader, Pagination } from "@/components/ui/Boards";
import { getResolvedBoard } from "@/lib/content/resolved";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";

const PAGE_SIZE = 12;

/** News board. */
export default async function NewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; keyword?: string }>;
}) {
  const { locale } = await params;
  const { page: pageParam, keyword: keywordParam } = await searchParams;
  const l = isLocale(locale) ? locale : defaultLocale;
  const t = ui(l);
  const board = await getResolvedBoard(l, "news");
  const parsedPage = Number(pageParam || "1");
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
  // imweb board search (`?keyword_type=all&keyword=…`): case-insensitive match
  // on title OR excerpt; a whitespace-only term is treated as no filter.
  const keyword = (keywordParam || "").trim();
  const hasKeyword = keyword.length > 0;
  const needle = keyword.toLowerCase();
  const posts = hasKeyword
    ? board.posts.filter(
        (p) => p.title.toLowerCase().includes(needle) || (p.excerpt?.toLowerCase().includes(needle) ?? false),
      )
    : board.posts;
  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const slice = posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const base = localeHref(l, "/news");
  // keep the search term on the pagination links; byte-identical when no keyword
  const searchPath = hasKeyword ? `${base}?keyword_type=all&keyword=${encodeURIComponent(keyword)}` : base;
  const noResults = hasKeyword && posts.length === 0;

  return (
    <BoardPageShell
      locale={l}
      pageKey="news"
      renderBoard={() => (
        <>
          <BoardHeader
            name={board.name || (l === "ko" ? "뉴스" : "News")}
            count={noResults ? null : posts.length}
            action={base}
            keyword={hasKeyword ? keyword : undefined}
          />
          {noResults ? (
            <p className="py-24 text-center text-[15px] text-muted">{t.board.noResults}</p>
          ) : (
            <BoardCardGrid posts={slice} boardHref={base} emptyLabel={t.board.noPosts} />
          )}
          {!noResults && <Pagination page={page} totalPages={totalPages} basePath={searchPath} />}
        </>
      )}
    />
  );
}
