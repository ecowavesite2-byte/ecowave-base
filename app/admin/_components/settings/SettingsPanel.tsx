"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminDict, type AdminLocale } from "@/lib/admin/i18n";

/**
 * Site settings form for the registry `site` group.
 *
 * Data layer is the EXISTING `/api/admin/registry` route (GET defs + effective
 * values, PUT one field) — no new backend.
 *
 * Default-as-placeholder: the registry merges override > code default into the
 * single `values` map, so the page hands us the raw `DEFAULT_VALUES` separately
 * (server-side, from `lib/content/registry`). A field whose effective value
 * equals its default renders EMPTY with the default as its placeholder, so the
 * form shows what is actually overridden and saving an empty string reverts to
 * the default (the API's own "empty = default" rule).
 */

interface RegistryDef {
  key: string;
  kind: string;
  section: { ko: string; en: string };
  label: { ko: string; en: string };
}

interface RegistryResponse {
  defs: RegistryDef[];
  values: Record<string, string>;
  dbConfigured: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const CARD = "rounded-[4px] border border-black/10 bg-white p-5";
const INPUT =
  "h-[40px] w-full rounded-[3px] border border-black/10 bg-white px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";
const TEXTAREA =
  "min-h-[80px] w-full resize-y rounded-[3px] border border-black/10 bg-white px-3 py-2 text-[14px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";
const SAVE_BUTTON =
  "inline-flex h-[40px] items-center rounded-[3px] bg-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
const RETRY_BUTTON =
  "ml-auto rounded-[3px] border border-red-200 bg-white px-2.5 py-1 text-[12px] text-red-700 transition-colors hover:border-red-400";

export default function SettingsPanel({
  locale,
  defaults,
}: {
  locale: AdminLocale;
  defaults: Record<string, string>;
}) {
  const t = adminDict[locale].settings;

  const [defs, setDefs] = useState<RegistryDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dbConfigured, setDbConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  /** A value equal to the code default is not an override → show it as a placeholder. */
  const baseline = useCallback(
    (key: string): string => {
      const effective = values[key] ?? "";
      return effective === (defaults[key] ?? "") ? "" : effective;
    },
    [values, defaults],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    (async () => {
      try {
        const response = await fetch(
          `/api/admin/registry?group=site&locale=${locale}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as RegistryResponse;
        if (cancelled) return;
        setDefs(data.defs);
        setValues(data.values);
        setDrafts(
          Object.fromEntries(
            data.defs.map((def) => {
              const effective = data.values[def.key] ?? "";
              const isDefault = effective === (defaults[def.key] ?? "");
              return [def.key, isDefault ? "" : effective];
            }),
          ),
        );
        setDbConfigured(data.dbConfigured);
        setStatus({});
        setErrors({});
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
  }, [locale, retry, defaults]);

  const sections = useMemo(() => {
    const map = new Map<string, RegistryDef[]>();
    for (const def of defs) {
      const heading = def.section[locale] || def.section.ko || def.key;
      const bucket = map.get(heading);
      if (bucket) bucket.push(def);
      else map.set(heading, [def]);
    }
    return Array.from(map.entries());
  }, [defs, locale]);

  function setDraft(key: string, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
    setStatus((prev) => ({ ...prev, [key]: "idle" }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function save(def: RegistryDef) {
    const value = drafts[def.key] ?? "";
    setStatus((prev) => ({ ...prev, [def.key]: "saving" }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[def.key];
      return next;
    });

    try {
      const response = await fetch("/api/admin/registry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: def.key, locale, value }),
      });

      if (response.ok) {
        setValues((prev) => ({ ...prev, [def.key]: value }));
        setStatus((prev) => ({ ...prev, [def.key]: "saved" }));
        return;
      }

      const data = (await response.json().catch(() => ({}))) as { error?: unknown };
      if (response.status === 503) setDbConfigured(false);
      setStatus((prev) => ({ ...prev, [def.key]: "error" }));
      setErrors((prev) => ({
        ...prev,
        [def.key]:
          typeof data.error === "string" ? data.error : `${t.failed} (HTTP ${response.status})`,
      }));
    } catch {
      setStatus((prev) => ({ ...prev, [def.key]: "error" }));
      setErrors((prev) => ({ ...prev, [def.key]: t.failed }));
    }
  }

  return (
    <div className="space-y-8">
      {!dbConfigured ? (
        <div
          role="status"
          className="rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
        >
          {t.dbNotice}
        </div>
      ) : null}

      {loadError ? (
        <div className="flex items-center gap-3 rounded-[4px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          <span>{t.loadError}</span>
          <button type="button" onClick={() => setRetry((n) => n + 1)} className={RETRY_BUTTON}>
            {t.retry}
          </button>
        </div>
      ) : null}

      {loading ? <p className="text-[13px] text-muted">{t.loading}</p> : null}

      {!loading && !loadError && defs.length === 0 ? (
        <p className="text-[13px] text-muted">{t.empty}</p>
      ) : null}

      {!loading && !loadError
        ? sections.map(([heading, rows]) => (
            <section key={heading}>
              <h2 className="mb-3 text-[15px] font-bold text-ink">{heading}</h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {rows.map((def) => {
                  const draft = drafts[def.key] ?? "";
                  const dirty = draft !== baseline(def.key);
                  const state = status[def.key] ?? "idle";
                  const error = errors[def.key];
                  const placeholder = defaults[def.key] || t.emptyPlaceholder;

                  return (
                    <div key={def.key} className={CARD}>
                      <label className="block">
                        <span className="text-[13px] font-medium text-ink">
                          {def.label[locale] || def.label.ko}
                          <span className="ml-2 font-mono text-[11px] text-muted">{def.key}</span>
                        </span>
                        {def.kind === "textarea" ? (
                          <textarea
                            className={`${TEXTAREA} mt-2`}
                            rows={2}
                            value={draft}
                            placeholder={placeholder}
                            onChange={(event) => setDraft(def.key, event.target.value)}
                          />
                        ) : (
                          <input
                            type={def.kind === "url" ? "url" : "text"}
                            className={`${INPUT} mt-2`}
                            value={draft}
                            placeholder={placeholder}
                            onChange={(event) => setDraft(def.key, event.target.value)}
                          />
                        )}
                      </label>

                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          disabled={!dbConfigured || !dirty || state === "saving"}
                          onClick={() => void save(def)}
                          className={SAVE_BUTTON}
                        >
                          {state === "saving" ? t.saving : t.save}
                        </button>
                        {error ? (
                          <span className="text-[12px] text-red-600">{error}</span>
                        ) : (
                          <span
                            className={`text-[12px] ${
                              state === "saved"
                                ? "text-emerald-600"
                                : dirty
                                  ? "text-amber-600"
                                  : "text-muted"
                            }`}
                          >
                            {state === "saved"
                              ? t.saved
                              : dirty
                                ? t.unsaved
                                : t.upToDate}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        : null}

      {!loading && !loadError ? <p className="text-[12px] text-muted">{t.defaultHint}</p> : null}

      <div className={`${CARD} bg-soft`}>
        <h2 className="text-[13px] font-bold text-ink">{t.missingTitle}</h2>
        <p className="mt-1 text-[12px] leading-6 text-muted">{t.missingBody}</p>
      </div>
    </div>
  );
}
