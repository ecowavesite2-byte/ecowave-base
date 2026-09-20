import Link from "next/link";
import Image from "next/image";

export type BoardListItem = {
  idx: string;
  title: string;
  excerpt?: string;
  thumb?: string | null;
  isNotice?: boolean;
  date?: string | null;
  views?: number | null;
  category?: string;
};

/** board heading block: name + count + search box, matches imweb table_top (mb-15, 15px) */
export function BoardHeader({
  name,
  count,
  searchLabel = "Search",
}: {
  name: string;
  count: number;
  searchLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" style={{ margin: "0 -15px 15px" }}>
      <header className="text-[15px] text-[#363636]">
        {name} <em className="not-italic">{count}</em>
      </header>
      <div className="relative">
        <input
          type="text"
          placeholder={searchLabel}
          title={searchLabel}
          className="h-[34px] w-full border border-line bg-white px-3 pr-9 text-[13px] text-body placeholder:text-muted focus:border-accent focus:outline-none sm:w-[220px]"
          readOnly
        />
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#959595"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </div>
    </div>
  );
}

/** imweb "type_grid" board list — bordered cards (radius 10, 299px image,
 *  16px title, single-line 14px excerpt, 20px body) in a 3-column grid.
 *  Original mobile (390) shows 2 columns with a ~131px thumb (card 173x238),
 *  desktop stays 3 columns. */
export function BoardCardGrid({
  posts,
  boardHref,
  emptyLabel,
}: {
  posts: BoardListItem[];
  boardHref: string;
  emptyLabel: string;
}) {
  if (posts.length === 0) {
    return (
      <p className="py-24 text-center text-[15px] text-muted">{emptyLabel}</p>
    );
  }
  return (
    <div className="flex flex-wrap" style={{ margin: "-15px -15px 0" }}>
      {posts.map((p) => (
        <div key={p.idx} className="w-1/2 p-[15px] lg:w-1/3">
        <Link
          href={`${boardHref}/${p.idx}`}
          className="group block h-full overflow-hidden rounded-[10px] border border-[#eee] bg-white"
        >
          <div className="relative h-[131px] w-full overflow-hidden bg-soft sm:h-[260px] lg:h-[299px]">
            {p.thumb && (
              <Image
                src={p.thumb}
                alt={p.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw"
                className="object-cover"
              />
            )}
          </div>
          <div className="bg-white p-5">
            <h3 className="truncate text-[16px] font-normal leading-[1.275] text-black transition-colors group-hover:text-accent">
              {p.isNotice && (
                <span className="mr-2 inline-block rounded-[3px] bg-accent px-1.5 py-0.5 align-middle text-[11px] font-bold leading-[16px] text-white">
                  공지
                </span>
              )}
              {p.title}
            </h3>
            {p.excerpt && (
              <p className="mt-[5px] truncate text-[14px] leading-[1.4] text-[#757575]">
                {p.excerpt}
              </p>
            )}
          </div>
        </Link>
        </div>
      ))}
    </div>
  );
}

/**
 * imweb "line" board list — header row (No/제목/작성시간/조회수) + body rows.
 * Measured original (/27): wrapper border-top 1px #363636; header h59, cells
 * 15px #363636 centered, padding 17px 7px, border-bottom 1px rgba(54,54,54,.15);
 * cols no 63 / title flex / date 150 / views 125. Body rows h61: count 15px
 * centered (flag icon for notices), title 16px #363636 left, meta 12px
 * rgba(54,54,54,.65) centered.
 */
const LINE_COLS = "63px minmax(0,1fr) 150px 125px";
const LINE_CELL_BORDER = "1px solid rgba(54,54,54,0.15)";

export function BoardLineList({
  posts,
  boardHref,
  emptyLabel,
  viewsLabel = "조회수",
  noLabel = "No",
  titleLabel = "제목",
  dateLabel = "작성시간",
  noticeLabel = "공지",
  startCount,
}: {
  posts: BoardListItem[];
  boardHref: string;
  emptyLabel: string;
  viewsLabel?: string;
  noLabel?: string;
  titleLabel?: string;
  dateLabel?: string;
  noticeLabel?: string;
  /** descending number for the first non-notice row (defaults to non-notice count) */
  startCount?: number;
}) {
  if (posts.length === 0) {
    return (
      <p className="py-24 text-center text-[15px] text-muted">{emptyLabel}</p>
    );
  }
  const headCell: React.CSSProperties = {
    padding: "17px 7px",
    borderBottom: LINE_CELL_BORDER,
    fontSize: 15,
    color: "#363636",
    textAlign: "center",
    fontWeight: 400,
  };
  const bodyCell: React.CSSProperties = {
    padding: "17px 7px",
    borderBottom: LINE_CELL_BORDER,
    textAlign: "center",
  };
  return (
    <div style={{ borderTop: "1px solid #363636" }}>
      <div className="hidden md:grid" style={{ gridTemplateColumns: LINE_COLS }}>
        <div style={headCell}>{noLabel}</div>
        <div style={headCell}>{titleLabel}</div>
        <div style={headCell}>{dateLabel}</div>
        <div style={headCell}>{viewsLabel}</div>
      </div>
      <ul>
        {posts.map((p) => {
          // original shows a flag icon for notices, descending numbers otherwise
          let num: number | null = null;
          if (!p.isNotice) {
            const total = startCount ?? posts.filter((x) => !x.isNotice).length;
            const seen = posts.slice(0, posts.indexOf(p)).filter((x) => !x.isNotice).length;
            num = total - seen;
          }
          return (
          <li key={p.idx} style={{ borderBottom: 0 }}>
            <Link
              href={`${boardHref}/${p.idx}`}
              className="group grid grid-cols-1 gap-1 md:grid-cols-[63px_minmax(0,1fr)_150px_125px] md:gap-0"
            >
              <div style={bodyCell} className="hidden md:block">
                {p.isNotice ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#363636" strokeWidth="2" className="mx-auto" aria-label={noticeLabel}>
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                ) : (
                  <span className="text-[15px] text-[#363636]">{num}</span>
                )}
              </div>
              <div style={{ ...bodyCell, textAlign: "left" }} className="min-w-0">
                <h3 className="truncate text-[15px] font-normal text-[#363636] transition-colors group-hover:text-accent md:text-[16px] md:leading-[25.6px]">
                  {p.isNotice && (
                    <span className="mr-2 inline-block rounded-[3px] bg-accent px-1.5 py-0.5 align-middle text-[11px] font-bold leading-[16px] text-white md:hidden">
                      {noticeLabel}
                    </span>
                  )}
                  {p.title}
                </h3>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-[rgba(54,54,54,0.65)] md:hidden">
                  {p.date && <span>{p.date}</span>}
                  {p.views != null && (
                    <span>
                      {viewsLabel} {p.views}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ ...bodyCell, fontSize: 12, color: "rgba(54,54,54,0.65)" }} className="hidden md:block">
                {p.date}
              </div>
              <div style={{ ...bodyCell, fontSize: 12, color: "rgba(54,54,54,0.65)" }} className="hidden md:block">
                {p.views}
              </div>
            </Link>
          </li>
          );
        })}
      </ul>
      {/* imweb `.li_footer _list_bottom`: empty 24px pagination band, mt 15px */}
      <div className="mt-[15px] h-6 text-center" aria-hidden />
    </div>
  );
}

/** imweb-style pagination: bordered squares with ‹ › arrows (static content — pages pre-sliced server-side) */
export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const btn =
    "flex h-[34px] min-w-[34px] items-center justify-center border border-[#ddd] bg-white px-2 text-[14px] transition duration-300";
  return (
    <nav className="mt-10 flex items-center justify-center gap-[5px]" aria-label="페이지네이션">
      {page > 1 && (
        <Link
          href={page === 2 ? basePath : `${basePath}?page=${page - 1}`}
          className={`${btn} text-body hover:border-accent hover:text-accent`}
          aria-label="이전 페이지"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      )}
      {pages.map((p) => (
        <Link
          key={p}
          href={p === 1 ? basePath : `${basePath}?page=${p}`}
          aria-current={p === page ? "page" : undefined}
          className={
            p === page
              ? `${btn} border-[#363636] bg-[#363636] font-semibold text-white`
              : `${btn} text-body hover:border-accent hover:text-accent`
          }
        >
          {p}
        </Link>
      ))}
      {page < totalPages && (
        <Link
          href={`${basePath}?page=${page + 1}`}
          className={`${btn} text-body hover:border-accent hover:text-accent`}
          aria-label="다음 페이지"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      )}
    </nav>
  );
}

/**
 * board post detail (imweb board view): subject row (title 14px #000 + date
 * 12px #888 with clock icon), content padded 30px 15px 60px at 14px #363636
 * lh 1.75, then prev/next .board-summary rows (border-top 1px #eee, min-h
 * 60px, padding 14px 20px, chevron + 14px #000 w75 label + truncated title +
 * 11px #757575 date).
 */
export type BoardNavPost = { idx: string; title: string; date?: string | null } | null;

function BoardSummaryRow({
  dir,
  label,
  post,
  boardHref,
}: {
  dir: "prev" | "next";
  label: string;
  post: Exclude<BoardNavPost, null>;
  boardHref: string;
}) {
  return (
    <div
      className="flex min-h-[60px] items-center gap-3 px-5 py-[14px]"
      style={{ borderTop: "1px solid #eee" }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#000"
        strokeWidth="2"
        aria-hidden
        className="shrink-0"
      >
        {dir === "prev" ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      <span className="w-[75px] shrink-0 text-[14px] text-black">{label}</span>
      <Link
        href={`${boardHref}/${post.idx}`}
        className="min-w-0 flex-1 truncate text-[14px] text-black transition duration-300 hover:text-accent"
      >
        {post.title}
      </Link>
      {post.date && <span className="shrink-0 text-[11px] text-[#757575]">{post.date}</span>}
    </div>
  );
}

export function PostDetail({
  post,
  boardHref,
  listLabel = "목록",
  prevLabel = "이전글",
  nextLabel = "다음글",
  prevPost = null,
  nextPost = null,
}: {
  post: {
    idx: string;
    title: string;
    date?: string | null;
    views?: number | null;
    content?: string;
    files?: { name: string; href: string }[];
  };
  boardHref: string;
  listLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
  prevPost?: BoardNavPost;
  nextPost?: BoardNavPost;
}) {
  return (
    <div>
      <div className="flex min-h-[44px] items-center justify-between gap-4 border-b border-line py-2">
        <h1 className="min-w-0 flex-1 truncate text-[14px] font-normal text-black">{post.title}</h1>
        {post.date && (
          <span className="flex shrink-0 items-center gap-1 text-[12px] text-[#888]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            {post.date}
          </span>
        )}
      </div>
      <div
        className="board-content text-[14px] leading-[1.75] text-[#363636]"
        style={{ padding: "30px 15px 60px" }}
        dangerouslySetInnerHTML={{ __html: post.content || "" }}
      />
      {post.files && post.files.length > 0 && (
        <ul className="border-t border-line py-4 text-[13px] text-muted">
          {post.files.map((f) => (
            <li key={f.href}>
              <a href={f.href} className="transition duration-300 hover:text-accent" download>
                {f.name}
              </a>
            </li>
          ))}
        </ul>
      )}
      {(prevPost || nextPost) && (
        <div style={{ borderBottom: "1px solid #eee" }}>
          {prevPost && <BoardSummaryRow dir="prev" label={prevLabel} post={prevPost} boardHref={boardHref} />}
          {nextPost && <BoardSummaryRow dir="next" label={nextLabel} post={nextPost} boardHref={boardHref} />}
        </div>
      )}
      <div className="mt-10 flex justify-center">
        <Link
          href={boardHref}
          className="inline-flex h-11 items-center rounded border border-[#ddd] px-7 text-[14px] text-body transition duration-300 hover:border-accent hover:text-accent"
        >
          {listLabel}
        </Link>
      </div>
    </div>
  );
}
