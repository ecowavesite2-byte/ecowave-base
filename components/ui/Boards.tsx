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

/** board heading block: name + count + (static) search box, as in the original */
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
    <div className="mb-8 flex items-end justify-between border-b border-line pb-4">
      <header className="text-[20px] font-bold text-ink">
        {name} <em className="font-normal not-italic text-accent">{count}</em>
      </header>
      <div className="relative hidden sm:block">
        <input
          type="text"
          placeholder={searchLabel}
          title={searchLabel}
          className="h-10 w-[220px] rounded border border-line bg-white px-3 pr-9 text-[13px] text-body placeholder:text-muted focus:border-accent focus:outline-none"
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

/** product board category filter chips (전체 + categories) */
export function CategoryChips({
  categories,
  active,
  allLabel = "전체",
  hrefFor,
}: {
  categories: string[];
  active?: string;
  allLabel?: string;
  hrefFor: (c: string | null) => string;
}) {
  if (categories.length === 0) return null;
  return (
    <div className="mb-8 flex flex-wrap gap-2">
      <Link
        href={hrefFor(null)}
        className={`rounded-full border px-4 py-2 text-[15px] transition-colors ${
          !active
            ? "border-accent bg-accent font-semibold text-white"
            : "border-line text-[rgba(54,54,54,0.7)] hover:border-accent hover:text-accent"
        }`}
      >
        {allLabel}
      </Link>
      {categories.map((c) => (
        <Link
          key={c}
          href={hrefFor(c)}
          className={`rounded-full border px-4 py-2 text-[15px] transition-colors ${
            active === c
              ? "border-accent bg-accent font-semibold text-white"
              : "border-line text-[rgba(54,54,54,0.7)] hover:border-accent hover:text-accent"
          }`}
        >
          {c}
        </Link>
      ))}
    </div>
  );
}

/** imweb "type_grid" board list — thumbnail cards in a 3-column grid. */
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
    <div className="grid grid-cols-1 gap-x-[15px] gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p) => (
        <Link
          key={p.idx}
          href={`${boardHref}/${p.idx}`}
          className="group block"
        >
          <div className="relative h-[172px] w-full overflow-hidden bg-soft sm:h-[190px] lg:h-[172px]">
            {p.thumb && (
              <Image
                src={p.thumb}
                alt={p.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            )}
          </div>
          <div className="pt-4">
            <h3 className="truncate text-[16px] font-semibold text-ink transition-colors group-hover:text-accent">
              {p.isNotice && (
                <span className="mr-2 inline-block rounded-[3px] bg-accent px-1.5 py-0.5 align-middle text-[11px] font-bold leading-[16px] text-white">
                  공지
                </span>
              )}
              {p.title}
            </h3>
            {p.excerpt && (
              <p className="mt-2 line-clamp-2 text-[13px] leading-[1.6] text-muted">
                {p.excerpt}
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

/** imweb "line" board list — rows with title / date / views. */
export function BoardLineList({
  posts,
  boardHref,
  emptyLabel,
  viewsLabel = "조회수",
}: {
  posts: BoardListItem[];
  boardHref: string;
  emptyLabel: string;
  viewsLabel?: string;
}) {
  if (posts.length === 0) {
    return (
      <p className="py-24 text-center text-[15px] text-muted">{emptyLabel}</p>
    );
  }
  return (
    <ul className="border-t border-line">
      {posts.map((p) => (
        <li key={p.idx} className="border-b border-line">
          <Link
            href={`${boardHref}/${p.idx}`}
            className="group flex items-center justify-between gap-4 px-2 py-[18px] hover:bg-soft"
          >
            <h3 className="min-w-0 flex-1 truncate text-[15px] text-ink lg:text-[16px]">
              {p.isNotice && (
                <span className="mr-2 inline-block rounded-[3px] bg-accent px-1.5 py-0.5 align-middle text-[11px] font-bold leading-[16px] text-white">
                  공지
                </span>
              )}
              <span className="transition-colors group-hover:text-accent">
                {p.title}
              </span>
            </h3>
            <div className="hidden shrink-0 items-center gap-4 text-[13px] text-muted sm:flex">
              {p.date && <span>{p.date}</span>}
              {p.views != null && (
                <span>
                  {viewsLabel}
                  {p.views}
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** simple numeric pagination (static content — pages pre-sliced server-side) */
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
  return (
    <nav
      className="mt-10 flex items-center justify-center gap-1"
      aria-label="페이지네이션"
    >
      {pages.map((p) => (
        <Link
          key={p}
          href={p === 1 ? basePath : `${basePath}?page=${p}`}
          className={`flex h-9 min-w-9 items-center justify-center px-2 text-[14px] transition-colors ${
            p === page
              ? "bg-accent font-semibold text-white"
              : "text-body hover:bg-soft"
          }`}
        >
          {p}
        </Link>
      ))}
    </nav>
  );
}

/** board post detail body (rich HTML) */
export function PostBody({ content }: { content?: string }) {
  if (!content) return null;
  return (
    <div
      className="board-content px-0 py-10 text-[15px] leading-[1.8]"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

/** board post detail: title bar, body, list navigation */
export function PostDetail({
  post,
  boardHref,
  boardName,
  listLabel = "목록",
  viewsLabel = "조회수",
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
  boardName?: string;
  listLabel?: string;
  viewsLabel?: string;
}) {
  return (
    <div>
      <div className="border-b border-line py-8">
        <h1 className="text-[22px] font-bold leading-[1.5] text-ink lg:text-[28px]">
          {post.title}
        </h1>
        <div className="mt-3 flex items-center gap-4 text-[13px] text-muted">
          {boardName && <span>{boardName}</span>}
          {post.date && <span>{post.date}</span>}
          {post.views != null && (
            <span>
              {viewsLabel} {post.views}
            </span>
          )}
        </div>
      </div>
      <PostBody content={post.content} />
      {post.files && post.files.length > 0 && (
        <ul className="border-t border-line py-4 text-[13px] text-muted">
          {post.files.map((f) => (
            <li key={f.href}>
              <a href={f.href} className="hover:text-accent" download>
                {f.name}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-10 flex justify-center">
        <Link
          href={boardHref}
          className="inline-flex h-11 items-center rounded border border-[#ddd] px-7 text-[14px] text-body transition-colors hover:border-accent hover:text-accent"
        >
          {listLabel}
        </Link>
      </div>
    </div>
  );
}
