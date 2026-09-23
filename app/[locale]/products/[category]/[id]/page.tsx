import { notFound } from "next/navigation";
import PageHero from "@/components/ui/PageHero";
import { PostDetail } from "@/components/ui/Boards";
import {
  PRODUCT_HERO,
  ProductTabs,
  orderedCategories,
  productSiblingNav,
} from "@/components/products/ProductBoard";
import { getBoard, PRODUCT_BOARDS } from "@/lib/content";
import { boardPostByIdx } from "@/lib/content/boards";
import { getResolvedBoard } from "@/lib/content/resolved";
import { defaultLocale, isLocale, localeHref } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

/** Product detail page. */
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
  const at = board.posts.findIndex((p) => p.idx === id);
  const nav = (p?: { idx: string; title: string; date?: string | null }) =>
    p ? { idx: p.idx, title: p.title, date: p.date } : null;
  // the detail hero matches the category LIST hero: EN label + KR subtitle
  const meta = PRODUCT_HERO[slug];
  // original mobile hero: KR combined title + sibling category nav
  const mobileNav = productSiblingNav(l, slug);
  const mobileTitle = mobileNav.find((n) => n.active)?.label;
  // category filter tab row (`전체` + categories) links back to the list page
  const base = localeHref(l, `/products/${category}`);
  const categories = orderedCategories(l, slug, board.posts);
  const tabs = [
    { label: t.board.all, href: base, active: true },
    ...categories.map((c) => ({
      label: c,
      href: `${base}?cat=${encodeURIComponent(c)}`,
      active: false,
    })),
  ];
  return (
    <main>
      <PageHero
        title={meta.label}
        subtitle={meta.subtitle}
        tabs={hero.tabs}
        big
        mobileNav={mobileNav}
        mobileTitle={mobileTitle}
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
          listLabel={t.board.list}
          prevLabel={t.board.prev}
          nextLabel={t.board.next}
          prevPost={nav(board.posts[at + 1])}
          nextPost={nav(board.posts[at - 1])}
        />
        {/* original board-section tail below the view: 105px mobile / 186px desktop */}
        <div aria-hidden className="h-[105px] min-[992px]:h-[186px]" />
      </section>
    </main>
  );
}
