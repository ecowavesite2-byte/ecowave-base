import { CONTENT_GROUPS, type ContentGroup } from "@/lib/content/registry";
import RegistryEditor from "../../_components/registry/RegistryEditor";

export const metadata = { title: "Content" };

/**
 * Simple override editor entry point. The (dashboard) layout already enforces
 * `requireAdmin()`. Optional `?group=` selects the initial tab (defaults home).
 */
export default async function ContentRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const params = await searchParams;
  const requested = params.group;
  const initialGroup: ContentGroup =
    requested && (CONTENT_GROUPS as readonly string[]).includes(requested)
      ? (requested as ContentGroup)
      : "home";

  return <RegistryEditor initialGroup={initialGroup} />;
}
