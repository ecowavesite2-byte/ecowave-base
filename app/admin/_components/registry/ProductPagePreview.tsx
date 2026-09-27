"use client";

import { ProductCardGrid, ProductTabs } from "@/components/products/ProductBoard";
import { buildProductTabs } from "@/components/products/product-tabs";
import type { BoardListItem } from "@/components/ui/Boards";
import type { ProductPagePayload } from "@/lib/types";
import { ui } from "@/lib/ui-strings";
import { ScaledDesktop } from "./SectionPreview";
import type { ProductPostOption, RegistryLocale } from "./types";

/**
 * Live preview of a products.* board page — the section-less `productPage` def.
 *
 * Mirrors the public category route (`app/[locale]/products/[category]/page.tsx`)
 * so the pane can never drift from the live page: the page-hero band (title +
 * subtitle, transcribed from the public `PageHero`, NOT imported — importing it
 * would drag `next/link`/breadcrumb chrome the pane does not need), the
 * `전체` + category tab row (`ProductTabs`, same helper the route uses) and the
 * card grid (`ProductCardGrid`).
 *
 * Desktop-only, rendered at the public 1280px width and scaled by
 * `ScaledDesktop` (pointer-events-none, so the inert `#` hrefs never navigate).
 * Only the first page of posts is shown — the original boards paginate 6 per
 * page and the pane has no pagination control.
 *
 * `payload`/`posts` are resolved live from the editor's unsaved drafts by
 * `RegistryEditor`, so editing the title/subtitle/filters (or a board category)
 * repaints the pane immediately.
 */
const PREVIEW_PAGE_SIZE = 6;

export default function ProductPagePreview({
  payload,
  posts,
  locale,
}: {
  /** Resolved `productPage` payload (draft > effective > code default). */
  payload: ProductPagePayload;
  /** Server-loaded board posts for this board, already capped. */
  posts: ProductPostOption[];
  locale: RegistryLocale;
}) {
  const t = ui(locale);
  // Same tab derivation as the public route; `null` active id keeps `전체`
  // active. Hrefs are inert (`#`) — the pane is pointer-events-none.
  const tabs = buildProductTabs(payload.filters, t.board.all, "#", null);
  const items: BoardListItem[] = posts.slice(0, PREVIEW_PAGE_SIZE).map((post) => ({
    idx: post.idx,
    title: post.title,
    thumb: post.thumb ?? null,
    date: post.date ?? null,
    category: post.category,
  }));

  return (
    <ScaledDesktop>
      {/* Hero band: product heroes are 353px tall and carry a subtitle (see
          PageHero heroHeight/padBottom) — title/subtitle classes mirror its
          desktop branch. */}
      <section className="bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col justify-start px-[15px] pt-[65px] lg:min-h-[353px] lg:flex-row lg:items-end lg:justify-between lg:pb-[88px] lg:pt-0">
          <div>
            <h1 className="text-[30px] font-bold leading-[1.2] text-black lg:text-[72px] lg:leading-[1.1]">
              {payload.title}
            </h1>
            <p className="mt-[3px] text-[15px] leading-[45px] text-body">
              <span className="text-[22px]">{payload.subtitle}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Board: identical spacing contract to `ProductBoard` (tab row + top gap
          + grid + tail), minus the pagination control. */}
      <section className="mx-auto max-w-[1280px] px-[15px]">
        <ProductTabs tabs={tabs} />
        <div aria-hidden className="h-[21px] min-[992px]:h-[31px]" />
        <ProductCardGrid posts={items} boardHref="#" emptyLabel={t.board.noPosts} />
        <div aria-hidden className="h-[73px] lg:h-[200px]" />
      </section>
    </ScaledDesktop>
  );
}
