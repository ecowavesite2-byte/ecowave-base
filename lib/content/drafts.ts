import fs from "node:fs";
import type { BoardContent, PageContent } from "../types";
import type { Locale } from "../i18n";
import {
  boardPath,
  isValidBoardSlug,
  isValidLocale,
  isValidPageKey,
  pagePath,
  sitePath,
} from "./paths";
import { getBoard, getPage } from "./read";
import { BoardContentSchema, PageContentSchema, SiteDataSchema } from "./schemas";
import { sanitizeBoardContent, sanitizePageContent } from "./sanitize";
import { hashOfFile, saveJsonFile, withLock } from "./write";
import { revalidateFor, type ContentKind } from "./revalidate";

/**
 * Draft overlay for the file-backed content store.
 *
 * A draft is a sibling file of the canonical JSON (`<name>.draft.json`),
 * gitignored and never served publicly: the public read path only switches to
 * a draft when `draftMode()` is enabled for the session. Publishing promotes
 * the draft atomically onto the canonical file (snapshot + revalidate).
 *
 * Server-only (fs + next/headers). Client code must not import this module.
 */

export type DraftKind = ContentKind;

export interface DraftTarget {
  locale: Locale;
  kind: DraftKind;
  key: string;
  /** Canonical published file. */
  published: string;
  /** Sibling `.draft.json` overlay. */
  draft: string;
}

/** Insert `.draft` before the `.json` extension. */
function siblingDraft(file: string): string {
  return file.endsWith(".json") ? `${file.slice(0, -".json".length)}.draft.json` : `${file}.draft.json`;
}

/**
 * Resolve + validate a draft target from raw request values. Returns `null`
 * for an unknown locale/kind/key (callers map that to a 400).
 */
export function resolveDraftTarget(
  locale: string,
  kind: string,
  key: string,
): DraftTarget | null {
  if (!isValidLocale(locale)) return null;
  if (kind !== "page" && kind !== "board" && kind !== "site") return null;

  if (kind === "site") {
    const published = sitePath(locale);
    return { locale, kind, key: "", published, draft: siblingDraft(published) };
  }

  if (!key) return null;

  if (kind === "page") {
    if (!isValidPageKey(key)) return null;
    const published = pagePath(locale, key);
    return { locale, kind, key, published, draft: siblingDraft(published) };
  }

  if (!isValidBoardSlug(key)) return null;
  const published = boardPath(locale, key);
  return { locale, kind, key, published, draft: siblingDraft(published) };
}

/** `content/ko/pages/company.ceo.draft.json` / `content/en/boards/news.draft.json`. */
export function draftPath(locale: Locale, kind: DraftKind, key: string): string {
  const target = resolveDraftTarget(locale, kind, key);
  if (!target) throw new Error(`Invalid draft target: ${kind}/${key}`);
  return target.draft;
}

export class DraftValidationError extends Error {
  readonly issues: unknown[];

  constructor(issues: unknown[]) {
    super("Draft content failed validation");
    this.name = "DraftValidationError";
    this.issues = issues;
  }
}

function schemaFor(kind: DraftKind) {
  return kind === "page" ? PageContentSchema : kind === "board" ? BoardContentSchema : SiteDataSchema;
}

function sanitizeContent(kind: DraftKind, value: unknown): unknown {
  if (kind === "page") return sanitizePageContent(value as PageContent);
  if (kind === "board") return sanitizeBoardContent(value as BoardContent);
  return value;
}

/** Validate against the same per-kind schema the content API uses. */
export function parseDraftContent(
  kind: DraftKind,
  content: unknown,
): { ok: true; value: unknown } | { ok: false; issues: unknown[] } {
  const result = schemaFor(kind).safeParse(content);
  if (!result.success) return { ok: false, issues: result.error.issues };
  return { ok: true, value: result.data };
}

export function readDraft(
  locale: Locale,
  kind: DraftKind,
  key: string,
): { content: unknown; hash: string } | null {
  const target = resolveDraftTarget(locale, kind, key);
  if (!target || !fs.existsSync(target.draft)) return null;
  return {
    content: JSON.parse(fs.readFileSync(target.draft, "utf8")) as unknown,
    hash: hashOfFile(target.draft),
  };
}

/**
 * Validate + sanitize + write a draft, atomically and under the write lock.
 * `expectedHash` is compared against the current draft file, or against the
 * published file when no draft exists yet (first draft save). Returns the new
 * draft hash.
 */
export async function writeDraft(
  locale: Locale,
  kind: DraftKind,
  key: string,
  content: unknown,
  expectedHash: string,
): Promise<string> {
  const target = resolveDraftTarget(locale, kind, key);
  if (!target) throw new Error(`Invalid draft target: ${kind}/${key}`);

  const parsed = parseDraftContent(kind, content);
  if (!parsed.ok) throw new DraftValidationError(parsed.issues);

  const sanitized = sanitizeContent(kind, parsed.value);
  const versionFile = fs.existsSync(target.draft) ? target.draft : target.published;
  return saveJsonFile({
    file: target.draft,
    content: sanitized,
    expectedHash,
    versionFile,
  });
}

/**
 * Atomically promote the draft onto the canonical file (snapshot + revalidate),
 * then remove the draft. Returns `null` when there is no draft to publish.
 */
export async function promoteDraft(
  locale: Locale,
  kind: DraftKind,
  key: string,
): Promise<{ hash: string } | null> {
  const target = resolveDraftTarget(locale, kind, key);
  if (!target) throw new Error(`Invalid draft target: ${kind}/${key}`);
  if (!fs.existsSync(target.draft)) return null;

  const raw = JSON.parse(fs.readFileSync(target.draft, "utf8")) as unknown;
  const parsed = parseDraftContent(kind, raw);
  if (!parsed.ok) throw new DraftValidationError(parsed.issues);

  const hash = await saveJsonFile({
    file: target.published,
    content: sanitizeContent(kind, parsed.value),
  });
  await discardDraft(locale, kind, key);
  await revalidateFor(kind, locale, key);
  return { hash };
}

/** Delete the draft file. Returns `false` when there was nothing to discard. */
export async function discardDraft(
  locale: Locale,
  kind: DraftKind,
  key: string,
): Promise<boolean> {
  const target = resolveDraftTarget(locale, kind, key);
  if (!target) throw new Error(`Invalid draft target: ${kind}/${key}`);
  return withLock(() => {
    if (!fs.existsSync(target.draft)) return false;
    fs.unlinkSync(target.draft);
    return true;
  });
}

async function draftEnabled(): Promise<boolean> {
  const { draftMode } = await import("next/headers");
  return (await draftMode()).isEnabled;
}

/** Draft-aware page getter for render paths; published content otherwise. */
export async function getPageForRender(locale: Locale, key: string): Promise<PageContent> {
  if (await draftEnabled()) {
    const draft = readDraft(locale, "page", key);
    if (draft) return draft.content as PageContent;
  }
  return getPage(locale, key);
}

/** Draft-aware board getter for render paths; published content otherwise. */
export async function getBoardForRender(locale: Locale, slug: string): Promise<BoardContent> {
  if (await draftEnabled()) {
    const draft = readDraft(locale, "board", slug);
    if (draft) return draft.content as BoardContent;
  }
  return getBoard(locale, slug);
}
