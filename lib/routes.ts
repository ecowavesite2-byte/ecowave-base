/**
 * Route map: imweb numeric source URLs <-> semantic Next.js routes.
 * Board slugs (content file names) map 1:1 to route keys.
 */
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

export function routeForSource(url: string | undefined | null): string {
  if (!url) return "/";
  const clean = url.startsWith("/") ? url : "/" + url;
  return SOURCE_TO_ROUTE[clean] ?? clean;
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
