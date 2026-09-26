/**
 * Type declarations for the plain-JS registry generator.
 *
 * The tokenizer/structured parsers are imported by mirror-drift parity tests;
 * the script itself is `.mjs` and is not type-checked.
 */
import type { ColNode, RowNode, Section, WidgetNode } from "../lib/types";

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
  location: { badge: string; city: string; address: string; mapSrc: string };
};
