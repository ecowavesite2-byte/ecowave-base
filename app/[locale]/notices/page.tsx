import BoardPageShell from "@/components/content/BoardPageShell";
import { BoardHeader, BoardLineList, Pagination } from "@/components/ui/Boards";
import { getBoard } from "@/lib/content";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { ui } from "@/lib/ui-strings";

const PAGE_SIZE = 15;

/** Notices board (line list with dates + view counts). */
export default async function NoticesPage({
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
  const board = getBoard(l, "notices");
  const page = Math.max(1, Number(pageParam || "1"));
  const totalPages = Math.max(1, Math.ceil(board.posts.length / PAGE_SIZE));
  const slice = board.posts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const base = localeHref(l, "/notices");

  return (
    <BoardPageShell
      locale={l}
      pageKey="notices"
      renderBoard={() => (
        <>
          <BoardHeader name={board.name || (l === "ko" ? "뉴스" : "News")} count={board.posts.length} />
          <BoardLineList
            posts={slice}
            boardHref={base}
            emptyLabel={t.board.noPosts}
            viewsLabel={t.board.views}
            titleLabel={l === "ko" ? "제목" : "Title"}
            dateLabel={l === "ko" ? "작성시간" : "Date"}
            noticeLabel={l === "ko" ? "공지" : "Notice"}
            startCount={
              board.posts.filter((p) => !p.isNotice).length -
              board.posts.slice(0, (page - 1) * PAGE_SIZE).filter((p) => !p.isNotice).length
            }
          />
          <Pagination page={page} totalPages={totalPages} basePath={base} />
        </>
      )}
    />
  );
}
