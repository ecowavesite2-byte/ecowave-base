import Link from "next/link";
import { getPage, getSite, hasEnglishPage } from "@/lib/content/read";
import { PAGE_KEYS } from "@/lib/content/paths";
import { PAGE_KEY_TO_ROUTE, routeForSource } from "@/lib/routes";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import {
  countTranslatableFields,
  coveragePercent,
  translationCoverage,
  type Coverage,
} from "../../_lib/tree";

export const metadata = { title: "Pages" };

const ROUTE_TO_KEY = new Map(
  Object.entries(PAGE_KEY_TO_ROUTE).map(([key, route]) => [route, key] as const),
);

interface PageRow {
  key: string;
  name: string;
  hasEn: boolean;
  ko: Coverage;
  en: Coverage | null;
}

interface PageGroup {
  label: string;
  rows: PageRow[];
}

function safeCoverage(locale: Locale, key: string): Coverage | null {
  try {
    return countTranslatableFields(getPage(locale, key));
  } catch {
    return null;
  }
}

function makeRow(key: string, name: string): PageRow {
  const hasEn = hasEnglishPage(key);
  return {
    key,
    name,
    hasEn,
    ko: safeCoverage("ko", key) ?? { total: 0, filled: 0 },
    en: hasEn ? safeCoverage("en", key) : null,
  };
}

/** Mirror the site menu from `site.json nav[]`, then append any orphan keys. */
function buildGroups(locale: Locale): PageGroup[] {
  const site = getSite(locale);
  const claimed = new Set<string>();
  const groups: PageGroup[] = [];

  for (const item of site.nav) {
    const rows: PageRow[] = [];
    const parentKey = ROUTE_TO_KEY.get(routeForSource(item.url));
    if (parentKey && !claimed.has(parentKey)) {
      rows.push(makeRow(parentKey, item.name));
      claimed.add(parentKey);
    }
    for (const child of item.children) {
      const childKey = ROUTE_TO_KEY.get(routeForSource(child.url));
      if (childKey && !claimed.has(childKey)) {
        rows.push(makeRow(childKey, child.name));
        claimed.add(childKey);
      }
    }
    if (rows.length > 0) groups.push({ label: item.name, rows });
  }

  const orphans = PAGE_KEYS.filter((key) => !claimed.has(key));
  const home = orphans.filter((key) => key === "home");
  const rest = orphans.filter((key) => key !== "home");

  const result: PageGroup[] = [];
  if (home.length > 0) {
    result.push({ label: "Home", rows: home.map((key) => makeRow(key, "Home")) });
  }
  result.push(...groups);
  if (rest.length > 0) {
    result.push({ label: "Other pages", rows: rest.map((key) => makeRow(key, key)) });
  }
  return result;
}

function coverageBadge(label: string, coverage: Coverage, tone: "ko" | "en") {
  const cls =
    tone === "ko"
      ? "bg-[#eef2ff] text-[#4338ca]"
      : "bg-[#ecfdf5] text-[#047857]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label} {coveragePercent(coverage)}%
    </span>
  );
}

export default async function PagesListPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const params = await searchParams;
  const requested = params.locale ?? defaultLocale;
  const locale: Locale = isLocale(requested) ? requested : defaultLocale;
  const groups = buildGroups(locale);
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Pages</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            {total} pages · grouped like the site menu
          </p>
        </div>
        <div className="ml-auto flex rounded-md border border-line bg-white p-0.5">
          {(["ko", "en"] as const).map((value) => (
            <Link
              key={value}
              href={`/admin/pages?locale=${value}`}
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

      <div className="mt-6 space-y-6">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[#6b7280] uppercase">
              {group.label}
            </h2>
            <div className="overflow-hidden rounded-lg border border-line bg-white">
              {group.rows.map((row, index) => (
                <Link
                  key={row.key}
                  href={`/admin/pages/${row.key}?locale=${locale}`}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#f4f5f7] ${
                    index > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{row.name}</span>
                  <span className="hidden font-mono text-[11px] text-[#9ca3af] sm:inline">
                    {row.key}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {coverageBadge("KO", row.ko, "ko")}
                    {row.hasEn && row.en ? (
                      coverageBadge("EN", translationCoverage(row.en, row.ko), "en")
                    ) : (
                      <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">
                        EN inherits
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
