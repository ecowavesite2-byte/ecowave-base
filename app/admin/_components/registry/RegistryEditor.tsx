"use client";

import { useEffect, useMemo, useState } from "react";
import FieldRow from "./FieldRow";
import GroupTabs from "./GroupTabs";
import type { RegistryDef, RegistryLocale, RegistryResponse, SaveStatus } from "./types";

/**
 * Simple mcell-style override editor: pick a group + locale, edit one field at
 * a time. Values are effective values from `/api/admin/registry` (DB override >
 * code default); an empty value reverts to the default.
 */

const LOCALES: { value: RegistryLocale; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];

const LOCALE_ACTIVE = "bg-accent text-white";
const LOCALE_IDLE = "text-[#6b7280] hover:text-accent";
const RETRY_BUTTON =
  "ml-auto rounded-md border border-red-200 bg-white px-2.5 py-1 text-[12px] text-red-700 transition-colors hover:border-red-400";

export default function RegistryEditor({ initialGroup }: { initialGroup: string }) {
  const [group, setGroup] = useState(initialGroup);
  const [locale, setLocale] = useState<RegistryLocale>("ko");
  const [refresh, setRefresh] = useState(0);

  const [groups, setGroups] = useState<string[]>([initialGroup]);
  const [defs, setDefs] = useState<RegistryDef[]>([]);
  const [baseValues, setBaseValues] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dbConfigured, setDbConfigured] = useState(true);
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const response = await fetch(
          `/api/admin/registry?group=${encodeURIComponent(group)}&locale=${locale}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as RegistryResponse;
        if (cancelled) return;
        setGroups(data.groups.length > 0 ? data.groups : [group]);
        setDefs(data.defs);
        setBaseValues(data.values);
        setDrafts({ ...data.values });
        setDbConfigured(data.dbConfigured);
        setStatus({});
        setErrors({});
      } catch {
        if (cancelled) return;
        setDefs([]);
        setLoadError("Could not load content fields.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [group, locale, refresh]);

  const sections = useMemo(() => {
    const map = new Map<string, RegistryDef[]>();
    for (const def of defs) {
      const heading = def.section[locale] || def.section.ko || def.pageKey;
      const bucket = map.get(heading);
      if (bucket) bucket.push(def);
      else map.set(heading, [def]);
    }
    return Array.from(map.entries());
  }, [defs, locale]);

  const imageOptions = useMemo(() => {
    const used = new Set<string>();
    for (const def of defs) {
      if (def.kind !== "image") continue;
      const value = baseValues[def.key];
      if (value) used.add(value);
    }
    return Array.from(used).sort();
  }, [defs, baseValues]);

  const dirtyOf = (def: RegistryDef) =>
    (drafts[def.key] ?? "") !== (baseValues[def.key] ?? "");

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

  function revert(key: string) {
    setDrafts((prev) => ({ ...prev, [key]: baseValues[key] ?? "" }));
    setStatus((prev) => ({ ...prev, [key]: "idle" }));
    setErrors((prev) => {
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
        setBaseValues((prev) => ({ ...prev, [def.key]: value }));
        setStatus((prev) => ({ ...prev, [def.key]: "saved" }));
        return;
      }

      const data = (await response.json().catch(() => ({}))) as { error?: unknown };
      const message =
        typeof data.error === "string" ? data.error : `Save failed (HTTP ${response.status}).`;
      if (response.status === 503) setDbConfigured(false);
      setStatus((prev) => ({ ...prev, [def.key]: "error" }));
      setErrors((prev) => ({ ...prev, [def.key]: message }));
    } catch {
      setStatus((prev) => ({ ...prev, [def.key]: "error" }));
      setErrors((prev) => ({
        ...prev,
        [def.key]: "Network error. Retry when online.",
      }));
    }
  }

  const tabGroups = groups.length > 0 ? groups : [initialGroup];

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Content</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            Simple override editor · code defaults with per-field overrides
          </p>
        </div>
        <div className="ml-auto flex rounded-md border border-line bg-white p-0.5">
          {LOCALES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-current={locale === item.value ? "true" : undefined}
              onClick={() => setLocale(item.value)}
              className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
                locale === item.value ? LOCALE_ACTIVE : LOCALE_IDLE
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[12px] text-[#6b7280]">
        Press <strong>Save</strong> to store an override. An <strong>empty</strong> value removes the
        override and reverts to the site default. <strong>Revert</strong> only restores the last
        loaded value (no server call).
      </p>

      {!dbConfigured ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
        >
          Database is not configured (DATABASE_URL missing). Showing code defaults — saving is
          disabled.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <GroupTabs groups={tabGroups} active={group} onSelect={setGroup} />
      </div>

      {loadError ? (
        <div className="mt-6 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          <span>{loadError}</span>
          <button type="button" onClick={() => setRefresh((n) => n + 1)} className={RETRY_BUTTON}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? <p className="mt-6 text-[13px] text-[#6b7280]">Loading…</p> : null}

      {!loading && !loadError && sections.length === 0 ? (
        <p className="mt-6 text-[13px] text-[#6b7280]">No editable fields in this group.</p>
      ) : null}

      {!loading
        ? sections.map(([heading, rows]) => (
            <section key={heading} className="mt-6">
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[#6b7280] uppercase">
                {heading}
              </h2>
              <div className="space-y-2">
                {rows.map((def) => (
                  <FieldRow
                    key={def.key}
                    def={def}
                    locale={locale}
                    value={drafts[def.key] ?? ""}
                    dirty={dirtyOf(def)}
                    status={status[def.key] ?? "idle"}
                    error={errors[def.key]}
                    disabled={!dbConfigured}
                    imageOptions={imageOptions}
                    onChange={(value) => setDraft(def.key, value)}
                    onSave={() => {
                      void save(def);
                    }}
                    onRevert={() => revert(def.key)}
                  />
                ))}
              </div>
            </section>
          ))
        : null}
    </div>
  );
}
