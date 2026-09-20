import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { getBoard } from "@/lib/content/read";
import { isValidBoardSlug } from "@/lib/content/paths";
import { boardHash, boardLabel, boardPostByIdx, isProductBoard } from "@/lib/content/boards";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import PostEditor from "../../../../_components/boards/PostEditor";

export const metadata = { title: "Post editor" };

export default async function BoardPostEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; idx: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  // The dashboard layout already guards this route group; requireAdmin() here
  // keeps the editor route independently authoritative.
  await requireAdmin();

  const { slug, idx } = await params;
  if (!isValidBoardSlug(slug)) notFound();

  const requested = (await searchParams).locale ?? defaultLocale;
  const locale: Locale = isLocale(requested) ? requested : defaultLocale;

  const board = getBoard(locale, slug);
  const post = boardPostByIdx(board, idx);
  if (!post) notFound();

  return (
    <PostEditor
      key={`${locale}:${slug}:${idx}`}
      board={board}
      idx={idx}
      slug={slug}
      locale={locale}
      hash={boardHash(locale, slug)}
      label={boardLabel(slug, locale)}
      isProduct={isProductBoard(slug)}
    />
  );
}
