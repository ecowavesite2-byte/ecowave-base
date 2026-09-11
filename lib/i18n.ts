export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";

export function isLocale(v: string): v is Locale {
  return (locales as readonly string[]).includes(v);
}

/** href for a route in the given locale (ko is prefix-free, en is /en-prefixed) */
export function localeHref(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return locale === defaultLocale ? clean : "/en" + (clean === "/" ? "" : clean);
}
