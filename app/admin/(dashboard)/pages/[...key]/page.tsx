import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { getPage, hasEnglishPage, pageSourceFile } from "@/lib/content/read";
import { hashOfFile } from "@/lib/content/write";
import { isValidPageKey } from "@/lib/content/paths";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { countTranslatableFields } from "../../../_lib/tree";
import PageEditor from "../../../_components/editor/PageEditor";

export const metadata = { title: "Page editor" };

export default async function PageEditorRoute({
  params,
  searchParams,
}: {
  params: Promise<{ key: string[] }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  // The dashboard layout already guards this route group; requireAdmin() here
  // keeps the editor route independently authoritative.
  await requireAdmin();

  const { key: segments } = await params;
  const key = segments.join(".");
  if (!isValidPageKey(key)) notFound();

  const requested = (await searchParams).locale ?? defaultLocale;
  const locale: Locale = isLocale(requested) ? requested : defaultLocale;

  const content = getPage(locale, key);
  const hash = hashOfFile(pageSourceFile(locale, key));
  const hasEnglish = hasEnglishPage(key);
  const ko = countTranslatableFields(getPage("ko", key));
  const en = hasEnglish ? countTranslatableFields(getPage("en", key)) : null;

  return (
    <PageEditor
      key={`${locale}:${key}`}
      page={content}
      hash={hash}
      pageKey={key}
      locale={locale}
      hasEnglish={hasEnglish}
      ko={ko}
      en={en}
    />
  );
}
