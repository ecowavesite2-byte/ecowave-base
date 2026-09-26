/**
 * Type declarations for the plain-JS registry generator.
 *
 * The tokenizer/structured parsers are imported by mirror-drift parity tests;
 * the script itself is `.mjs` and is not type-checked.
 */
import type {
  ColNode,
  GalleryBlockConfig,
  GlobalLocation,
  RowNode,
  Section,
  StructuredMediaItem,
  WidgetNode,
} from "../lib/types";

export function textRuns(html: string | null | undefined): string[];
export function decodeEntities(value: string): string;
export const PAIR_IGNORED_TYPES: Set<string>;
export const PAGE_ALIASES: Record<string, string>;

export interface SharedIntro {
  canonicalPageKey: string;
  channel: string;
  bg: string;
}
export const SHARED_INTROS: SharedIntro[];
export function channelOf(pageKey: string): string;
export function sharedIntroFor(pageKey: string): SharedIntro | null;
export function isSharedIntroSection(sec: unknown, cfg: SharedIntro): boolean;

/* ---- structured kinds (WS2) ---- */

export function parseEraLabel(html: string | null | undefined): {
  range: string;
  tagline: string;
};
export function parseEraYears(html: string | null | undefined): {
  year: string;
  items: string[];
}[];
export function parseEraSection(section: Section): {
  yearsWidget: WidgetNode | null;
  labelWidget: WidgetNode | null;
  imageWidget: WidgetNode | null;
};
export function findBranchRow(section: Section): RowNode | null;
export function parseBranchCol(col: ColNode): {
  nameWidget: WidgetNode | null;
  mapWidget: WidgetNode | null;
  location: GlobalLocation;
};
/**
 * The company.global HQ section preceding the branches anchor: its name/contacts
 * /map widgets and the parsed HQ `GlobalLocation` (item 0 of the `locations`
 * def). `null` when the HQ section cannot be resolved.
 */
export function parseHqSection(
  sections: Section[] | null | undefined,
  branchesSectionId: string,
): {
  nameWidget: WidgetNode | null;
  contactsWidget: WidgetNode | null;
  mapWidget: WidgetNode | null;
  location: GlobalLocation;
} | null;

/* ---- structured media kinds (WS-B) ---- */

/** Widgets of a section in render order (rows → cols → children, then aside). */
/** Per-block `company.about` gallery config (fields + optional maxItems), keyed by KO section id. */
export const ABOUT_MEDIA_BLOCKS: Record<string, GalleryBlockConfig>;
export function sectionWidgets(section: Section): WidgetNode[];
export function parseGalleryWidget(
  widget: WidgetNode | null | undefined,
  cfg: GalleryBlockConfig,
): StructuredMediaItem[];
export function parseAboutCard(html: string | null | undefined): StructuredMediaItem;
/** Block-5 `aboutCards` section id (KO). */
export const ABOUT_CARDS_SECTION: string;
