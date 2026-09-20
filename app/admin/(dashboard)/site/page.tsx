import { requireAdmin } from "@/lib/auth/guard";
import { getSite } from "@/lib/content/read";
import { sitePath } from "@/lib/content/paths";
import { hashOfFile } from "@/lib/content/write";
import { readMediaIndex } from "@/lib/media/index";
import { labels } from "@/lib/form-labels";
import { ui, type UIStrings } from "@/lib/ui-strings";
import SiteStrings from "../../_components/site/SiteStrings";

export const metadata = { title: "Site strings" };

/** Scalar form labels only; arrays and the long consent text are omitted. */
function formLabelRows(): { key: string; ko: string; en: string }[] {
  const skip = new Set(["consentText", "productOptions", "oemOptions"]);
  const koLabels = labels.ko as unknown as Record<string, unknown>;
  const enLabels = labels.en as unknown as Record<string, unknown>;
  return Object.keys(koLabels)
    .filter((key) => !skip.has(key) && typeof koLabels[key] === "string")
    .map((key) => ({
      key,
      ko: String(koLabels[key]),
      en: typeof enLabels[key] === "string" ? String(enLabels[key]) : "",
    }));
}

export default async function SiteStringsPage() {
  // The dashboard layout guards this route group; keep the page independently authoritative.
  await requireAdmin();

  const ko = getSite("ko");
  const en = getSite("en");
  const media = readMediaIndex();
  const uiStrings: { ko: UIStrings; en: UIStrings } = { ko: ui("ko"), en: ui("en") };

  return (
    <SiteStrings
      ko={ko}
      en={en}
      koHash={hashOfFile(sitePath("ko"))}
      enHash={hashOfFile(sitePath("en"))}
      mediaOptions={Object.values(media).map((entry) => entry.url)}
      uiStrings={uiStrings}
      formLabels={formLabelRows()}
    />
  );
}
