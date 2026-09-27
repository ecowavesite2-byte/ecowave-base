import { notFound } from "next/navigation";
import PageHero from "@/components/ui/PageHero";
import { PostDetail } from "@/components/ui/Boards";
import { ProductTabs, productSiblingNav } from "@/components/products/ProductBoard";
import { buildProductTabs } from "@/components/products/product-tabs";
import { getBoard, PRODUCT_BOARDS } from "@/lib/content";
import { boardPostByIdx } from "@/lib/content/boards";
import {
  getResolvedBoard,
  getResolvedBoardName,
  getResolvedProductPage,
} from "@/lib/content/resolved";
import { defaultLocale, isLocale, localeHref } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

/**
 * Product detail page.
 *
 * Static params are built from the file/code defaults only (`getBoard`), because
 * build-time DB reads are intentionally avoided. Posts that exist only as admin
 * overrides are therefore not prerendered: `dynamicParams` defaults to `true`,
 * so such posts are rendered on demand, and at request time `getResolvedBoard`
 * supplies the stored override. Keep `getBoard` here — switching to a DB-backed
 * reader would reintroduce a build-time DB dependency.
 */
export async function generateStaticParams() {
  const cats = ["eco-wave", "clean-b", "flowell"];
  const out: { locale: string; category: string; id: string }[] = [];
  for (const category of cats) {
    const slug = `products/${category}`;
    for (const locale of ["ko", "en"] as const) {
      try {
        const board = getBoard(locale, slug);
        for (const p of board.posts) out.push({ locale, category, id: p.idx });
      } catch {}
    }
  }
  return out;
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; category: string; id: string }>;
}) {
  const { locale, category, id } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  if (!PRODUCT_BOARDS.includes(`products/${category}` as never)) notFound();
  const slug = `products/${category}`;
  const hero = await heroFor(`/products/${category}`, l);
  const t = ui(l);
  const board = await getResolvedBoard(l, slug);
  const post = boardPostByIdx(board, id);
  if (!post) notFound();
  // A stored name override wins even when its value equals the (empty) crawled
  // base; otherwise the static per-category label.
  const { name: boardName } = await getResolvedBoardName(l, slug);
  const at = board.posts.findIndex((p) => p.idx === id);
  const nav = (p?: { idx: string; title: string; date?: string | null }) =>
    p ? { idx: p.idx, title: p.title, date: p.date } : null;
  // the detail hero matches the category LIST hero: EN label + KR subtitle
  const meta = await getResolvedProductPage(l, slug);
  // original mobile hero: same title + subtitle + sibling category nav
  const mobileNav = productSiblingNav(l, slug);
  // category filter tab row (`전체` + categories) links back to the list page;
  // the detail page keeps the original `전체`-active tab row.
  const base = localeHref(l, `/products/${category}`);
  const tabs = buildProductTabs(meta.filters, t.board.all, base, null);
  return (
    <main>
      <PageHero
        title={meta.title}
        subtitle={meta.subtitle}
        tabs={hero.tabs}
        big
        mobileNav={mobileNav}
        mobilePills={category === "eco-wave"}
      />
      <section className="mx-auto max-w-[1280px] px-[15px]">
        {/* measured original detail: tab row (67) + 31px spacer + 15px widget
            gutter before the board view (desktop); mobile keeps the 21px spacer
            + 10px gutter and hides the tabs (see ProductTabs) */}
        <ProductTabs tabs={tabs} />
        <div aria-hidden className="h-[21px] min-[992px]:h-[31px]" />
        <div aria-hidden className="h-[10px] min-[992px]:h-[15px]" />
        <PostDetail
          post={post}
          boardHref={base}
          boardName={boardName}
          listLabel={t.board.list}
          prevLabel={t.board.prev}
          nextLabel={t.board.next}
          prevPost={nav(board.posts[at - 1])}
          nextPost={nav(board.posts[at + 1])}
        />
        {/* original board-section tail below the view: 105px mobile / 186px desktop */}
        <div aria-hidden className="h-[105px] min-[992px]:h-[186px]" />
      </section>
    </main>
  );
}
