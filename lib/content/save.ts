import { CONTENT_DEF_MAP, MAX_LENGTH, type ContentDef } from "./registry";
import { getPrisma } from "./db";

/**
 * mcell-style override save logic.
 *
 * Code defaults live in `lib/content/registry.ts`; the DB stores only overrides.
 * An EMPTY value deletes the override so the code default applies again.
 *
 * Server-only: imports the Prisma factory (never imported client-side) and
 * `next/cache` lazily so this module stays importable in DB-free unit tests.
 */

/** Message returned when the DB lane is unavailable. Exported so API routes can map it to 503. */
export const DB_NOT_CONFIGURED_MESSAGE =
  "Database is not configured (DATABASE_URL missing).";

export interface SaveContentResult {
  ok: boolean;
  message?: string;
}

export interface SaveContentInput {
  key: string;
  locale: "ko" | "en";
  value: string;
  actor: string;
}

/** Relative media path (`/images/…`) or absolute http(s) URL; nothing exotic. */
function isValidMediaValue(value: string): boolean {
  // Whitespace, angle brackets, quotes, and backslashes are never valid in a URL
  // field (prevents attribute/HTML injection and stray control characters).
  if (/[\s<>"'\\]/.test(value)) return false;
  // Protocol-relative `//host` is ambiguous and not a local path.
  if (value.startsWith("//")) return false;
  // Local asset path.
  if (value.startsWith("/")) return value.length > 1;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `slides` payloads are structured: a non-empty JSON array of
 * `{ bg: string | null, html: string }`. Rejecting malformed/empty payloads at
 * the API boundary keeps a bad request from blanking the hero (Gate-2 F3).
 */
function isValidSlidesPayload(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    return parsed.every((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const slide = entry as { bg?: unknown; html?: unknown };
      const bgOk = slide.bg === null || typeof slide.bg === "string";
      return bgOk && typeof slide.html === "string";
    });
  } catch {
    return false;
  }
}

/**
 * Invalidate the routes a def affects.
 *
 * `ContentDef.revalidate` (emitted by the registry generator) lists the routes in
 * the form they are SERVED in: Korean is prefixless ("/", "/company") and English
 * is prefixed ("/en", "/en/company"). Next.js on the other hand prerenders every
 * locale under its segment ("/ko", "/ko/company", "/en", …), so a pages-only
 * purge of the served form can miss the cached entry that answers the request.
 * We therefore invalidate the prefixed variant as well, plus the root layout,
 * which is cheap on a site this size and guarantees the public site updates.
 */
function revalidateVariants(path: string): string[] {
  if (path === "/") return ["/", "/ko"];
  if (path.startsWith("/en/") || path === "/en") return [path];
  return [path, "/ko" + path];
}

async function revalidateDef(def: ContentDef): Promise<void> {
  try {
    const { revalidatePath } = await import("next/cache");
    const isSite = def.pageKey === "site" || def.sectionId === "nav";
    revalidatePath("/", "layout");
    for (const path of def.revalidate) {
      for (const variant of revalidateVariants(path)) {
        revalidatePath(variant, isSite ? "layout" : "page");
      }
    }
  } catch (error) {
    // The override is already persisted; a revalidation hiccup must not fail the save.
    console.warn("[content/save] revalidate failed", error);
  }
}

/**
 * Validate + persist one override.
 *
 * - unknown key / bad locale / over-length / bad media shape → `{ ok: false, message }`
 * - unconfigured DB → `{ ok: false, message: DB_NOT_CONFIGURED_MESSAGE }`
 * - empty value → delete the override row(s); `url` fields delete both locales
 * - non-empty `url` value → upsert both locales with the same value
 * - never throws
 */
export async function saveContent({
  key,
  locale,
  value,
  actor,
}: SaveContentInput): Promise<SaveContentResult> {
  const def = CONTENT_DEF_MAP[key];
  if (!def) {
    return { ok: false, message: `Unknown content key: ${key}` };
  }

  if (locale !== "ko" && locale !== "en") {
    return { ok: false, message: "locale must be ko or en" };
  }

  if (typeof value !== "string") {
    return { ok: false, message: "value must be a string" };
  }

  const trimmedLength = value.trim().length;
  if (trimmedLength > MAX_LENGTH[def.kind]) {
    return {
      ok: false,
      message: `Value exceeds the ${MAX_LENGTH[def.kind]} character limit for ${def.kind} fields`,
    };
  }

  if ((def.kind === "image" || def.kind === "url") && trimmedLength > 0) {
    if (!isValidMediaValue(value)) {
      return {
        ok: false,
        message: `Invalid ${def.kind} value: use a relative "/..." path or an http(s) URL`,
      };
    }
  }

  if (def.kind === "slides" && trimmedLength > 0 && !isValidSlidesPayload(value)) {
    return {
      ok: false,
      message: "Invalid slides payload: expected a non-empty JSON array of { bg, html }",
    };
  }

  const prisma = getPrisma();
  if (!prisma) {
    return { ok: false, message: DB_NOT_CONFIGURED_MESSAGE };
  }

  // `url` fields are shared across locales (a link is the same in ko/en).
  const locales: Array<"ko" | "en"> =
    def.kind === "url" ? ["ko", "en"] : [locale];

  try {
    if (trimmedLength === 0) {
      await prisma.pageContent.deleteMany({
        where: { key, locale: { in: locales } },
      });
    } else {
      for (const target of locales) {
        await prisma.pageContent.upsert({
          where: { key_locale: { key, locale: target } },
          create: { key, locale: target, value, updatedBy: actor ?? null },
          update: { value, updatedBy: actor ?? null },
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Failed to save override: ${message}` };
  }

  await revalidateDef(def);
  return { ok: true };
}
