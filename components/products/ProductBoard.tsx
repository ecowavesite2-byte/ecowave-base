import Link from "next/link";
import Image from "next/image";
import type { BoardListItem } from "@/components/ui/Boards";
import type { Locale } from "@/lib/i18n";

/**
 * Products-owned board UI (desktop pixel-parity with the live imweb original).
 *
 * Measured on https://imweb8701032505.imweb.me (1440px) for /32 (products
 * landing), /37 (eco wave), /36 (flowell), /38 (clean b):
 *   - board section height 1158 for a 2-row grid (6 posts) + pagination,
 *     694 for a 1-row grid (3 posts) without pagination;
 *   - tab row: pad 15 + 37px pills + pad 15; "전체" = #3465DE pill, other
 *     tabs plain text (rgba(54,54,54,.7)); 17px, pad 4px 15px, radius 50,
 *     5px right margin;
 *   - card item: 430px wide (390px card + 20px gutters), 401px row pitch;
 *     card = 361px tall, 1px #eee border, 294px thumbnail (cover, centred),
 *     65px #f7f7f7 caption band with a single centred 15px line;
 *   - pagination: 24px round links, active #363636 bold, rest 40% opacity.
 */

export type ProductTab = { label: string; href: string; active?: boolean };

/** hero label (EN category line) + KR subtitle, per sold route */
export const PRODUCT_HERO: Record<string, { label: string; subtitle: string }> = {
  products: { label: "Eco wave", subtitle: "에코웨이브" },
  "products/eco-wave": { label: "Eco wave", subtitle: "에코웨이브" },
  // live original /38 renders the same KR subtitle as the eco-wave hero
  "products/clean-b": { label: "clean B", subtitle: "에코웨이브" },
  "products/flowell": { label: "Flowell", subtitle: "플로웰" },
};

/**
 * Original board category-tab order (live probes /32 + /37 + /36 + /38).
 * `살균모듈` has no posts in the crawl but the original still shows the tab.
 * Only applied for the KO capture (the audited locale); EN boards keep their
 * own category labels in crawl order.
 */
const CATEGORY_ORDER: Record<string, string[]> = {
  "products/eco-wave": ["필터", "서비스 점검/자가관리 키트", "살균모듈"],
  "products/clean-b": ["샤워기", "필터"],
  "products/flowell": ["정수기", "필터"],
};

export const PRODUCT_PAGE_SIZE = 6;

export function orderedCategories(
  locale: Locale,
  slug: string,
  posts: { category?: string }[],
): string[] {
  const present = [
    ...new Set(posts.map((p) => p.category).filter(Boolean) as string[]),
  ];
  if (locale !== "ko") return present;
  const order = CATEGORY_ORDER[slug] ?? [];
  return [...order, ...present.filter((c) => !order.includes(c))];
}

/** imweb sub_menu category tab row (전체 + categories) */
export function ProductTabs({ tabs }: { tabs: ProductTab[] }) {
  return (
    <div className="pb-[15px] pt-[15px]">
      <div className="flex flex-wrap items-center">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`mr-[5px] inline-flex h-[37px] items-center rounded-full border px-[15px] text-[17px] font-normal leading-none transition-colors ${
              t.active
                ? "border-accent bg-accent text-white"
                : "border-transparent text-[rgba(54,54,54,0.7)] hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** imweb grid_03 card: 390x361, cover thumb 294, centred 65px caption band */
export function ProductCardGrid({
  posts,
  boardHref,
  emptyLabel,
}: {
  posts: BoardListItem[];
  boardHref: string;
  emptyLabel: string;
}) {
  if (posts.length === 0) {
    return <p className="py-16 text-center text-[15px] text-muted">{emptyLabel}</p>;
  }
  return (
    <div className="-mx-[15px] flex flex-wrap px-[5px] lg:-mx-5 lg:-mt-[5px] lg:px-0">
      {posts.map((p) => (
        // mobile 2-col (orig 390: cell 190x234, card 170x214, thumb 168x128);
        // desktop 3-col unchanged (lg: overrides)
        <div key={p.idx} className="w-1/2 p-[10px] lg:w-1/3 lg:p-5">
          <Link
            href={`${boardHref}/${p.idx}`}
            className="group block h-[214px] overflow-hidden border border-[#eee] bg-white lg:h-[361px]"
          >
            <div className="relative h-[128px] w-full overflow-hidden lg:h-[294px]">
              {p.thumb && (
                <Image
                  src={p.thumb}
                  alt={p.title}
                  fill
                  sizes="(max-width: 1024px) 50vw, 390px"
                  className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
                />
              )}
            </div>
            <div className="flex h-[84px] items-start justify-center bg-[#f7f7f7] px-5 pt-5 lg:h-[65px]">
              <h3 className="w-full truncate text-center text-[15px] font-normal leading-[20px] text-black transition-colors group-hover:text-accent">
                {p.title}
              </h3>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {dir === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

/** imweb board pagination: < 1 2 > round 24px links, no boxes */
export function ProductPagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;
  const item =
    "flex h-6 min-w-6 items-center justify-center rounded-full px-[3px] text-[14px] transition-colors";
  const dim = "text-[rgba(54,54,54,0.4)] hover:text-ink";
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const sep = basePath.includes("?") ? "&" : "?";
  const hrefFor = (p: number) => (p === 1 ? basePath : `${basePath}${sep}page=${p}`);
  return (
    <nav className="mt-6 flex items-center justify-center gap-[3px] lg:mt-[58px]" aria-label="페이지네이션">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={`${item} ${dim}`} aria-label="이전 페이지">
          <Arrow dir="left" />
        </Link>
      ) : (
        <span className={`${item} ${dim}`} aria-hidden>
          <Arrow dir="left" />
        </span>
      )}
      {pages.map((p) =>
        p === page ? (
          <span key={p} className={`${item} font-bold text-[#363636]`} aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} href={hrefFor(p)} className={`${item} ${dim}`}>
            {p}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={`${item} ${dim}`} aria-label="다음 페이지">
          <Arrow dir="right" />
        </Link>
      ) : (
        <span className={`${item} ${dim}`} aria-hidden>
          <Arrow dir="right" />
        </span>
      )}
    </nav>
  );
}

/**
 * Full products board section content: tab row (67px) + 31px spacer + card
 * grid (rows of 401px, pulled up 5px) + pagination + trailing spacer so the
 * section sums to 1158 (2 rows + pagination) or 694 (1 row, no pagination).
 */
export function ProductBoard({
  posts,
  tabs,
  boardHref,
  paginationBase,
  page,
  totalPages,
  emptyLabel,
}: {
  posts: BoardListItem[];
  tabs: ProductTab[];
  boardHref: string;
  paginationBase: string;
  page: number;
  totalPages: number;
  emptyLabel: string;
}) {
  const paginated = totalPages > 1;
  return (
    <>
      <ProductTabs tabs={tabs} />
      <div aria-hidden className="h-[31px]" />
      <ProductCardGrid posts={posts} boardHref={boardHref} emptyLabel={emptyLabel} />
      <ProductPagination page={page} totalPages={totalPages} basePath={paginationBase} />
      <div aria-hidden className={paginated ? "h-[60px] lg:h-[181px]" : "h-[60px] lg:h-[200px]"} />
    </>
  );
}
