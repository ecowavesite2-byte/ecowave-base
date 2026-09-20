import type { BoardContent, BoardPost } from "../types";
import type { Locale } from "../i18n";
import { BOARD_SLUGS } from "./paths";
import { boardSourceFile, getBoard, hasEnglishBoard } from "./read";
import { hashOfFile } from "./write";

/**
 * Server-only board helpers for the admin boards editor.
 *
 * Do not import this module from client components: it pulls in the fs-backed
 * reader. Client islands receive plain `BoardContent`/`BoardPost` objects.
 */

export interface BoardSummary {
  slug: string;
  label: string;
  count: number;
  hasEnglish: boolean;
}

/**
 * Static board labels. The crawled `board.name` fields are unreliable (and
 * swapped between news/notices), so the admin labels come from the nav intent.
 */
const BOARD_LABELS: Record<string, { ko: string; en: string }> = {
  news: { ko: "뉴스", en: "News" },
  notices: { ko: "공지사항", en: "Notices" },
  "products.eco-wave": { ko: "에코웨이브", en: "Eco wave" },
  "products.clean-b": { ko: "크린비", en: "Clean B" },
  "products.flowell": { ko: "플로웰", en: "Flowell" },
};

export function boardLabel(slug: string, locale: Locale): string {
  return BOARD_LABELS[slug]?.[locale] ?? slug;
}

/** Product boards carry `category` on their posts (news/notices do not). */
export function isProductBoard(slug: string): boolean {
  return slug.startsWith("products.");
}

export function listBoards(locale: Locale): BoardSummary[] {
  return BOARD_SLUGS.map((slug) => {
    let count = 0;
    try {
      count = getBoard(locale, slug).posts.length;
    } catch {
      count = 0;
    }
    return {
      slug,
      label: boardLabel(slug, locale),
      count,
      hasEnglish: hasEnglishBoard(slug),
    };
  });
}

export function boardPostByIdx(board: BoardContent, idx: string): BoardPost | null {
  return board.posts.find((post) => post.idx === idx) ?? null;
}

/** sha256 of the board file the content API uses as its optimistic version token. */
export function boardHash(locale: Locale, slug: string): string {
  return hashOfFile(boardSourceFile(locale, slug));
}
