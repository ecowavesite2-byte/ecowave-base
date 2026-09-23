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
 *  16px title, 14px excerpt, 20px body) in a 3-column grid.
 *  Original mobile (390, measured live on /29) shows 2 columns: item gutter
 *  padding 7.5px (grid margin -7.5px), so the card border-box is 172.5x238:
 *  131px thumb + 104.98px body (20px pad, title 16px/lh 1.3 one line at the
 *  130.5px content width, excerpt 14px/lh 1.4 two lines), both wrapping
 *  naturally (no clamp/ellipsis). Desktop uses a 15px gutter / 3 columns. */
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
    <div className="-mx-[7.5px] -mt-[15px] flex flex-wrap lg:-mx-[15px]">
      {posts.map((p) => (
        <div key={p.idx} className="w-1/2 p-[7.5px] lg:w-1/3 lg:p-[15px]">
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
            <h3 className="break-words text-[16px] font-normal leading-[1.3] text-black">
              {p.isNotice && (
                <span className="mr-2 inline-block rounded-[3px] bg-accent px-1.5 py-0.5 align-middle text-[11px] font-bold leading-[16px] text-white">
                  공지
                </span>
              )}
              {p.title}
            </h3>
            {p.excerpt && (
              <p className="mt-[5px] break-words text-[14px] leading-[1.4] text-[#757575]">
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
              <div className="min-w-0 border-b border-[rgba(54,54,54,0.15)] px-[7px] py-[13px] text-left min-[992px]:py-[17px]">
                <h3 className="truncate text-[15px] font-normal text-[#363636] md:text-[16px] md:leading-[25.6px]">
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
      {/* imweb `.li_footer _list_bottom`: empty 24px pagination band; original
          mobile margin-top is 10px (`@media all and (max-width:767px)`), 15px desktop */}
      <div className="mt-[10px] h-6 text-center min-[992px]:mt-[15px]" aria-hidden />
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
 * board post detail (imweb board view) — measured live on the original detail
 * pages (desktop 1440x900 / mobile 390x844):
 *
 *   .board-title   margin 0 0 15px (desktop) / 0 (mobile); `h1.view_tit` is
 *                  20px/32 #363636, inline-block on desktop, block on mobile
 *                  with padding 7.5px 30px 15px 0. Notice posts prefix a plain
 *                  `공지` sticker; product posts prefix their category
 *                  (padding-right 10px).
 *   .board_summary board name 13px #757575 + date/views 13px
 *                  rgba(54,54,54,.7) 10px apart (11px/13.2 mobile); desktop
 *                  border-bottom 1px rgba(128,128,128,.2) with padding
 *                  8px 0 20px, mobile full-bleed with padding 15px 15px 0.
 *   .board_txt_area content 15px/24px #363636, padding 22px 0; the crawled
 *                  `.margin-top-xxl` lead carries its 16px margin-top.
 *   .list_tap      full-width row: 14px/22.4 #363636, padding 8px 12px
 *                  (10px 12px desktop), border-bottom 1px rgba(128,128,128,.2),
 *                  14px arrow at left 12px + 44/45px title indent; wrapper
 *                  margin-top 32px, full-bleed on mobile.
 *   .table_bottom  padding 12px 0 0; 목록 button left-aligned, 12px/18,
 *                  letter-spacing 1px, padding 6px 20px, bg #363636, radius 2.
 *   wrapper        margin-bottom 24px.
 */
export type BoardNavPost = { idx: string; title: string; date?: string | null } | null;

/** board-view chrome (board name / views + notice labels) derived from the href */
function boardViewMeta(boardHref: string) {
  const en = boardHref === "/en" || boardHref.startsWith("/en/");
  const key = boardHref.replace(/^\/en(?=\/|$)/, "").replace(/^\/+|\/+$/g, "");
  const names: Record<string, { ko: string; en: string }> = {
    news: { ko: "뉴스", en: "News" },
    notices: { ko: "공지사항", en: "Notices" },
    "products/eco-wave": { ko: "에코웨이브", en: "Eco wave" },
    "products/clean-b": { ko: "크린비", en: "Clean B" },
    "products/flowell": { ko: "플로웰", en: "Flowell" },
  };
  return {
    boardName: names[key]?.[en ? "en" : "ko"],
    viewsLabel: en ? "Views" : "조회수",
    noticeLabel: en ? "Notice" : "공지",
  };
}

/** imweb `.list_tap` prev/next row — single full-width title link with an arrow */
function ListTapRow({
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
    <Link
      href={`${boardHref}/${post.idx}`}
      aria-label={`${label}: ${post.title}`}
      className="relative block overflow-hidden border-b border-[rgba(128,128,128,0.2)] px-3 py-2 text-[14px] leading-[22.4px] text-[#363636] transition duration-300 hover:text-accent min-[992px]:py-[10px]"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#363636"
        strokeWidth="2"
        aria-hidden
        className="absolute left-3 top-1/2 -translate-y-1/2"
      >
        {dir === "prev" ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
      </svg>
      <span className="block truncate pl-[45px] min-[992px]:pl-[44px]">{post.title}</span>
    </Link>
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
    category?: string;
    isNotice?: boolean;
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
  const { boardName, viewsLabel, noticeLabel } = boardViewMeta(boardHref);
  const hasSummary = Boolean(boardName || post.date || post.views != null);
  return (
    <div>
      {/* .board-title > h1.view_tit */}
      <div className="relative min-[992px]:mb-[15px]">
        <h1 className="block break-words pt-[7.5px] pr-[30px] pb-[15px] text-[20px] font-normal leading-[32px] text-[#363636] min-[992px]:inline-block min-[992px]:p-0">
          {post.isNotice && <span className="mr-1">{noticeLabel}</span>}
          {post.category && <span className="pr-[10px]">{post.category}</span>}
          {post.title}
        </h1>
      </div>

      {/* .board_summary — board name + date + views */}
      {hasSummary && (
        <div className="relative -mx-[15px] px-[15px] pt-[15px] text-[11px] leading-[13.2px] min-[992px]:mx-0 min-[992px]:border-b min-[992px]:border-[rgba(128,128,128,0.2)] min-[992px]:px-0 min-[992px]:pt-[8px] min-[992px]:pb-[20px] min-[992px]:text-[13px] min-[992px]:leading-[15.6px]">
          <div className="flex items-center gap-x-[10px]">
            {boardName && <span className="text-[#757575]">{boardName}</span>}
            {post.date && <span className="text-[rgba(54,54,54,0.7)]">{post.date}</span>}
            {post.views != null && (
              <span className="text-[rgba(54,54,54,0.7)]">
                {viewsLabel} {post.views}
              </span>
            )}
          </div>
        </div>
      )}

      {/* .board_txt_area (crawled `.margin-top-xxl` lead = 16px) */}
      <div
        className="board-content text-[15px] text-[#363636] [&_.margin-top-xxl]:!mt-4 [&_img]:!my-[5px] [&_img]:!align-top [&_p]:!m-0 [&_p]:!text-[15px] [&_p]:!leading-[24px]"
        style={{ padding: "22px 0" }}
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

      {/* .list_tap rows + .table_bottom, wrapper margin-bottom 24px */}
      <div className="mb-[24px]">
        {(prevPost || nextPost) && (
          <div className="-mx-[15px] mt-[32px] min-[992px]:mx-0">
            {prevPost && <ListTapRow dir="prev" label={prevLabel} post={prevPost} boardHref={boardHref} />}
            {nextPost && <ListTapRow dir="next" label={nextLabel} post={nextPost} boardHref={boardHref} />}
          </div>
        )}
        <div className="pt-3">
          <Link
            href={boardHref}
            className="inline-flex h-8 items-center rounded-[2px] border border-[#363636] bg-[#363636] px-5 text-[12px] leading-[18px] tracking-[1px] text-white transition duration-300 hover:opacity-90"
          >
            {listLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
