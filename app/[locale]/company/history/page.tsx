import ContentPage from "@/components/content/ContentPage";

export function generateStaticParams() {
  return [{ locale: "ko" }, { locale: "en" }];
}

export default function Page({ params }: { params: Promise<{ locale: string }> }) {
  return ContentPage({ params, pageKey: "company/history" });
}
