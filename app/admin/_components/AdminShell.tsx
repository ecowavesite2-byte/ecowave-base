import Link from "next/link";
import type { ReactNode } from "react";

import AdminLocaleToggle from "./AdminLocaleToggle";
import AdminSidebar from "./AdminSidebar";
import LogoutButton from "./LogoutButton";
import { getAdminLocale } from "./adminLocale";
import { adminDict } from "@/lib/admin/i18n";

/**
 * Admin shell — the persistent chrome around every `/admin` (dashboard) page.
 *
 * Layout mirrors MCell's admin layout:
 *   - a header row (title, signed-in admin identity, language, "view site",
 *     sign-out) at the top;
 *   - a two-column region from the desktop breakpoint (992px, the same width the
 *     public site uses) with a sticky, grouped left sidebar and the page content
 *     in a `min-w-0 flex-1` column;
 *   - below that breakpoint the page content is replaced by a desktop-only
 *     notice, because the editors are desktop surfaces (MCell does the same).
 *
 * This is a server component: the auth gate lives in the (dashboard) layout and
 * the locale comes from a cookie, so the sidebar/toggle/sign-out clients receive
 * their dictionary props already resolved.
 */

// Desktop breakpoint is 992px — the same width the public site uses. The
// `min-[992px]:` prefix is written out literally everywhere because Tailwind v4
// scans source text for class candidates (a shared variable would not match).
export default async function AdminShell({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const locale = await getAdminLocale();
  const t = adminDict[locale];

  return (
    <div className={`min-h-screen bg-soft text-ink`}>
      <div className="px-4 py-6 min-[992px]:px-8 min-[992px]:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold tracking-tight text-ink">{t.shell.title}</h1>
            <p className="mt-1 truncate text-[13px] text-muted" title={email}>
              {t.shell.adminRole} · <span className="text-body">{email}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AdminLocaleToggle locale={locale} />
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
            >
              {t.shell.viewSite} ↗
            </Link>
            <LogoutButton label={t.shell.signOut} busyLabel={t.shell.signingOut} />
          </div>
        </div>

        <div className="mt-6 hidden min-[992px]:mt-8 min-[992px]:flex min-[992px]:flex-row min-[992px]:items-start min-[992px]:gap-8">
          <AdminSidebar locale={locale} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>

        {/* The editors are desktop-only — below the breakpoint show a notice instead. */}
        <div className="mt-10 flex flex-col items-center gap-3 rounded-[4px] border border-black/10 bg-white px-6 py-16 text-center min-[992px]:hidden">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="text-muted"
            aria-hidden
          >
            <rect x="2" y="4" width="20" height="13" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <p className="text-[16px] font-bold text-ink">{t.shell.desktopOnly}</p>
          <p className="max-w-[320px] text-[13px] leading-6 text-muted">
            {t.shell.desktopOnlyHint}
          </p>
        </div>
      </div>
    </div>
  );
}
