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
  "/26": "/newsroom",
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
