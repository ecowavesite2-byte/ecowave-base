import { notFound } from "next/navigation";
import PageHero from "@/components/ui/PageHero";
import { PostDetail } from "@/components/ui/Boards";
import { getBoard, getBoardPost } from "@/lib/content";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import { heroFor } from "@/lib/page-hero";
import { ui } from "@/lib/ui-strings";

export async function generateStaticParams() {
  const out: { locale: string; id: string }[] = [];
  for (const locale of ["ko", "en"] as const) {
    try {
      const board = getBoard(locale, "notices");
      for (const p of board.posts) out.push({ locale, id: p.idx });
    } catch {}
  }
  return out;
}

export default async function NoticeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const post = getBoardPost(l, "notices", id);
  if (!post) notFound();
  const hero = heroFor("/notices", l);
  const t = ui(l);
  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} />
      <section className="mx-auto max-w-[1440px] px-5 pb-24 lg:px-10">
        <div className="mx-auto max-w-[1000px]">
          <PostDetail
            post={post}
            boardHref={localeHref(l, "/notices")}
            listLabel={t.board.list}
          />
        </div>
      </section>
    </main>
  );
}
