import SettingsPanel from "../../_components/settings/SettingsPanel";
import { getAdminLocale } from "../../_components/adminLocale";
import {
  CONTENT_KEYS_BY_GROUP,
  DEFAULT_VALUES,
} from "@/lib/content/registry";
import { adminDict } from "@/lib/admin/i18n";

export const metadata = { title: "Settings" };

/**
 * `/admin/settings` — site settings (registry `site` group).
 *
 * The (dashboard) layout already enforces `requireAdmin()`. Raw code defaults are
 * read here (server-side) and handed to the client panel so it can show them as
 * placeholders; the values themselves and all writes go through the existing
 * `/api/admin/registry` route.
 */
export default async function AdminSettingsPage() {
  const locale = await getAdminLocale();
  const t = adminDict[locale].settings;

  const defaults: Record<string, string> = {};
  for (const key of CONTENT_KEYS_BY_GROUP.site) {
    defaults[key] = DEFAULT_VALUES[key]?.[locale] ?? "";
  }

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-0.5 text-[13px] text-muted">{t.blurb}</p>
      </div>

      <div className="mt-6">
        <SettingsPanel locale={locale} defaults={defaults} />
      </div>
    </div>
  );
}
