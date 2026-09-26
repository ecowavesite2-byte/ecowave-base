import type { GalleryBlockConfig, Section } from "@/lib/types";

/**
 * Local, client-safe mirrors of the registry API payload.
 *
 * The client island must NOT import `lib/content/registry.ts` (it holds ~700
 * defs and their defaults); these types describe only what `/api/admin/registry`
 * returns plus the extra read-only preview data the server page hands to the
 * client (code defaults + crawled page trees).
 */

export type RegistryLocale = "ko" | "en";

/** Kinds the registry actually defines. */
export type RegistryKind =
  | "text"
  | "textarea"
  | "lines"
  | "image"
  | "url"
  | "list"
  | "slides"
  | "overlay"
  | "cards"
  | "picks"
  | "embed"
  | "eras"
  | "locations"
  | "gallery"
  | "aboutCards"
  | "facilityTabs"
  | "techFeatures"
  | "patentSections"
  | "facilitiesTable";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface RegistryDef {
  key: string;
  group: string;
  pageKey: string;
  sectionId: string;
  widgetId: string;
  field: string;
  kind: RegistryKind;
  section: { ko: string; en: string };
  label: { ko: string; en: string };
  revalidate: string[];
  /** The def's content is rendered on every page of its channel; shown as a badge. */
  shared?: boolean;
  /** Structured `gallery` block config: editable per-item fields + optional cap. */
  gallery?: GalleryBlockConfig;
}

export interface RegistryResponse {
  groups: string[];
  defs: RegistryDef[];
  values: Record<string, string>;
  dbConfigured: boolean;
}

/** Per-locale string pair (code default or effective value). */
export interface LocalePair {
  ko: string;
  en: string;
}

/** Code defaults (`DEFAULT_VALUES`) for every def in the current group. */
export type DefaultsMap = Record<string, LocalePair>;

/** Current effective values (override > default) for every def, per locale. */
export type ValuesMap = Record<string, LocalePair>;

/** Raw crawled page tree per locale; `null` when the page has no file. */
export interface PageTree {
  ko: Section[] | null;
  en: Section[] | null;
}

/** `pageKey` → crawled page sections (read-only preview source). */
export type TreesMap = Record<string, PageTree>;

/** Compact board post option handed to the `picks` editor (server-loaded). */
export interface BoardPostOption {
  idx: string;
  title: string;
  date: string | null;
  /** Preview fidelity: lets the ticker preview render the real card image/body. */
  thumb?: string | null;
  excerpt?: string;
}

/** Selectable posts for both ticker boards (capped server-side). */
export interface BoardOptions {
  news: BoardPostOption[];
  notices: BoardPostOption[];
}

/** Per content-locale board options (news/notices idx sets differ per locale). */
export type BoardPostsMap = Record<RegistryLocale, BoardOptions>;
