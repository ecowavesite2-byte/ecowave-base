/**
 * Route map: imweb numeric source URLs <-> semantic Next.js routes.
 * Board slugs (content file names) map 1:1 to route keys.
 *
 * `SOURCE_TO_ROUTE` is the KO/default map. A few numeric source URLs differ
 * per locale (the EN crawl swaps the product children); those live in
 * `LOCALE_SOURCE_OVERRIDES` and are applied by `routeForSource` when a locale
 * is supplied.
 */
import type { Locale } from "@/lib/i18n";

export const SOURCE_TO_ROUTE: Record<string, string> = {
  "/15": "/company",
  "/16": "/company/ceo",
  "/17": "/company/about",
  "/18": "/company/philosophy",
  "/19": "/company/history",
  "/31": "/company/organization",
  "/20": "/company/global",
  "/21": "/rnd",
  "/22": "/rnd/technology",
  "/23": "/rnd/patents",
  "/24": "/rnd/facilities",
  "/32": "/products",
  "/37": "/products/eco-wave",
  "/38": "/products/clean-b",
  "/36": "/products/flowell",
  "/26": "/news",
  "/29": "/news",
  "/28": "/support",
  "/27": "/notices",
  "/": "/",
};

/** Locale-specific source→route overrides (delta from the KO/default map). */
const LOCALE_SOURCE_OVERRIDES: Partial<Record<Locale, Record<string, string>>> = {
  en: {
    "/36": "/products/eco-wave",
    "/37": "/products/clean-b",
    "/38": "/products/flowell",
  },
};

export function routeForSource(url: string | undefined | null, locale?: Locale): string {
  if (!url) return "/";
  const clean = url.startsWith("/") ? url : "/" + url;
  const overrides = locale ? LOCALE_SOURCE_OVERRIDES[locale] : undefined;
  return overrides?.[clean] ?? SOURCE_TO_ROUTE[clean] ?? clean;
}

/**
 * Content file key → semantic route (admin revalidation mapping).
 * `page` keys use dots (`company.ceo`); board slugs use dots too
 * (`products.eco-wave`) and map to the same slash route.
 */
export const PAGE_KEY_TO_ROUTE: Record<string, string> = {
  home: "/",
  company: "/company",
  "company.ceo": "/company/ceo",
  "company.about": "/company/about",
  "company.philosophy": "/company/philosophy",
  "company.history": "/company/history",
  "company.organization": "/company/organization",
  "company.global": "/company/global",
  rnd: "/rnd",
  "rnd.technology": "/rnd/technology",
  "rnd.patents": "/rnd/patents",
  "rnd.facilities": "/rnd/facilities",
  news: "/news",
  notices: "/notices",
  support: "/support",
};

export function routeForKey(key: string): string {
  return PAGE_KEY_TO_ROUTE[key] ?? "/" + key.replace(/\./g, "/");
}

export function routeForBoard(slug: string): string {
  return "/" + slug.replace(/\./g, "/");
}
