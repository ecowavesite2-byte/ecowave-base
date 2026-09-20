import { localeHref, type Locale } from "../i18n";
import { routeForBoard, routeForKey } from "../routes";
import { hasEnglishBoard, hasEnglishPage } from "./read";

/**
 * Content change → routes to invalidate.
 *
 * `pathsFor` is a pure mapping (unit-tested); `revalidateFor` performs the
 * actual `next/cache` calls and must only run inside route handlers.
 */

export type ContentKind = "page" | "board" | "site";

/**
 * Routes affected by a change.
 *
 * - page: the requested locale's route; when editing ko and EN has no file of
 *   its own, the `/en/...` route renders ko too and must also be invalidated.
 * - board: the list route plus its `[id]` detail route for each affected locale.
 * - site: the root layout (`revalidateFor` uses the "layout" type).
 */
export function pathsFor(kind: ContentKind, locale: Locale, key: string): string[] {
  switch (kind) {
    case "page": {
      const base = routeForKey(key);
      const ko = localeHref("ko", base);
      const en = localeHref("en", base);
      if (locale !== "en") {
        return hasEnglishPage(key) ? [ko] : [ko, en];
      }
      return [en];
    }
    case "board": {
      const base = routeForBoard(key);
      const ko = localeHref("ko", base);
      const en = localeHref("en", base);
      const lists = locale !== "en" ? (hasEnglishBoard(key) ? [ko] : [ko, en]) : [en];
      return lists.flatMap((list) => [list, `${list}/[id]`]);
    }
    case "site":
      return ["/"];
    default:
      return [];
  }
}

/**
 * Invalidate the affected routes. Route-handler only (imports `next/cache`
 * lazily so `pathsFor` stays unit-testable in a plain Node environment).
 */
export async function revalidateFor(
  kind: ContentKind,
  locale: Locale,
  key: string,
): Promise<string[]> {
  const paths = pathsFor(kind, locale, key);
  const { revalidatePath } = await import("next/cache");
  const type = kind === "site" ? "layout" : "page";
  for (const path of paths) {
    revalidatePath(path, type);
  }
  return paths;
}
