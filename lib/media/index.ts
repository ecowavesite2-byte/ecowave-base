import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "../content/paths";
import { withLock, writeJsonFileAtomic } from "../content/write";

/**
 * `content/media-index.json` — admin-owned metadata for uploaded media.
 *
 * Shape: `{ "<relative media path>": MediaEntry }`. Deliberately separate from
 * the crawl-owned `content/assets-manifest.json`, which is never touched.
 * Read-modify-write goes through `withLock` + the atomic JSON writer.
 */

export interface MediaEntry {
  url: string;
  alt: string;
  width: number;
  height: number;
  size: number;
  format: string;
  /** crop name → relative media path of the sibling file */
  crops: Record<string, string>;
  uploadedAt: string;
}

export type MediaIndex = Record<string, MediaEntry>;

export interface UsageRef {
  /** content-relative file, e.g. `ko/pages/company.ceo.json` */
  file: string;
  /** widget ids / post idx where the reference was found (best effort) */
  widgets: string[];
}

export interface MediaEntryView extends MediaEntry {
  path: string;
  usage: UsageRef[];
}

export const MEDIA_INDEX_FILE = path.join(CONTENT_ROOT, "media-index.json");

export function readMediaIndex(): MediaIndex {
  if (!fs.existsSync(MEDIA_INDEX_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(MEDIA_INDEX_FILE, "utf8")) as MediaIndex;
  } catch {
    return {};
  }
}

/** Serialized read-modify-write of the index. */
export async function updateMediaIndex<T>(mutator: (index: MediaIndex) => T): Promise<T> {
  return withLock(async () => {
    const index = readMediaIndex();
    const result = mutator(index);
    fs.mkdirSync(path.dirname(MEDIA_INDEX_FILE), { recursive: true });
    await writeJsonFileAtomic(MEDIA_INDEX_FILE, index);
    return result;
  });
}

export function getMediaEntry(relPath: string): MediaEntry | null {
  return readMediaIndex()[relPath] ?? null;
}

export async function setMediaAlt(relPath: string, alt: string): Promise<MediaEntry | null> {
  return updateMediaIndex((index) => {
    const entry = index[relPath];
    if (!entry) return null;
    entry.alt = alt;
    return entry;
  });
}

export async function setMediaCrops(
  relPath: string,
  crops: Record<string, string>,
): Promise<MediaEntry | null> {
  return updateMediaIndex((index) => {
    const entry = index[relPath];
    if (!entry) return null;
    entry.crops = { ...entry.crops, ...crops };
    return entry;
  });
}

export async function removeMediaEntry(relPath: string): Promise<boolean> {
  return updateMediaIndex((index) => {
    if (!(relPath in index)) return false;
    delete index[relPath];
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Usage scan                                                                  */
/* -------------------------------------------------------------------------- */

function contentJsonFiles(): string[] {
  const out: string[] = [];
  for (const locale of ["ko", "en"]) {
    for (const sub of ["pages", "boards"]) {
      const dir = path.join(CONTENT_ROOT, locale, sub);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".json") || name.endsWith(".draft.json")) continue;
        out.push(path.join(dir, name));
      }
    }
  }
  return out;
}

/** Find widget ids / post idx that mention `url` inside a parsed content file. */
function widgetRefs(raw: string, url: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : undefined;
    const idx = typeof record.idx === "string" ? record.idx : undefined;
    if ((id || idx) && JSON.stringify(record).includes(url)) {
      found.add(idx ? `post:${idx}` : `widget:${id}`);
    }
    for (const child of Object.values(record)) walk(child);
  };
  walk(parsed);
  return [...found].slice(0, 20);
}

/** Which content files reference each `url` (one pass over content JSON). */
export function scanUsageForUrls(urls: string[]): Record<string, UsageRef[]> {
  const result: Record<string, UsageRef[]> = {};
  for (const url of urls) result[url] = [];
  if (urls.length === 0) return result;

  for (const file of contentJsonFiles()) {
    const raw = fs.readFileSync(file, "utf8");
    const rel = path.relative(CONTENT_ROOT, file).split(path.sep).join("/");
    for (const url of urls) {
      if (raw.includes(url)) {
        result[url].push({ file: rel, widgets: widgetRefs(raw, url) });
      }
    }
  }
  return result;
}

export function scanMediaUsage(url: string): UsageRef[] {
  return scanUsageForUrls([url])[url] ?? [];
}
