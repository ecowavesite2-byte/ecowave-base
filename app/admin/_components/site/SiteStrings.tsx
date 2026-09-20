"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SiteData } from "@/lib/types";
import type { UIStrings } from "@/lib/ui-strings";
import { routeForSource } from "@/lib/routes";
import { hasLogoIndex, hasNavPath, setLogo, setNavLabel } from "@/lib/content/site-strings";
import { TextInput } from "../editor/WidgetFields";

type Locale = "ko" | "en";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type Section = "nav" | "logos";

interface SectionBanner {
  section: Section;
  tone: "info" | "warn" | "error";
  text: string;
  issues?: string[];
}

interface NavRow {
  key: string;
  index: number;
  childIndex?: number;
  route: string;
  ko: string;
  en: string;
}

interface LogoRow {
  key: string;
  index: number;
  cls: string;
  ko: string;
  en: string;
}

interface FormLabelRow {
  key: string;
  ko: string;
  en: string;
}

interface PutResult {
  ok: boolean;
  status: number;
  hash?: string;
  issues?: string[];
}

function buildNavRows(ko: SiteData, en: SiteData): NavRow[] {
  const rows: NavRow[] = [];
  ko.nav.forEach((item, index) => {
    rows.push({
      key: `n${index}`,
      index,
      route: routeForSource(item.url),
      ko: item.name,
      en: en.nav[index]?.name ?? "",
    });
    item.children.forEach((child, childIndex) => {
      rows.push({
        key: `n${index}.${childIndex}`,
        index,
        childIndex,
        route: routeForSource(child.url),
        ko: child.name,
        en: en.nav[index]?.children[childIndex]?.name ?? "",
      });
    });
  });
  return rows;
}

function buildLogoRows(ko: SiteData, en: SiteData): LogoRow[] {
  const count = Math.max(ko.logos.length, en.logos.length);
  return Array.from({ length: count }, (_, index) => ({
    key: `l${index}`,
    index,
    cls: ko.logos[index]?.cls ?? en.logos[index]?.cls ?? "",
    ko: ko.logos[index]?.src ?? "",
    en: en.logos[index]?.src ?? "",
  }));
}

function applyNavLabels(site: SiteData, rows: NavRow[], locale: Locale): SiteData {
  let next = site;
  for (const row of rows) {
    const path = { index: row.index, childIndex: row.childIndex };
    if (!hasNavPath(next, path)) continue;
    next = setNavLabel(next, path, locale === "ko" ? row.ko : row.en);
  }
  return next;
}

function applyLogos(site: SiteData, rows: LogoRow[], locale: Locale): SiteData {
  let next = site;
  for (const row of rows) {
    if (!hasLogoIndex(next, row.index)) continue;
    next = setLogo(next, row.index, locale === "ko" ? row.ko : row.en);
  }
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

async function fetchSite(locale: Locale): Promise<{ content: SiteData; hash: string }> {
  const response = await fetch(`/api/admin/content?kind=site&locale=${locale}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as { content: SiteData; hash: string };
}

async function putSite(locale: Locale, content: SiteData, hash: string): Promise<PutResult> {
  try {
    const response = await fetch("/api/admin/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "site", locale, key: "", content, hash }),
    });
    if (response.ok) {
      const data = (await response.json()) as { hash: string };
      return { ok: true, status: response.status, hash: data.hash };
    }
    if (response.status === 400) {
      const data = (await response.json().catch(() => ({}))) as { issues?: unknown };
      return { ok: false, status: 400, issues: issueMessages(data.issues) };
    }
    return { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

function statusText(status: SaveStatus, dirty: boolean): string {
  if (status === "saving") return "Saving…";
  if (status === "error") return "Save failed";
  if (status === "saved") return "Saved";
  return dirty ? "Unsaved changes" : "Up to date";
}

const BANNER_CLASS: Record<SectionBanner["tone"], string> = {
  info: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
};

const SECONDARY_BUTTON =
  "rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

export default function SiteStrings({
  ko: initialKo,
  en: initialEn,
  koHash: initialKoHash,
  enHash: initialEnHash,
  mediaOptions,
  uiStrings,
  formLabels,
}: {
  ko: SiteData;
  en: SiteData;
  koHash: string;
  enHash: string;
  mediaOptions: string[];
  uiStrings: { ko: UIStrings; en: UIStrings };
  formLabels: FormLabelRow[];
}) {
  const [ko, setKo] = useState(initialKo);
  const [en, setEn] = useState(initialEn);
  const [koHash, setKoHash] = useState(initialKoHash);
  const [enHash, setEnHash] = useState(initialEnHash);

  const [navRows, setNavRows] = useState<NavRow[]>(() => buildNavRows(initialKo, initialEn));
  const [logoRows, setLogoRows] = useState<LogoRow[]>(() => buildLogoRows(initialKo, initialEn));
  const [navDirty, setNavDirty] = useState(false);
  const [logoDirty, setLogoDirty] = useState(false);
  const [navStatus, setNavStatus] = useState<SaveStatus>("idle");
  const [logoStatus, setLogoStatus] = useState<SaveStatus>("idle");
  const [banner, setBanner] = useState<SectionBanner | null>(null);

  // Establish the If-Match hashes from the content API on mount (the server
  // also passes hashes computed with the same hashOfFile, as a fallback).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [k, e] = await Promise.all([fetchSite("ko"), fetchSite("en")]);
        if (cancelled) return;
        setKo(k.content);
        setKoHash(k.hash);
        setEn(e.content);
        setEnHash(e.hash);
        setNavRows(buildNavRows(k.content, e.content));
        setLogoRows(buildLogoRows(k.content, e.content));
        setNavDirty(false);
        setLogoDirty(false);
      } catch {
        // keep the server-provided content + hashes
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function editNav(key: string, locale: Locale, value: string) {
    setNavRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, [locale]: value } : row)),
    );
    setNavDirty(true);
    setNavStatus("idle");
    setBanner(null);
  }

  function editLogo(key: string, locale: Locale, value: string) {
    setLogoRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, [locale]: value } : row)),
    );
    setLogoDirty(true);
    setLogoStatus("idle");
    setBanner(null);
  }

  function failureBanner(section: Section, localeName: string, result: PutResult): SectionBanner {
    if (result.status === 409) {
      return {
        section,
        tone: "warn",
        text: `${localeName} changed on disk since it was loaded — Revert to reload.`,
      };
    }
    if (result.status === 400) {
      return { section, tone: "error", text: `${localeName} failed validation.`, issues: result.issues };
    }
    if (result.status === 0) {
      return { section, tone: "error", text: `Network error saving ${localeName}. Retry when online.` };
    }
    return { section, tone: "error", text: `${localeName} save failed (HTTP ${result.status}).` };
  }

  async function saveSection(section: Section) {
    const saving = section === "nav" ? navStatus === "saving" : logoStatus === "saving";
    if (saving) return;

    if (section === "nav") setNavStatus("saving");
    else setLogoStatus("saving");
    setBanner(null);

    const nextKo =
      section === "nav" ? applyNavLabels(ko, navRows, "ko") : applyLogos(ko, logoRows, "ko");
    const nextEn =
      section === "nav" ? applyNavLabels(en, navRows, "en") : applyLogos(en, logoRows, "en");

    const koResult = await putSite("ko", nextKo, koHash);
    if (!koResult.ok) {
      if (section === "nav") setNavStatus("error");
      else setLogoStatus("error");
      setBanner(failureBanner(section, "Korean", koResult));
      return;
    }
    setKo(nextKo);
    setKoHash(koResult.hash ?? koHash);

    const enResult = await putSite("en", nextEn, enHash);
    if (!enResult.ok) {
      if (section === "nav") setNavStatus("error");
      else setLogoStatus("error");
      setBanner({
        section,
        tone: "warn",
        text: "Korean saved. English failed — press Save again to finish the English side.",
        issues: enResult.issues,
      });
      return;
    }
    setEn(nextEn);
    setEnHash(enResult.hash ?? enHash);

    if (section === "nav") {
      setNavDirty(false);
      setNavStatus("saved");
    } else {
      setLogoDirty(false);
      setLogoStatus("saved");
    }
    setBanner({ section, tone: "info", text: "Saved (Korean + English)" });
  }

  async function revertSection(section: Section) {
    const dirty = section === "nav" ? navDirty : logoDirty;
    if (dirty && !window.confirm("Discard unsaved changes and reload from disk?")) return;

    if (section === "nav") setNavStatus("saving");
    else setLogoStatus("saving");
    setBanner(null);

    try {
      const [k, e] = await Promise.all([fetchSite("ko"), fetchSite("en")]);
      setKo(k.content);
      setKoHash(k.hash);
      setEn(e.content);
      setEnHash(e.hash);
      if (section === "nav") {
        setNavRows(buildNavRows(k.content, e.content));
        setNavDirty(false);
        setNavStatus("idle");
      } else {
        setLogoRows(buildLogoRows(k.content, e.content));
        setLogoDirty(false);
        setLogoStatus("idle");
      }
      setBanner({ section, tone: "info", text: "Reloaded from disk." });
    } catch {
      if (section === "nav") setNavStatus("error");
      else setLogoStatus("error");
      setBanner({ section, tone: "error", text: "Could not reload the site strings." });
    }
  }

  function sectionBanner(section: Section) {
    if (!banner || banner.section !== section) return null;
    return (
      <p className={`mt-2 rounded-md border px-3 py-2 text-[12px] ${BANNER_CLASS[banner.tone]}`} role="status">
        {banner.text}
        {banner.issues && banner.issues.length > 0 ? (
          <span className="mt-1 block list-disc pl-0">
            {banner.issues.slice(0, 4).join("; ")}
          </span>
        ) : null}
      </p>
    );
  }

  function sectionActions(section: Section, status: SaveStatus, dirty: boolean) {
    return (
      <div className="ml-auto flex items-center gap-2">
        <span className={`text-[12px] ${status === "error" ? "text-red-600" : "text-[#6b7280]"}`}>
          {statusText(status, dirty)}
        </span>
        <button
          type="button"
          onClick={() => revertSection(section)}
          disabled={status === "saving"}
          className={SECONDARY_BUTTON}
        >
          Revert
        </button>
        <button
          type="button"
          onClick={() => saveSection(section)}
          disabled={status === "saving" || !dirty}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2f5ac7] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] p-8">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Site strings</h1>
      <p className="mt-0.5 text-[13px] text-[#6b7280]">
        Navigation labels and logos, editing Korean and English together.
      </p>

      {/* Navigation */}
      <section className="mt-6 rounded-lg border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Navigation</h2>
          {sectionActions("nav", navStatus, navDirty)}
        </div>
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          Nav labels also drive page hero titles and breadcrumbs (lib/page-hero.ts). Routes cannot be
          changed here.
        </p>
        {sectionBanner("nav")}

        <div className="mt-4 space-y-1.5">
          <div className="grid grid-cols-[170px_1fr_1fr] gap-3 text-[10px] font-semibold tracking-wide text-[#9ca3af] uppercase">
            <span>Route (read-only)</span>
            <span>한국어</span>
            <span>English</span>
          </div>
          {navRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[170px_1fr_1fr] items-center gap-3">
              <span
                className={`truncate font-mono text-[11px] text-[#6b7280] ${
                  row.childIndex === undefined ? "font-semibold text-ink" : "pl-3"
                }`}
                title={row.route}
              >
                {row.route}
              </span>
              <TextInput value={row.ko} onChange={(value) => editNav(row.key, "ko", value)} />
              <TextInput value={row.en} onChange={(value) => editNav(row.key, "en", value)} />
            </div>
          ))}
        </div>
      </section>

      {/* Logos */}
      <section className="mt-5 rounded-lg border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Logos</h2>
          {sectionActions("logos", logoStatus, logoDirty)}
        </div>
        <p className="mt-1 text-[12px] text-[#6b7280]">
          Normal / scroll variants. Type a path or pick a URL from the media index.
        </p>
        {sectionBanner("logos")}

        <div className="mt-4 space-y-1.5">
          <div className="grid grid-cols-[170px_1fr_1fr] gap-3 text-[10px] font-semibold tracking-wide text-[#9ca3af] uppercase">
            <span>Variant</span>
            <span>한국어 src</span>
            <span>English src</span>
          </div>
          {logoRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[170px_1fr_1fr] items-center gap-3">
              <span className="truncate font-mono text-[11px] text-[#6b7280]" title={row.cls}>
                {row.cls || `logo ${row.index + 1}`}
              </span>
              <TextInput
                mono
                listId="site-media-options"
                value={row.ko}
                onChange={(value) => editLogo(row.key, "ko", value)}
              />
              <TextInput
                mono
                listId="site-media-options"
                value={row.en}
                onChange={(value) => editLogo(row.key, "en", value)}
              />
            </div>
          ))}
        </div>
        <datalist id="site-media-options">
          {mediaOptions.map((url) => (
            <option key={url} value={url} />
          ))}
        </datalist>
        {mediaOptions.length === 0 ? (
          <p className="mt-2 text-[11px] text-[#6b7280]">
            The media index is empty — upload images under Media to enable suggestions.
          </p>
        ) : null}
      </section>

      {/* Footer */}
      <section className="mt-5 rounded-lg border border-line bg-white p-5">
        <h2 className="text-[15px] font-semibold text-ink">Footer</h2>
        <p className="mt-2 text-[12px] text-[#6b7280]">
          <span className="font-mono">site.json.footer</span> (and the body font/colour fields) is
          unused at runtime — the real footer renders from the <span className="font-mono">home.json</span>{" "}
          footer section. Edit it on the Home page instead.
        </p>
        <Link
          href="/admin/pages/home?locale=ko"
          className="mt-3 inline-block rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Open Home page editor →
        </Link>
      </section>

      {/* Interface labels (read-only) */}
      <section className="mt-5 rounded-lg border border-line bg-white p-5">
        <h2 className="text-[15px] font-semibold text-ink">Interface labels</h2>
        <p className="mt-1 text-[12px] text-[#6b7280]">
          Code-side strings from <span className="font-mono">lib/ui-strings.ts</span> — read-only here.
        </p>
        <div className="mt-3 space-y-1.5">
          {(
            [
              ["board", Object.entries(uiStrings.ko.board)],
              ["common", Object.entries(uiStrings.ko.common)],
              ["lang", Object.entries(uiStrings.ko.lang)],
            ] as const
          ).flatMap(([group, entries]) =>
            entries.map(([key, koValue]) => {
              const enGroup = group === "board" ? uiStrings.en.board : group === "common" ? uiStrings.en.common : uiStrings.en.lang;
              const enValue = String((enGroup as Record<string, string>)[key] ?? "");
              return (
                <div key={`${group}.${key}`} className="grid grid-cols-[170px_1fr_1fr] items-center gap-3">
                  <span className="font-mono text-[11px] text-[#6b7280]">
                    {group}.{key}
                  </span>
                  <span className="text-[13px] text-ink">{String(koValue)}</span>
                  <span className="text-[13px] text-ink">{enValue}</span>
                </div>
              );
            }),
          )}
        </div>
      </section>

      {/* Form labels (read-only) */}
      <section className="mt-5 rounded-lg border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Form labels</h2>
          <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#4b5563]">
            generated
          </span>
        </div>
        <p className="mt-1 text-[12px] text-[#6b7280]">
          Auto-generated by <span className="font-mono">scripts/gen-form-labels.mjs</span> — read-only.
          (Long consent text is omitted here.)
        </p>
        <div className="mt-3 space-y-1.5">
          {formLabels.map((row) => (
            <div key={row.key} className="grid grid-cols-[170px_1fr_1fr] items-center gap-3">
              <span className="truncate font-mono text-[11px] text-[#6b7280]" title={row.key}>
                {row.key}
              </span>
              <span className="text-[13px] break-words text-ink">{row.ko}</span>
              <span className="text-[13px] break-words text-ink">{row.en}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
