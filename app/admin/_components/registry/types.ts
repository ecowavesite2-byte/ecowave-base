/**
 * Local, client-safe mirrors of the registry API payload.
 *
 * The client island must NOT import `lib/content/registry.ts` (it holds ~700
 * defs and their defaults); these types describe only what `/api/admin/registry`
 * returns.
 */

export type RegistryLocale = "ko" | "en";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface RegistryDef {
  key: string;
  group: string;
  pageKey: string;
  sectionId: string;
  widgetId: string;
  field: string;
  kind: string;
  section: { ko: string; en: string };
  label: { ko: string; en: string };
  revalidate: string[];
}

export interface RegistryResponse {
  groups: string[];
  defs: RegistryDef[];
  values: Record<string, string>;
  dbConfigured: boolean;
}
