import path from "node:path";

/**
 * Dependency-free content path helpers (node:path only).
 *
 * All content lookups funnel through these builders so the admin write lane can
 * validate a key before it ever touches the filesystem.
 */

export const CONTENT_ROOT =
  process.env.CONTENT_ROOT ?? path.join(process.cwd(), "content");

export const LOCALES = ["ko", "en"] as const;
export type ContentLocale = (typeof LOCALES)[number];

/**
 * Page keys that back a real route. Note: product page JSONs were deleted —
 * product listings are served from the boards (see BOARD_SLUGS).
 */
export const PAGE_KEYS = [
  "home",
  "company",
  "company.ceo",
  "company.about",
  "company.philosophy",
  "company.history",
  "company.organization",
  "company.global",
  "rnd",
  "rnd.technology",
  "rnd.patents",
  "rnd.facilities",
  "news",
  "notices",
  "support",
] as const;

export const BOARD_SLUGS = [
  "news",
  "notices",
  "products.eco-wave",
  "products.clean-b",
  "products.flowell",
] as const;

const RESERVED_DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const DRIVE_LETTER = /^[a-zA-Z]:/;

/**
 * Reject keys that could escape the content root or confuse the filesystem
 * (NTFS), then (optionally) assert the resolved file stays under CONTENT_ROOT.
 *
 * Returns the key when safe; throws otherwise.
 */
export function assertSafeKey(key: string, file?: string): string {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(`Unsafe content key: ${JSON.stringify(key)}`);
  }
  if (key.includes("..")) {
    throw new Error(`Unsafe content key (parent traversal): ${key}`);
  }
  if (key.includes("\\")) {
    throw new Error(`Unsafe content key (backslash/UNC): ${key}`);
  }
  if (key.includes(":")) {
    throw new Error(`Unsafe content key (colon/ADS/drive): ${key}`);
  }
  if (key.startsWith("/")) {
    throw new Error(`Unsafe content key (absolute): ${key}`);
  }
  if (DRIVE_LETTER.test(key)) {
    throw new Error(`Unsafe content key (drive letter): ${key}`);
  }

  for (const segment of key.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error(`Unsafe content key segment: ${JSON.stringify(segment)}`);
    }
    if (/[. ]$/.test(segment)) {
      throw new Error(`Unsafe content key (trailing dot/space): ${key}`);
    }
    const stem = segment.split(".")[0];
    if (RESERVED_DEVICE_NAMES.test(stem)) {
      throw new Error(`Unsafe content key (reserved device name): ${key}`);
    }
  }

  if (file !== undefined) {
    const root = path.resolve(CONTENT_ROOT);
    const resolved = path.resolve(file);
    if (!(resolved === root || resolved.startsWith(root + path.sep))) {
      throw new Error(`Content path escapes CONTENT_ROOT: ${file}`);
    }
  }

  return key;
}

export function isValidLocale(value: string): value is ContentLocale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isValidPageKey(value: string): boolean {
  return (PAGE_KEYS as readonly string[]).includes(value);
}

export function isValidBoardSlug(value: string): boolean {
  return (BOARD_SLUGS as readonly string[]).includes(value);
}

function localeDir(locale: string): string {
  if (!isValidLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  return path.join(CONTENT_ROOT, locale);
}

function jsonName(key: string): string {
  return key.replace(/\//g, ".") + ".json";
}

export function pagePath(locale: string, key: string): string {
  const file = path.join(localeDir(locale), "pages", jsonName(key));
  assertSafeKey(key, file);
  return file;
}

export function boardPath(locale: string, slug: string): string {
  const file = path.join(localeDir(locale), "boards", jsonName(slug));
  assertSafeKey(slug, file);
  return file;
}

export function sitePath(locale: string): string {
  return path.join(localeDir(locale), "site.json");
}

export function facilitiesTabsPath(locale: string): string {
  return path.join(localeDir(locale), "facilities-tabs.json");
}
