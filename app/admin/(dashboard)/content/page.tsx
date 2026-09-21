import { getAdminLocale } from "../../_components/adminLocale";
import RegistryEditor from "../../_components/registry/RegistryEditor";
import type { DefaultsMap, PageTree, TreesMap } from "../../_components/registry/types";
import {
  CONTENT_DEFS,
  CONTENT_GROUPS,
  DEFAULT_VALUES,
  type ContentGroup,
} from "@/lib/content/registry";
import { getPage } from "@/lib/content/read";
import type { Section } from "@/lib/types";

export const metadata = { title: "Content" };

/**
 * `/admin/content` — MCell-style content/pages editor.
 *
 * The (dashboard) layout already enforces `requireAdmin()`. This server
 * component hands the client island the current group's code defaults (for
 * default-as-placeholder) and the raw crawled page trees (for the scaled live
 * preview); the effective values and every write go through the existing
 * `/api/admin/registry` route.
 *
 * `?group=` selects the group (defaults to home) and is also the preview scope:
 * switching a group is a link navigation so only that group's data crosses the
 * wire.
 */

function safeSections(locale: "ko" | "en", pageKey: string): Section[] | null {
  try {
    return getPage(locale, pageKey).sections ?? null;
  } catch {
    return null;
  }
}

export default async function ContentRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const locale = await getAdminLocale();
  const params = await searchParams;
  const requested = params.group;
  const group: ContentGroup =
    requested && (CONTENT_GROUPS as readonly string[]).includes(requested)
      ? (requested as ContentGroup)
      : "home";

  const groupDefs = CONTENT_DEFS.filter((def) => def.group === group);

  const defaults: DefaultsMap = {};
  for (const def of groupDefs) {
    defaults[def.key] = {
      ko: DEFAULT_VALUES[def.key]?.ko ?? "",
      en: DEFAULT_VALUES[def.key]?.en ?? "",
    };
  }

  const trees: TreesMap = {};
  for (const def of groupDefs) {
    if (def.pageKey in trees) continue;
    const tree: PageTree = {
      ko: safeSections("ko", def.pageKey),
      en: safeSections("en", def.pageKey),
    };
    trees[def.pageKey] = tree;
  }

  return (
    <RegistryEditor
      locale={locale}
      initialGroup={group}
      groups={[...CONTENT_GROUPS]}
      defaults={defaults}
      trees={trees}
    />
  );
}
