import fs from "node:fs";
import path from "node:path";
import type { BoardContent, PageContent, SiteData } from "./types";
import { defaultLocale, type Locale } from "./i18n";

const CONTENT_DIR = path.join(process.cwd(), "content");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function getSite(locale: Locale): SiteData {
  return readJson<SiteData>(path.join(CONTENT_DIR, locale, "site.json"));
}

/** static page content; EN falls back to KO until EN texts are ported */
export function getPage(locale: Locale, key: string): PageContent {
  const enFile = path.join(
    CONTENT_DIR,
    "en",
    "pages",
    key.replace(/\//g, ".") + ".json",
  );
  if (locale === "en" && fs.existsSync(enFile)) {
    return readJson<PageContent>(enFile);
  }
  return readJson<PageContent>(
    path.join(
      CONTENT_DIR,
      defaultLocale,
      "pages",
      key.replace(/\//g, ".") + ".json",
    ),
  );
}

export function getBoard(locale: Locale, slug: string): BoardContent {
  const enFile = path.join(
    CONTENT_DIR,
    "en",
    "boards",
    slug.replace(/\//g, ".") + ".json",
  );
  if (locale === "en" && fs.existsSync(enFile)) {
    return readJson<BoardContent>(enFile);
  }
  return readJson<BoardContent>(
    path.join(
      CONTENT_DIR,
      defaultLocale,
      "boards",
      slug.replace(/\//g, ".") + ".json",
    ),
  );
}

export function getBoardPost(locale: Locale, slug: string, idx: string) {
  const board = getBoard(locale, slug);
  return board.posts.find((p) => p.idx === idx) ?? null;
}

/** product category board slugs */
export const PRODUCT_BOARDS = [
  "products/eco-wave",
  "products/clean-b",
  "products/flowell",
] as const;
