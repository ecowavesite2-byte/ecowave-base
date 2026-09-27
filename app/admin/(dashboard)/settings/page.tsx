import { redirect } from "next/navigation";

export const metadata = { title: "Settings" };

/**
 * `/admin/settings` → `/admin/content?group=site`.
 *
 * The standalone settings screen was folded into the content editor (the `site`
 * group holds the nav-label fields), so this route is kept only as a redirect
 * for old bookmarks. The (dashboard) layout has already enforced `requireAdmin()`.
 */
export default function AdminSettingsPage() {
  redirect("/admin/content?group=site");
}
