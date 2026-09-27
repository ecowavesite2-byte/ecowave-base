import { redirect } from "next/navigation";

export const metadata = { title: "Boards" };

/**
 * `/admin/boards` → `/admin/content?group=boards`.
 *
 * Board editing is folded into the content editor's News & Notices tab, so the
 * picker is kept only as a redirect for old bookmarks. A `?locale=` on the old
 * URL (the board content locale) is preserved. The (dashboard) layout has
 * already enforced `requireAdmin()`.
 */
export default async function BoardsPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const locale = (await searchParams).locale;
  const query = new URLSearchParams({ group: "boards" });
  if (locale) query.set("locale", locale);
  redirect(`/admin/content?${query.toString()}`);
}
