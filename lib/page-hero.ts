import { getSite } from "@/lib/content";
import { localeHref, type Locale } from "@/lib/i18n";
import { routeForSource } from "@/lib/routes";
import type { Section } from "@/lib/types";
import type { HeroTab } from "@/components/ui/PageHero";

/**
 * Derives the page-hero title + sibling tabs for a route from the nav tree
 * (mirrors the imweb menu_title + sub_menu widgets).
 */
export function heroFor(
  route: string,
  locale: Locale,
): { title: string; tabs: HeroTab[]; big?: boolean } {
  const site = getSite(locale);
  for (const item of site.nav) {
    const groupRoute = routeForSource(item.url);
    const childRoutes = item.children.map((c) => ({
      name: c.name,
      route: routeForSource(c.url),
    }));
    if (groupRoute === route) {
      // the imweb landing route shows the section's first child as the page
      // title (e.g. /company -> ceo인사말, /rnd -> 보유기술), not the nav group
      return {
        title: childRoutes[0]?.name || item.name,
        tabs: [
          { label: item.name, href: localeHref(locale, groupRoute), active: true },
          ...childRoutes.map((c) => ({
            label: c.name,
            href: localeHref(locale, c.route),
          })),
        ],
      };
    }
    const child = childRoutes.find((c) => c.route === route);
    if (child) {
      return {
        title: child.name,
        tabs: [
          { label: item.name, href: localeHref(locale, groupRoute) },
          ...childRoutes.map((c) => ({
            label: c.name,
            href: localeHref(locale, c.route),
            active: c.route === route,
          })),
        ],
      };
    }
  }
  return { title: "", tabs: [] };
}

/** true when the section is the black footer band (contains the copyright line) */
export function isFooterSection(sec: Section): boolean {
  let found = false;
  (function ws(rows: Section["rows"]) {
    rows.forEach((r) => {
      if (r.kind === "widget" && r.type === "text" && /Copyright/i.test(r.html || "")) found = true;
      if (r.kind === "row") r.cols.forEach((c) => ws(c.children));
    });
  })(sec.rows);
  return found;
}

/** true when the section embeds a board widget (its page renders the board UI there) */
export function isBoardSection(sec: Section): boolean {
  let found = false;
  (function ws(rows: Section["rows"]) {
    rows.forEach((r) => {
      if (r.kind === "widget" && r.type === "board") found = true;
      if (r.kind === "row") r.cols.forEach((c) => ws(c.children));
    });
  })(sec.rows);
  return found;
}

export const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";
