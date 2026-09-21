import Link from "next/link";

import { getAdminLocale } from "../_components/adminLocale";
import { getPrisma, isDbConfigured } from "@/lib/content/db";
import { BOARD_SLUGS } from "@/lib/content/paths";
import { CONTENT_DEFS } from "@/lib/content/registry";
import { adminDict } from "@/lib/admin/i18n";

export const metadata = { title: "Dashboard" };

/**
 * `/admin` — overview.
 *
 * Every number is computed from the existing stores (no new API route):
 *   - `page_content`  → count of stored content overrides;
 *   - `board_post`    → stored post overrides (per locale) + how many boards
 *                       have been customized;
 *   - `site_setting`  → how many setting values are set.
 *
 * With `DATABASE_URL` unset the counts are unavailable and render as an em dash,
 * matching the rest of the admin's graceful degradation.
 */

const CARD = "rounded-[4px] border border-black/10 bg-white p-5";
const VALUE = "mt-1 text-[26px] font-bold text-accent";

export default async function AdminOverviewPage() {
  const locale = await getAdminLocale();
  const t = adminDict[locale];

  const prisma = getPrisma();
  const dbConfigured = isDbConfigured();

  /** Run a count query; 0 when the DB is unconfigured or the query fails. */
  async function count(run: (p: NonNullable<typeof prisma>) => Promise<number>): Promise<number> {
    if (!prisma) return 0;
    try {
      return await run(prisma);
    } catch (error) {
      console.warn("[admin] overview stat query failed", error);
      return 0;
    }
  }

  const [contentOverrides, boardKo, boardEn, boardsCustomized, siteSet, siteTotal] =
    await Promise.all([
      count((p) => p.pageContent.count()),
      count((p) => p.boardPost.count({ where: { locale: "ko" } })),
      count((p) => p.boardPost.count({ where: { locale: "en" } })),
      count(
        async (p) =>
          (
            await p.boardPost.findMany({ distinct: ["slug"], select: { slug: true } })
          ).length,
      ),
      count((p) => p.siteSetting.count({ where: { value: { not: "" } } })),
      count((p) => p.siteSetting.count()),
    ]);

  const shown = (n: number) => (dbConfigured ? String(n) : "—");

  const stats = [
    {
      label: t.dashboard.contentOverrides,
      value: shown(contentOverrides),
      sub: t.dashboard.contentOverridesSub(contentOverrides, CONTENT_DEFS.length),
    },
    {
      label: t.dashboard.boardPosts,
      value: shown(boardKo + boardEn),
      sub: t.dashboard.boardPostsSub(boardKo, boardEn),
    },
    {
      label: t.dashboard.boardsCustomized,
      value: shown(boardsCustomized),
      sub: t.dashboard.boardsCustomizedSub(boardsCustomized, BOARD_SLUGS.length),
    },
    {
      label: t.dashboard.siteSettings,
      value: shown(siteSet),
      sub: t.dashboard.siteSettingsSub(siteSet, siteTotal),
    },
  ];

  return (
    <div className="mx-auto max-w-[960px] p-8">
      {!dbConfigured ? (
        <div
          role="status"
          className="mb-6 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
        >
          {t.dashboard.dbNotice}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={CARD}>
            <p className="text-[13px] text-muted">{s.label}</p>
            <p className={VALUE}>{s.value}</p>
            <p className="mt-1 text-[12px] text-muted">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <h2 className="text-[15px] font-bold text-ink">{t.dashboard.quickLinks}</h2>
          <ul className="mt-3 space-y-2 text-[14px]">
            {t.dashboard.links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-accent hover:underline">
                  {link.label}
                </Link>
                <span className="text-muted"> — {link.desc}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={CARD}>
          <h2 className="text-[15px] font-bold text-ink">{t.dashboard.notes}</h2>
          <div className="mt-3 text-[13px] leading-6 text-body">
            {t.dashboard.noteLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
