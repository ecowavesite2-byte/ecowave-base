import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoard } from "@/lib/content/read";
import { isValidBoardSlug } from "@/lib/content/paths";
import { boardLabel, isProductBoard } from "@/lib/content/boards";
import { routeForBoard } from "@/lib/routes";
import { defaultLocale, isLocale, localeHref, type Locale } from "@/lib/i18n";
import PostList from "../../../_components/boards/PostList";

export const metadata = { title: "Board posts" };

export default async function BoardPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { slug } = await params;
  if (!isValidBoardSlug(slug)) notFound();

  const requested = (await searchParams).locale ?? defaultLocale;
  const locale: Locale = isLocale(requested) ? requested : defaultLocale;

  const board = getBoard(locale, slug);
  const label = boardLabel(slug, locale);

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/boards?locale=${locale}`}
            className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
          >
            ← Boards
          </Link>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">{label}</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            {board.posts.length} posts · <span className="font-mono">{slug}</span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href={localeHref(locale, routeForBoard(slug))}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
          >
            View board ↗
          </Link>
          <div className="flex rounded-md border border-line bg-white p-0.5">
            {(["ko", "en"] as const).map((value) => (
              <Link
                key={value}
                href={`/admin/boards/${slug}?locale=${value}`}
                aria-current={locale === value ? "page" : undefined}
                className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
                  locale === value ? "bg-accent text-white" : "text-[#6b7280] hover:text-accent"
                }`}
              >
                {value === "ko" ? "KO" : "EN"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <PostList
          slug={slug}
          locale={locale}
          posts={board.posts}
          isProduct={isProductBoard(slug)}
        />
      </div>
    </div>
  );
}
