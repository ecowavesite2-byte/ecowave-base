import { cookies } from "next/headers";

import {
  ADMIN_LOCALE_COOKIE,
  defaultAdminLocale,
  isAdminLocale,
  type AdminLocale,
} from "@/lib/admin/i18n";

/**
 * Server-only: resolve the admin UI locale from its cookie.
 *
 * Admin routes are not locale-prefixed, so the locale lives in a plain cookie
 * set by `AdminLocaleToggle`. Falls back to the site default (Korean) when the
 * cookie is missing or invalid.
 */
export async function getAdminLocale(): Promise<AdminLocale> {
  const value = (await cookies()).get(ADMIN_LOCALE_COOKIE)?.value;
  return isAdminLocale(value) ? value : defaultAdminLocale;
}
