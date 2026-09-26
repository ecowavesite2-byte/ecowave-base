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
  PageContent,
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

/**
 * Generator-only media block config (RND galleries). Adds an optional label
 * override for the emitted def and `skipEmpty`, which drops authored gallery
 * slots whose resolved image is empty. Neither key is emitted into a def.
 */
export interface RndMediaBlockConfig extends GalleryBlockConfig {
  label?: { ko: string; en: string };
  skipEmpty?: boolean;
}
/** Structured media blocks on `rnd.*`, keyed by KO section id. */
export const RND_MEDIA_BLOCKS: Record<string, RndMediaBlockConfig>;
/** Structured media blocks on `rnd.*`, keyed by KO gallery widget id. */
export const RND_MEDIA_WIDGET_BLOCKS: Record<string, RndMediaBlockConfig>;

export function sectionWidgets(section: Section): WidgetNode[];
export function parseGalleryWidget(
  widget: WidgetNode | null | undefined,
  cfg: GalleryBlockConfig,
): StructuredMediaItem[];
export function parseAboutCard(html: string | null | undefined): StructuredMediaItem;
/** Block-5 `aboutCards` section id (KO). */
export const ABOUT_CARDS_SECTION: string;

/* ---- structured R&D kinds (WS3) ---- */

export interface TechFeatureRow {
  label: string;
  body: string;
}
export interface TechFeatureItem {
  image: string;
  heading: string;
  rows: TechFeatureRow[];
}
export interface TechFeatureBlockConfig {
  items: { imageWidget: string; textWidget: string }[];
}
/** Fixed block order → KO section id (block 0 → §4, block 1 → §5, block 2 → §6). */
export const TECH_FEATURE_SECTION_IDS: string[];
/** rnd.technology techFeatures config: block→section mapping + per-section widgets. */
export interface TechFeatureBlocksConfig {
  sections: string[];
  bySection: Record<string, TechFeatureBlockConfig>;
}
export const TECH_FEATURE_BLOCKS: TechFeatureBlocksConfig;
/**
 * The ONE v2 `techFeatures` payload for rnd.technology (three fixed blocks),
 * with EN parsed through the positional KO↔EN pairing (`null` block when the
 * section has no EN counterpart).
 */
export function buildTechFeaturePayload(
  koPage: PageContent | null | undefined,
  enPage: PageContent | null | undefined,
): {
  sections: string[];
  koBlocks: { items: TechFeatureItem[] }[];
  enBlocks: ({ items: TechFeatureItem[] } | null)[];
};

export interface PatentSectionItem {
  image: string;
  caption: string;
}
export interface PatentSection {
  title: string;
  items: PatentSectionItem[];
}
export interface PatentSectionsConfig {
  sectionId: string;
  blocks: { headingWidget: string; galleryWidget: string }[];
}
/** rnd.patents §4 heading + gallery2 groups. */
export const PATENT_SECTIONS: PatentSectionsConfig;

export interface FacilitiesTableConfig {
  sectionId: string;
}
/** rnd.facilities §5 table widgets, keyed by KO text widget id. */
export const FACILITIES_TABLES: Record<string, FacilitiesTableConfig>;

/** Cells of every `<tr>` of an authored text-table widget's html. */
export function parseTableRows(html: string | null | undefined): string[][];
/** One table cell's text: runs joined with `\n` (`<br>` → newline). */
export function cellText(html: string | null | undefined): string;
/** A techFeatures text table → `{ heading, rows: [{ label, body }] }`. */
export function parseTechTable(html: string | null | undefined): {
  heading: string;
  rows: TechFeatureRow[];
};
/** One image + text-table pair of a techFeatures block. */
export function parseTechFeatureItem(
  imageWidget: WidgetNode | null | undefined,
  textWidget: WidgetNode | null | undefined,
): TechFeatureItem;
/** Every configured block of a §4/§5/§6 section, in document order. */
export function parseTechFeatureSection(
  cfg: TechFeatureBlockConfig,
  lookup: (widgetId: string) => WidgetNode | null | undefined,
): TechFeatureItem[];
/** One patentSections heading + gallery2 group. */
export function parsePatentSectionBlock(
  headingWidget: WidgetNode | null | undefined,
  galleryWidget: WidgetNode | null | undefined,
): PatentSection;
/** All patentSections groups, in document order. */
export function parsePatentSections(
  cfg: PatentSectionsConfig,
  lookup: (widgetId: string) => WidgetNode | null | undefined,
): { sections: PatentSection[] };
/** A facilitiesTable widget → `{ header, rows }`. */
export function parseFacilitiesTable(
  widget: WidgetNode | null | undefined,
): { header: string[]; rows: string[][] };
