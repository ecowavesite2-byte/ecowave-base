import BoardPicker from "../../_components/boards/BoardPicker";
import { getAdminLocale } from "../../_components/adminLocale";
import { defaultLocale, isLocale } from "@/lib/i18n";

export const metadata = { title: "Boards" };

/** Board picker. The (dashboard) layout already guards this route group. */
export default async function BoardsPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const requested = (await searchParams).locale ?? defaultLocale;
  const locale = isLocale(requested) ? requested : defaultLocale;
  const adminLocale = await getAdminLocale();

  return <BoardPicker initialLocale={locale} adminLocale={adminLocale} />;
}
