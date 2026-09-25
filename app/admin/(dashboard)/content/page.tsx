import { getAdminLocale } from "../../_components/adminLocale";
import RegistryEditor from "../../_components/registry/RegistryEditor";
import type {
  BoardPostOption,
  BoardPostsMap,
  DefaultsMap,
  PageTree,
  TreesMap,
} from "../../_components/registry/types";
import {
  CONTENT_DEFS,
  CONTENT_GROUPS,
  DEFAULT_VALUES,
  type ContentGroup,
} from "@/lib/content/registry";
import { getPage } from "@/lib/content/read";
import { getResolvedBoard } from "@/lib/content/resolved";
import type { BoardPost, Section } from "@/lib/types";

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

const EMPTY_BOARD_POSTS: BoardPostsMap = {
  ko: { news: [], notices: [] },
  en: { news: [], notices: [] },
};

/** Compact server-side post options for the ticker `picks` editor (cap 50). */
function compactPosts(posts: BoardPost[]): BoardPostOption[] {
  return posts.slice(0, 50).map((post) => ({
    idx: post.idx,
    title: post.title,
    date: post.date,
  }));
}

/**
 * Board options for both ticker boards, per CONTENT locale (post ids differ
 * between KO and EN, so each editor column needs its own set). Only loaded for
 * the home group, which is the only place a `picks` def exists.
 */
async function loadBoardPosts(): Promise<BoardPostsMap> {
  const langs = ["ko", "en"] as const;
  const out: BoardPostsMap = {
    ko: { news: [], notices: [] },
    en: { news: [], notices: [] },
  };
  await Promise.all(
    langs.map(async (lang) => {
      const [news, notices] = await Promise.all([
        getResolvedBoard(lang, "news"),
        getResolvedBoard(lang, "notices"),
      ]);
      out[lang] = { news: compactPosts(news.posts), notices: compactPosts(notices.posts) };
    }),
  );
  return out;
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

  // Board options exist for the home ticker `picks` def only. Other groups skip
  // the (DB-backed) board reads entirely.
  const boardPosts = group === "home" ? await loadBoardPosts() : EMPTY_BOARD_POSTS;

  return (
    <RegistryEditor
      locale={locale}
      initialGroup={group}
      groups={[...CONTENT_GROUPS]}
      defaults={defaults}
      trees={trees}
      boardPosts={boardPosts}
    />
  );
}
