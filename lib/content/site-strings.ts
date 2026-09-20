import type { NavItem, SiteData } from "../types";

/**
 * Pure helpers over `content/{ko,en}/site.json`.
 *
 * No fs imports here, so the same immutable setters can be reused by the admin
 * client island; the server reads via `getSite()` from `read.ts`.
 */

export interface NavPath {
  index: number;
  /** present for a child item under `nav[index]` */
  childIndex?: number;
}

export type LogoEntry = SiteData["logos"][number];

export function siteNav(site: SiteData): NavItem[] {
  return site.nav;
}

export function siteLogos(site: SiteData): LogoEntry[] {
  return site.logos;
}

/**
 * Fields the admin intentionally hides: `footer` is unused at runtime (the real
 * footer renders from `home.json`), and the body font/colour are crawl values.
 */
export function unusedSiteFields(site: SiteData) {
  return {
    footer: site.footer,
    bodyFont: site.bodyFont,
    bodyColor: site.bodyColor,
    bodyBg: site.bodyBg,
  };
}

function assertIndex(index: number, length: number, what: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(`${what} index out of range: ${index}`);
  }
}

export function hasNavPath(site: SiteData, path: NavPath): boolean {
  if (!Number.isInteger(path.index) || path.index < 0 || path.index >= site.nav.length) {
    return false;
  }
  if (path.childIndex === undefined) return true;
  const children = site.nav[path.index]?.children ?? [];
  return (
    Number.isInteger(path.childIndex) && path.childIndex >= 0 && path.childIndex < children.length
  );
}

/** Rename a top-level or child nav label. The `url` is never touched. */
export function setNavLabel(site: SiteData, path: NavPath, label: string): SiteData {
  assertIndex(path.index, site.nav.length, "Nav");
  const next = structuredClone(site);
  const item = next.nav[path.index];

  if (path.childIndex === undefined) {
    item.name = String(label);
    return next;
  }

  assertIndex(path.childIndex, item.children.length, "Nav child");
  item.children[path.childIndex].name = String(label);
  return next;
}

export function hasLogoIndex(site: SiteData, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < site.logos.length;
}

/** Set a logo `src` by index. */
export function setLogo(site: SiteData, index: number, src: string): SiteData {
  assertIndex(index, site.logos.length, "Logo");
  const next = structuredClone(site);
  next.logos[index].src = String(src);
  return next;
}
