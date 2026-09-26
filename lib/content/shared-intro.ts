import type { Section } from "@/lib/types";

/**
 * Shared intro band — the company channel's white 48px heading rendered over
 * `/images/thumbnail/20250811/269ab684758f0.jpg`.
 *
 * Mirrors the footer precedent in `lib/page-hero.ts`: every page's shell authors
 * its own copy of a shared band, but only ONE copy is live. The footer is shared
 * by `components/layout/SiteFooter.tsx` rendering the HOME page's copy on every
 * route; here the renderer (`components/content/ContentPage.tsx`) swaps the
 * canonical `company.ceo` band's rows into the other `/company*` pages, so only
 * `company.ceo`'s copy is editable and the other copies are dead in the registry
 * generator. (`/company` itself aliases `company.ceo` — see `PAGE_ALIASES` in
 * `lib/content/paths.ts` — so it already serves the canonical copy.)
 *
 * The band has no dedicated class or id across pages (each page carries its own
 * section id), so it is matched by its UNIQUE background image — the one
 * distinguishing property every copy shares. `bg` may live on `sec.bg` or only
 * inside `sec.bgStyle`, so `bgOf` checks both (the two shapes occur in the
 * crawled content).
 */
export interface SharedIntro {
  /** Page whose band is the single editable source. */
  canonicalPageKey: string;
  /** Channel prefix (`pageKey` before the first `/` or `.`); all pages match. */
  channel: string;
  /** Unique background image identifying the band on every page. */
  bg: string;
}

export const SHARED_INTROS: SharedIntro[] = [
  {
    canonicalPageKey: "company.ceo",
    channel: "company",
    bg: "/images/thumbnail/20250811/269ab684758f0.jpg",
  },
];

/** Channel prefix of a pageKey, normalizing both dot (`company.ceo`) and slash (`company/ceo`) forms. */
export function channelOf(pageKey: string): string {
  return pageKey.replace(/\./g, "/").split("/")[0];
}

/** The shared-intro config whose channel owns `pageKey`, or null. */
export function sharedIntroFor(pageKey: string): SharedIntro | null {
  return SHARED_INTROS.find((c) => c.channel === channelOf(pageKey)) ?? null;
}

/** Background image of a section: `bg` first, then the url(...) inside `bgStyle`. */
function bgOf(sec: Section): string | null {
  if (sec.bg) return sec.bg;
  return /url\(["']?([^"')]+)["']?\)/.exec(sec.bgStyle || "")?.[1] ?? null;
}

/** true when this section is the shared intro band for `cfg` (matched by its unique bg). */
export function isSharedIntroSection(sec: Section, cfg: SharedIntro): boolean {
  return bgOf(sec) === cfg.bg;
}
