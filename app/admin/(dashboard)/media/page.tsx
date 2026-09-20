import { readMediaIndex, scanUsageForUrls, type MediaEntryView } from "@/lib/media/index";
import MediaLibrary from "../../_components/media/MediaLibrary";

export const metadata = { title: "Media" };

export default function MediaPage() {
  const index = readMediaIndex();
  const paths = Object.keys(index);
  const usage = scanUsageForUrls(paths.map((p) => index[p].url));

  const entries: MediaEntryView[] = paths
    .map((path) => ({ path, ...index[path], usage: usage[index[path].url] ?? [] }))
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

  return <MediaLibrary initialEntries={entries} />;
}
