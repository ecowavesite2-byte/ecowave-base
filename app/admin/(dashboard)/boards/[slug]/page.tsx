import { notFound } from "next/navigation";
import BoardEditor from "../../../_components/boards/BoardEditor";
import { getAdminLocale } from "../../../_components/adminLocale";
import { isValidBoardSlug } from "@/lib/content/paths";
import { defaultLocale, isLocale } from "@/lib/i18n";

export const metadata = { title: "Board editor" };

/** Per-board editor. The (dashboard) layout already guards this route group. */
export default async function BoardEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { slug } = await params;
  if (!isValidBoardSlug(slug)) notFound();

  const requested = (await searchParams).locale ?? defaultLocale;
  const locale = isLocale(requested) ? requested : defaultLocale;
  const adminLocale = await getAdminLocale();

  return <BoardEditor slug={slug} initialLocale={locale} adminLocale={adminLocale} />;
}
