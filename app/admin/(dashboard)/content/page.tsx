import { getAdminLocale } from "../../_components/adminLocale";
import RegistryEditor from "../../_components/registry/RegistryEditor";
import type {
  BoardPostOption,
  BoardPostsMap,
  DefaultsMap,
  PageTree,
  ProductPostOption,
  ProductPostsMap,
  TreesMap,
} from "../../_components/registry/types";
import {
  CONTENT_DEFS,
  CONTENT_GROUPS,
  DEFAULT_VALUES,
  type ContentGroup,
} from "@/lib/content/registry";
import { getPage } from "@/lib/content/read";
import { getResolvedBoard, getResolvedSite } from "@/lib/content/resolved";
import type { BoardPost, NavItem, Section } from "@/lib/types";

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

const EMPTY_PRODUCT_POSTS: ProductPostsMap = { ko: {}, en: {} };

/** Compact server-side post options for the ticker `picks` editor (cap 50). */
function compactPosts(posts: BoardPost[]): BoardPostOption[] {
  return posts.slice(0, 50).map((post) => ({
    idx: post.idx,
    title: post.title,
    date: post.date,
    thumb: post.thumb ?? null,
    excerpt: post.excerpt ?? "",
  }));
}

/** Compact posts for the `productPage` preview (cap 24, keeps `category`). */
function compactProductPosts(posts: BoardPost[]): ProductPostOption[] {
  return posts.slice(0, 24).map((post) => ({
    idx: post.idx,
    title: post.title,
    category: post.category,
    thumb: post.thumb ?? null,
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

/**
 * Board posts per `productPage` def, per content locale (post ids/categories
 * differ per locale). The def's `pageKey` is the dot slug the store expects, so
 * it can be passed to `getResolvedBoard` directly. Only loaded for the products
 * group; other groups get an empty map and skip the DB-backed reads.
 */
async function loadProductPosts(groupDefs: { kind: string; pageKey: string }[]): Promise<ProductPostsMap> {
  const langs = ["ko", "en"] as const;
  const pageKeys = [
    ...new Set(groupDefs.filter((def) => def.kind === "productPage").map((def) => def.pageKey)),
  ];
  const out: ProductPostsMap = { ko: {}, en: {} };
  await Promise.all(
    langs.map(async (lang) => {
      const boards = await Promise.all(pageKeys.map((key) => getResolvedBoard(lang, key)));
      pageKeys.forEach((key, index) => {
        out[lang][key] = compactProductPosts(boards[index].posts);
      });
    }),
  );
  return out;
}

export default async function ContentRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; locale?: string }>;
}) {
  const locale = await getAdminLocale();
  const params = await searchParams;
  const requested = params.group;
  const group: ContentGroup =
    requested && (CONTENT_GROUPS as readonly string[]).includes(requested)
      ? (requested as ContentGroup)
      : "home";
  // Board CONTENT locale for the embedded News & Notices editor, forwarded from
  // the old `/admin/boards/<slug>?locale=` URL. Invalid/absent → the editor
  // falls back to the admin locale (existing behavior).
  const initialBoardLocale: "ko" | "en" | undefined =
    params.locale === "ko" || params.locale === "en" ? params.locale : undefined;

  // The products group carries one hidden `board/**/name` def per product page
  // and the boards group carries the news/notices `board/**/name` defs
  // (`sectionId: "board"`). Those values are the board labels, edited in the
  // embedded BoardEditor and NOT rendered on the pages themselves, so they are
  // excluded here: they never render, and contribute no defaults or preview
  // tree. The defs stay in the registry — the boards save API resolves them via
  // `CONTENT_DEF_MAP`.
  const groupDefs = CONTENT_DEFS.filter(
    (def) =>
      def.group === group &&
      !((group === "products" || group === "boards") && def.sectionId === "board"),
  );

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

  // Product posts back the `productPage` live preview; same skip for other groups.
  const productPosts = group === "products" ? await loadProductPosts(groupDefs) : EMPTY_PRODUCT_POSTS;

  // The footer (common group) preview injects the sitemap sub-links from the
  // resolved nav, exactly like the public `SiteFooter`; both locales are loaded
  // so the preview's language toggle shows the matching nav labels. Other groups
  // skip the read.
  let nav: Partial<Record<"ko" | "en", NavItem[]>> = {};
  if (group === "common") {
    const [koSite, enSite] = await Promise.all([getResolvedSite("ko"), getResolvedSite("en")]);
    nav = { ko: koSite.nav, en: enSite.nav };
  }

  return (
    <RegistryEditor
      locale={locale}
      initialGroup={group}
      groups={[...CONTENT_GROUPS]}
      defaults={defaults}
      trees={trees}
      boardPosts={boardPosts}
      productPosts={productPosts}
      nav={nav}
      initialBoardLocale={initialBoardLocale}
    />
  );
}
