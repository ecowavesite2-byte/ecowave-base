"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { PageContent, WidgetNode } from "@/lib/types";
import { routeForKey } from "@/lib/routes";
import type { Locale } from "@/lib/i18n";
import {
  findWidget,
  walkWidgets,
  type Coverage,
  type Selection,
} from "../../_lib/tree";
import StructureTree from "./StructureTree";
import Inspector from "./Inspector";
import LocaleTabs from "./LocaleTabs";
import PreviewPane from "./PreviewPane";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type BannerTone = "info" | "warn" | "error";

interface Banner {
  tone: BannerTone;
  text: string;
  issues?: string[];
}

const BANNER_CLASS: Record<BannerTone, string> = {
  info: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
};

/**
 * Pure client-side mutators (structuredClone + locate/replace). We deliberately
 * do NOT import `lib/content/mutate.ts` here: it pulls `sanitize-html` into the
 * client bundle, and sanitizing on every keystroke would also fight the
 * textarea. The server's PUT handler re-sanitizes the whole page on save.
 */
function patchWidget(
  page: PageContent,
  sectionId: string,
  widgetId: string,
  patch: Partial<WidgetNode>,
): PageContent {
  const next = structuredClone(page);
  const widget = findWidget(next, sectionId, widgetId);
  if (widget) Object.assign(widget, patch);
  return next;
}

function patchGalleryItem(
  page: PageContent,
  sectionId: string,
  widgetId: string,
  index: number,
  patch: { title?: string; desc?: string },
): PageContent {
  const next = structuredClone(page);
  const widget = findWidget(next, sectionId, widgetId);
  const item = widget?.items?.[index];
  if (item) Object.assign(item, patch);
  return next;
}

function issueMessages(issues: unknown): string[] {
  if (!Array.isArray(issues)) return [];
  return issues.map((issue) => {
    if (issue && typeof issue === "object" && "message" in issue) {
      return String((issue as { message: unknown }).message);
    }
    return String(issue);
  });
}

export default function PageEditor({
  page,
  hash: initialHash,
  pageKey,
  locale: initialLocale,
  hasEnglish,
  ko,
  en: enCoverage,
}: {
  page: PageContent;
  hash: string;
  pageKey: string;
  locale: Locale;
  hasEnglish: boolean;
  ko: Coverage;
  en: Coverage | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [content, setContent] = useState<PageContent>(page);
  const [hash, setHash] = useState(initialHash);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [undoStack, setUndoStack] = useState<PageContent[]>([]);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [banner, setBanner] = useState<Banner | null>(null);

  const widget = selected ? findWidget(content, selected.sectionId, selected.widgetId) : null;

  const imageOptions = useMemo(() => {
    const srcs = new Set<string>();
    for (const entry of walkWidgets(content)) {
      if (entry.widget.type === "image" && entry.widget.src) srcs.add(entry.widget.src);
    }
    return [...srcs];
  }, [content]);

  useEffect(() => {
    if (banner?.tone !== "info") return;
    const timer = setTimeout(() => setBanner(null), 2500);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function apply(mutator: (current: PageContent) => PageContent) {
    const next = mutator(content);
    setUndoStack((stack) => [...stack.slice(-19), content]);
    setContent(next);
    setDirty(true);
    setStatus("idle");
    setBanner(null);
  }

  function undo() {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setUndoStack(undoStack.slice(0, -1));
    setContent(previous);
    setDirty(true);
    setStatus("idle");
    setBanner(null);
  }

  function changeLocale(next: Locale) {
    if (next === locale) return;
    if (dirty && !window.confirm("Discard unsaved changes and switch locale?")) return;
    setLocale(next);
    router.replace(`${pathname}?locale=${next}`);
  }

  async function save() {
    setStatus("saving");
    setBanner(null);
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "page", locale, key: pageKey, content, hash }),
      });

      if (response.ok) {
        const data = (await response.json()) as { hash: string };
        setHash(data.hash);
        setDirty(false);
        setStatus("saved");
        setBanner({ tone: "info", text: "Saved" });
        return;
      }

      if (response.status === 409) {
        setStatus("error");
        setBanner({
          tone: "warn",
          text: "Someone changed this page — reload to get the latest version.",
        });
        return;
      }

      if (response.status === 400) {
        const data = (await response.json().catch(() => ({}))) as { issues?: unknown };
        setStatus("error");
        setBanner({
          tone: "error",
          text: "Validation failed.",
          issues: issueMessages(data.issues),
        });
        return;
      }

      setStatus("error");
      setBanner({ tone: "error", text: `Save failed (HTTP ${response.status}).` });
    } catch {
      setStatus("error");
      setBanner({ tone: "error", text: "Network error while saving. Retry when back online." });
    }
  }

  async function revert() {
    if (dirty && !window.confirm("Discard all unsaved changes and reload the saved page?")) return;
    setStatus("saving");
    setBanner(null);
    try {
      const response = await fetch(
        `/api/admin/content?kind=page&locale=${locale}&key=${encodeURIComponent(pageKey)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { content: PageContent; hash: string };
      setContent(data.content);
      setHash(data.hash);
      setSelected(null);
      setUndoStack([]);
      setDirty(false);
      setStatus("idle");
      setBanner({ tone: "info", text: "Reverted to the last saved version." });
    } catch {
      setStatus("error");
      setBanner({ tone: "error", text: "Could not reload the page." });
    }
  }

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "error"
        ? "Save failed"
        : status === "saved"
          ? "Saved"
          : dirty
            ? "Unsaved changes"
            : "Up to date";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-[16px] font-semibold text-ink">
            {content.title || pageKey}
          </h1>
          <p className="font-mono text-[11px] text-[#6b7280]">
            {pageKey} · {content.sections.length} sections
          </p>
        </div>

        <LocaleTabs
          locale={locale}
          hasEnglish={hasEnglish}
          ko={ko}
          en={enCoverage}
          onLocaleChange={changeLocale}
        />

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`text-[12px] ${status === "error" ? "text-red-600" : "text-[#6b7280]"}`}
          >
            {statusText}
          </span>
          <button
            type="button"
            onClick={undo}
            disabled={undoStack.length === 0}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={revert}
            disabled={status === "saving"}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || status === "saving"}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2f5ac7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      {banner ? (
        <div className={`border-b px-5 py-2 text-[12px] ${BANNER_CLASS[banner.tone]}`} role="status">
          <span>{banner.text}</span>
          {banner.issues && banner.issues.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {banner.issues.slice(0, 6).map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-line bg-white">
          <StructureTree page={content} selected={selected} onSelect={setSelected} />
        </aside>

        <section className="min-w-[420px] flex-1 overflow-y-auto bg-[#f4f5f7] p-5">
          <Inspector
            widget={widget}
            imageOptions={imageOptions}
            onPatch={(patch) => {
              if (!selected) return;
              apply((current) =>
                patchWidget(current, selected.sectionId, selected.widgetId, patch),
              );
            }}
            onGalleryItem={(index, patch) => {
              if (!selected) return;
              apply((current) =>
                patchGalleryItem(current, selected.sectionId, selected.widgetId, index, patch),
              );
            }}
          />
        </section>

        <aside className="hidden w-[560px] shrink-0 border-l border-line bg-white xl:block">
          <PreviewPane route={routeForKey(pageKey)} locale={locale} />
        </aside>
      </div>
    </div>
  );
}
