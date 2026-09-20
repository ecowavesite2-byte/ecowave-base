import ContentPage from "@/components/content/ContentPage";

/**
 * Customer support landing: the original /28 page body holds only a spacer
 * section (no board) — render the crawled sections generically to match.
 */
export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  return <ContentPage params={params} pageKey="support" />;
}
