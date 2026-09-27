import { notFound, redirect } from "next/navigation";
import { isValidBoardSlug } from "@/lib/content/paths";

export const metadata = { title: "Board editor" };

/**
 * `/admin/boards/<slug>` → the matching content-editor tab.
 *
 * Product boards open Content → Products (their board posts are managed from the
 * productPage editor); news/notices open Content → News & Notices. A `?locale=`
 * on the old URL (the board content locale) is forwarded only for news/notices,
 * whose embedded board editor consumes it; the products group has no
 * initial-locale support, so the param is dropped there rather than leave a
 * misleading URL. An unknown slug is a 404. The (dashboard) layout has already
 * enforced `requireAdmin()`.
 */
export default async function BoardEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { slug } = await params;
  if (!isValidBoardSlug(slug)) notFound();

  const locale = (await searchParams).locale;
  const isProduct = slug.startsWith("products");
  const query = new URLSearchParams({ group: isProduct ? "products" : "boards" });
  if (!isProduct && locale) query.set("locale", locale);
  redirect(`/admin/content?${query.toString()}`);
}
