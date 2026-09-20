import Link from "next/link";
import { listBoards } from "@/lib/content/boards";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

export const metadata = { title: "Boards" };

export default async function BoardsListPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const requested = (await searchParams).locale ?? defaultLocale;
  const locale: Locale = isLocale(requested) ? requested : defaultLocale;
  const boards = listBoards(locale);
  const total = boards.reduce((sum, board) => sum + board.count, 0);

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Boards</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            {boards.length} boards · {total} posts
          </p>
        </div>
        <div className="ml-auto flex rounded-md border border-line bg-white p-0.5">
          {(["ko", "en"] as const).map((value) => (
            <Link
              key={value}
              href={`/admin/boards?locale=${value}`}
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

      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
        {boards.map((board, index) => (
          <Link
            key={board.slug}
            href={`/admin/boards/${board.slug}?locale=${locale}`}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#f4f5f7] ${
              index > 0 ? "border-t border-line" : ""
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
              {board.label}
            </span>
            <span className="hidden font-mono text-[11px] text-[#9ca3af] sm:inline">
              {board.slug}
            </span>
            <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#4b5563]">
              {board.count} {board.count === 1 ? "post" : "posts"}
            </span>
            {board.hasEnglish ? null : (
              <span className="shrink-0 rounded-full bg-[#eef2ff] px-2 py-0.5 text-[10px] font-medium text-[#4338ca]">
                EN inherits
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
