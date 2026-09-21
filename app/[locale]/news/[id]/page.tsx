import { notFound } from "next/navigation";
import PageHero from "@/components/ui/PageHero";
import { PostDetail } from "@/components/ui/Boards";
import { getBoard } from "@/lib/content";
import { boardPostByIdx } from "@/lib/content/boards";
import { getResolvedBoard } from "@/lib/content/resolved";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

export async function generateStaticParams() {
  const out: { locale: string; id: string }[] = [];
  for (const locale of ["ko", "en"] as const) {
    try {
      const board = getBoard(locale, "news");
      for (const p of board.posts) out.push({ locale, id: p.idx });
    } catch {}
  }
  return out;
}

export default async function NewsDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const hero = await heroFor("/news", l);
  const t = ui(l);
  const board = await getResolvedBoard(l, "news");
  const post = boardPostByIdx(board, id);
  if (!post) notFound();
  const at = board.posts.findIndex((p) => p.idx === id);
  const nav = (p?: { idx: string; title: string; date?: string | null }) =>
    p ? { idx: p.idx, title: p.title, date: p.date } : null;
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} />
      <section className="mx-auto max-w-[1440px] px-5 pb-24 lg:px-10">
        <div className="mx-auto max-w-[1000px]">
          <PostDetail
            post={post}
            boardHref={localeHref(l, "/news")}
            listLabel={t.board.list}
            prevLabel={t.board.prev}
            nextLabel={t.board.next}
            prevPost={nav(board.posts[at + 1])}
            nextPost={nav(board.posts[at - 1])}
          />
        </div>
      </section>
    </main>
  );
}
