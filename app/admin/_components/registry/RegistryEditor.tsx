"use client";

import { useEffect, useMemo, useState } from "react";

import { applyPageOverrides } from "@/lib/content/merge";
import { MOBILE_SECTION } from "@/components/content/SectionRenderer";
import { adminDict, type AdminLocale } from "@/lib/admin/i18n";
import type { PageContent, Section } from "@/lib/types";
import FieldRow from "./FieldRow";
import GroupTabs from "./GroupTabs";
import SectionPreview from "./SectionPreview";
import type {
  DefaultsMap,
  LocalePair,
  RegistryDef,
  RegistryLocale,
  RegistryResponse,
  SaveStatus,
  TreesMap,
} from "./types";

/**
 * MCell-style content/pages editor for ecowave's registry.
 *
 * Data layer: the EXISTING `/api/admin/registry` route (GET effective values,
 * PUT one field). Code defaults and read-only page trees come from the server
 * page — the client never imports `lib/content/registry.ts`.
 *
 * Layout: accordion sections within page dividers; per-field KO/EN cards with
 * default-as-placeholder; a scaled live preview of the open section that applies
 * the unsaved drafts through the same merge used at render time.
 */

const LOCALES: RegistryLocale[] = ["ko", "en"];
const EMPTY_PAIR: LocalePair = { ko: "", en: "" };

interface AccordionItem {
  key: string;
  pageKey: string;
  sectionId: string;
  /** Descriptive primary label; `""` when the registry carries no name. */
  label: string;
  /** Registry `section` name — the site/board grouping context. */
  siteName: string;
  defs: RegistryDef[];
}

type PreviewState =
  | { kind: "ok"; section: Section }
  | { kind: "board" }
  | { kind: "mobile" }
  | { kind: "chrome" }
  | { kind: "unavailable" };

/**
 * Shared footer section skipped by the public renderer (mirrors
 * `SectionRenderer`'s `FOOTER_SECTION_IDS`). It is not exported from that
 * module, so the stable crawl id is repeated here to keep the preview honest
 * instead of rendering an empty pane.
 */
const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";

/** Registry `section` name for a locale (`""` when the def carries none). */
function sectionName(def: RegistryDef, locale: RegistryLocale): string {
  return (def.section[locale] || def.section.ko || def.section.en || "").trim();
}

/**
 * Descriptive head of a def's label. Registry labels look like
 * "게시판 이름 · 공지사항" / "이미지 경로 · 49a097a7d0ffc.jpg", so the part before
 * the first `·` is the only genuinely descriptive string the registry carries.
 */
function fieldLabelHead(def: RegistryDef, locale: RegistryLocale): string {
  const label = def.label[locale] || def.label.ko || def.label.en || "";
  return (label.split("·")[0] ?? "").trim();
}

/**
 * Primary accordion label for a section: the first field's label head when that
 * is genuinely descriptive, otherwise the section name. Returns `""` when the
 * registry has no name that identifies the section (callers show the honest
 * `content.unnamedSection` text instead of inventing one).
 *
 * The crawled `section` name is usually just the site name, so it is kept as
 * grouping context in the header's meta line rather than used as the title.
 */
function sectionPrimaryLabel(defs: RegistryDef[], locale: RegistryLocale): string {
  const def = defs[0];
  if (!def) return "";
  const name = sectionName(def, locale);
  const head = fieldLabelHead(def, locale);
  if (head && head !== name) return head;
  return name;
}

/** `s20250811004ea868d7376` → `s2025081…d7376` (first 8 chars + `…` + last 5). */
function truncateSectionId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-5)}` : id;
}

export default function RegistryEditor({
  locale,
  initialGroup,
  groups,
  defaults,
  trees,
}: {
  locale: AdminLocale;
  initialGroup: string;
  groups: string[];
  defaults: DefaultsMap;
  trees: TreesMap;
}) {
  const t = adminDict[locale].content;

  const [defs, setDefs] = useState<RegistryDef[]>([]);
  const [values, setValues] = useState<Record<string, LocalePair>>({});
  const [drafts, setDrafts] = useState<Record<string, LocalePair>>({});
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dbConfigured, setDbConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<RegistryLocale>("ko");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    (async () => {
      try {
        const responses = await Promise.all(
          LOCALES.map((lang) =>
            fetch(`/api/admin/registry?group=${encodeURIComponent(initialGroup)}&locale=${lang}`),
          ),
        );
        if (responses.some((response) => !response.ok)) {
          throw new Error("HTTP error");
        }
        const payloads = (await Promise.all(
          responses.map((response) => response.json()),
        )) as RegistryResponse[];
        if (cancelled) return;

        const [ko, en] = payloads;
        const nextValues: Record<string, LocalePair> = {};
        const nextDrafts: Record<string, LocalePair> = {};
        for (const def of ko.defs) {
          const pair: LocalePair = {
            ko: ko.values[def.key] ?? "",
            en: en.values[def.key] ?? "",
          };
          nextValues[def.key] = pair;
          nextDrafts[def.key] = {
            ko: pair.ko === (defaults[def.key]?.ko ?? "") ? "" : pair.ko,
            en: pair.en === (defaults[def.key]?.en ?? "") ? "" : pair.en,
          };
        }

        setDefs(ko.defs);
        setValues(nextValues);
        setDrafts(nextDrafts);
        setDbConfigured(ko.dbConfigured);
        setStatus({});
        setErrors({});
        setOpenSection(null);
      } catch {
        if (cancelled) return;
        setDefs([]);
        setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialGroup, retry, defaults]);

  const items = useMemo<AccordionItem[]>(() => {
    const out: AccordionItem[] = [];
    for (const def of defs) {
      const last = out[out.length - 1];
      if (last && last.pageKey === def.pageKey && last.sectionId === def.sectionId) {
        last.defs.push(def);
      } else {
        out.push({
          key: `${def.pageKey}#${def.sectionId}`,
          pageKey: def.pageKey,
          sectionId: def.sectionId,
          label: sectionPrimaryLabel([def], locale),
          siteName: sectionName(def, locale),
          defs: [def],
        });
      }
    }
    return out;
  }, [defs, locale]);

  const openItem = items.find((item) => item.key === openSection) ?? null;

  /** Default for a locale; an effective value equal to it means "no override". */
  function baseline(key: string, lang: RegistryLocale): string {
    const effective = values[key]?.[lang] ?? "";
    const fallback = defaults[key]?.[lang] ?? "";
    return effective === fallback ? "" : effective;
  }

  function pairFor(key: string): LocalePair {
    return drafts[key] ?? EMPTY_PAIR;
  }

  function setDraft(key: string, lang: RegistryLocale, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? EMPTY_PAIR), [lang]: value },
    }));
    setStatus((prev) => ({ ...prev, [key]: "idle" }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function save(def: RegistryDef) {
    const draft = pairFor(def.key);
    const target: { lang: RegistryLocale; value: string }[] =
      def.kind === "url"
        ? [{ lang: "ko", value: draft.ko }]
        : LOCALES.map((lang) => ({ lang, value: draft[lang] }));

    setStatus((prev) => ({ ...prev, [def.key]: "saving" }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[def.key];
      return next;
    });

    try {
      for (const { lang, value } of target) {
        const response = await fetch("/api/admin/registry", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: def.key, locale: lang, value }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: unknown };
          if (response.status === 503) setDbConfigured(false);
          setStatus((prev) => ({ ...prev, [def.key]: "error" }));
          setErrors((prev) => ({
            ...prev,
            [def.key]:
              typeof data.error === "string" ? data.error : `${t.failed} (HTTP ${response.status})`,
          }));
          return;
        }
      }

      setValues((prev) => ({ ...prev, [def.key]: { ...draft } }));
      setStatus((prev) => ({ ...prev, [def.key]: "saved" }));
    } catch {
      setStatus((prev) => ({ ...prev, [def.key]: "error" }));
      setErrors((prev) => ({ ...prev, [def.key]: t.failed }));
    }
  }

  /** Draft overrides for one page + preview locale (empty draft = default). */
  const draftOverrides = useMemo(() => {
    if (!openItem) return {};
    const overrides: Record<string, string> = {};
    for (const def of defs) {
      if (def.pageKey !== openItem.pageKey) continue;
      const pair = drafts[def.key];
      if (!pair) continue;
      const value = def.kind === "url" ? pair.ko : pair[previewLang];
      if (value.trim()) overrides[def.key] = value;
    }
    return overrides;
  }, [openItem, defs, drafts, previewLang]);

  const preview = useMemo<PreviewState | null>(() => {
    if (!openItem) return null;
    if (openItem.sectionId === "board") return { kind: "board" };
    const tree = trees[openItem.pageKey];
    if (!tree || !tree.ko) return { kind: "unavailable" };

    const koSection = tree.ko.find((section) => section.id === openItem.sectionId);
    if (!koSection) return { kind: "unavailable" };
    // Shared footer chrome is filtered out of the public section stream.
    if (koSection.id === FOOTER_SECTION_ID) return { kind: "chrome" };
    // Desktop-only preview: a mobile_section is hidden at >=992 by design.
    if (MOBILE_SECTION.test(koSection.cls || "")) return { kind: "mobile" };

    try {
      if (previewLang === "ko") {
        const page: PageContent = { key: openItem.pageKey, sourceUrl: "", title: "", sections: [koSection] };
        const resolved = applyPageOverrides(page, draftOverrides, "ko");
        const section = resolved.sections[0];
        return section ? { kind: "ok", section } : { kind: "unavailable" };
      }

      if (!tree.en) return { kind: "unavailable" };
      const index = tree.ko.indexOf(koSection);
      const enSection = tree.en[index];
      if (!enSection) return { kind: "unavailable" };
      const primary: PageContent = { key: openItem.pageKey, sourceUrl: "", title: "", sections: [koSection] };
      const page: PageContent = { key: openItem.pageKey, sourceUrl: "", title: "", sections: [enSection] };
      const resolved = applyPageOverrides(page, draftOverrides, "en", { primaryPage: primary });
      const section = resolved.sections[0];
      return section ? { kind: "ok", section } : { kind: "unavailable" };
    } catch {
      return { kind: "unavailable" };
    }
  }, [openItem, trees, draftOverrides, previewLang]);

  const pageLabels = t.pageLabels as Record<string, string | undefined>;

  return (
    <div className="min-[992px]:flex min-[992px]:items-start min-[992px]:gap-6">
      <div className="min-w-0 min-[992px]:w-[54%] min-[992px]:shrink-0">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{t.title}</h1>
          <p className="mt-0.5 text-[13px] text-muted">{t.blurb}</p>
        </div>

        <div className="mt-4">
          <GroupTabs locale={locale} groups={groups} active={initialGroup} />
        </div>

        {!dbConfigured ? (
          <div
            role="status"
            className="mt-4 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
          >
            {t.dbNotice}
          </div>
        ) : null}

        {loadError ? (
          <div className="mt-4 flex items-center gap-3 rounded-[4px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
            <span>{t.loadError}</span>
            <button
              type="button"
              onClick={() => setRetry((n) => n + 1)}
              className="ml-auto rounded-[3px] border border-red-200 bg-white px-2.5 py-1 text-[12px] text-red-700 transition-colors hover:border-red-400"
            >
              {t.retry}
            </button>
          </div>
        ) : null}

        {loading ? <p className="mt-5 text-[13px] text-muted">{t.loading}</p> : null}

        {!loading && !loadError && items.length === 0 ? (
          <p className="mt-5 text-[13px] text-muted">{t.empty}</p>
        ) : null}

        {!loading && !loadError && items.length > 0 ? (
          <div className="mt-4">
            {items.map((item, index) => {
              const previous = items[index - 1];
              const showDivider = !previous || previous.pageKey !== item.pageKey;
              const open = openSection === item.key;
              const route = item.defs[0]?.revalidate[0] ?? "";
              return (
                <div key={item.key}>
                  {showDivider ? (
                    <div className="flex items-baseline gap-2 border-b border-black/10 px-1 pt-4 pb-2">
                      <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
                        {pageLabels[item.pageKey] ?? item.pageKey}
                      </span>
                      {route ? <span className="font-mono text-[11px] text-muted">{route}</span> : null}
                    </div>
                  ) : null}

                  <div className="mt-2 overflow-hidden rounded-[4px] border border-black/10 bg-white">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenSection(open ? null : item.key)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-soft"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-bold text-ink">
                          {item.label || t.unnamedSection}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                          {[
                            item.siteName && item.siteName !== item.label ? item.siteName : null,
                            truncateSectionId(item.sectionId),
                            t.fieldCount(item.defs.length),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                        className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>

                    {open ? (
                      <div className="space-y-3 border-t border-black/10 p-4">
                        {item.defs.map((def) => (
                          <FieldRow
                            key={def.key}
                            def={def}
                            locale={locale}
                            drafts={pairFor(def.key)}
                            baseline={{
                              ko: baseline(def.key, "ko"),
                              en: baseline(def.key, "en"),
                            }}
                            codeDefaults={defaults[def.key] ?? EMPTY_PAIR}
                            status={status[def.key] ?? "idle"}
                            error={errors[def.key]}
                            disabled={!dbConfigured}
                            t={t}
                            onDraft={(lang, value) => setDraft(def.key, lang, value)}
                            onSave={() => void save(def)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {!loading && !loadError ? <p className="mt-3 text-[12px] text-muted">{t.defaultHint}</p> : null}
      </div>

      {openItem ? (
        <aside className="mt-6 min-w-0 min-[992px]:sticky min-[992px]:top-6 min-[992px]:mt-0 min-[992px]:flex-1">
          <div className="overflow-hidden rounded-[4px] border border-black/10 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-black/10 px-3 py-2">
              <span className="text-[12px] font-bold text-ink">{t.previewTitle}</span>
              <div
                role="group"
                aria-label={t.previewLang}
                className="flex items-center gap-0.5 rounded-full bg-soft p-0.5 text-[11px]"
              >
                {LOCALES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    aria-pressed={previewLang === lang}
                    onClick={() => setPreviewLang(lang)}
                    className={`rounded-full px-2.5 py-1 transition-colors ${
                      previewLang === lang ? "bg-accent font-bold text-white" : "text-muted hover:text-ink"
                    }`}
                  >
                    {lang === "ko" ? t.ko : t.en}
                  </button>
                ))}
              </div>
            </div>
            <p className="border-b border-black/10 bg-soft px-3 py-2 text-[11px] leading-5 text-muted">
              {t.previewHint}
            </p>
            <div className="max-h-[78vh] overflow-y-auto">
              {preview?.kind === "ok" ? (
                <SectionPreview section={preview.section} locale={previewLang} />
              ) : (
                <p className="px-3 py-8 text-center text-[12px] text-muted">
                  {preview?.kind === "board"
                    ? t.previewUnavailableBoard
                    : preview?.kind === "mobile"
                      ? t.previewUnavailableMobile
                      : preview?.kind === "chrome"
                        ? t.previewUnavailableChrome
                        : t.previewUnavailable}
                </p>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted">{t.previewFootnote}</p>
        </aside>
      ) : null}
    </div>
  );
}
