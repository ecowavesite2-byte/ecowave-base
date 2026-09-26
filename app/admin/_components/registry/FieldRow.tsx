"use client";

import { useRef, useState } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import CardsField from "./CardsField";
import ErasField from "./ErasField";
import FacilitiesTableField from "./FacilitiesTableField";
import FacilityTabsField from "./FacilityTabsField";
import GalleryField from "./GalleryField";
import ListField from "./ListField";
import LocationsField from "./LocationsField";
import OverlayField from "./OverlayField";
import PatentSectionsField from "./PatentSectionsField";
import PicksField from "./PicksField";
import SlidesField from "./SlidesField";
import TechFeaturesField from "./TechFeaturesField";
import type {
  BoardPostsMap,
  LocalePair,
  RegistryDef,
  RegistryLocale,
  SaveStatus,
} from "./types";

/**
 * One editable registry field: a card with per-language controls, a
 * default-as-placeholder rule and a per-field save + status line (same idiom as
 * `SettingsPanel`).
 *
 * Default-as-placeholder: the parent hands us the EFFECTIVE value and the code
 * default per locale. A locale that still matches the default renders EMPTY with
 * the default as its placeholder, so an empty input simply means "no override";
 * saving an empty value deletes the override and the default applies again.
 */

const CARD = "rounded-[4px] border border-black/10 bg-white p-4";
const INPUT =
  "h-[40px] w-full rounded-[3px] border border-black/10 bg-white px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";
const TEXTAREA =
  "min-h-[84px] w-full resize-y rounded-[3px] border border-black/10 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";
const SAVE_BUTTON =
  "inline-flex h-[32px] items-center rounded-[3px] bg-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
const UPLOAD_BUTTON =
  "inline-flex h-[40px] shrink-0 cursor-pointer items-center rounded-[3px] border border-black/10 bg-white px-3 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent";
const RESET_BUTTON =
  "inline-flex h-[28px] items-center rounded-[3px] border border-black/10 bg-white px-2.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50";

const LANGS: RegistryLocale[] = ["ko", "en"];
const EMPTY_BOARD_OPTIONS: BoardPostsMap = {
  ko: { news: [], notices: [] },
  en: { news: [], notices: [] },
};

/**
 * Upload control for the video-source `url` def: posts the file to the shared
 * registry upload route (which accepts video up to 50 MB) and writes the
 * returned URL into the field. No preview (video).
 */
function VideoUploadButton({
  disabled,
  t,
  onUploaded,
}: {
  disabled: boolean;
  t: AdminDict["content"];
  onUploaded: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/registry/upload", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { url?: unknown };
      if (!response.ok || typeof data.url !== "string") {
        setUploadError(true);
        return;
      }
      onUploaded(data.url);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="shrink-0">
      <label
        data-testid="video-upload"
        className={`${UPLOAD_BUTTON} ${disabled || uploading ? "pointer-events-none opacity-50" : ""}`}
      >
        {uploading ? t.videoUploading : t.videoUpload}
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/quicktime"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
      {uploadError ? <p className="mt-1 text-[11px] text-red-600">{t.videoUploadFailed}</p> : null}
    </div>
  );
}

export function ImageControl({
  draft,
  fallback,
  locale,
  t,
  disabled,
  onChange,
}: {
  draft: string;
  fallback: string;
  locale: RegistryLocale;
  t: AdminDict["content"];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const shown = draft || fallback;

  async function upload(file: File) {
    setUploading(true);
    setUploadError(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/registry/upload", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { url?: unknown };
      if (!response.ok || typeof data.url !== "string") {
        setUploadError(true);
        return;
      }
      onChange(data.url);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={draft}
            placeholder={fallback || t.urlPlaceholder}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className={`${INPUT} font-mono text-[12px]`}
          />
        </div>
        <label className={`${UPLOAD_BUTTON} ${disabled || uploading ? "pointer-events-none opacity-50" : ""}`}>
          {uploading ? t.imageUploading : t.imageUpload}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      {uploadError ? <p className="mt-1 text-[11px] text-red-600">{t.imageUploadFailed}</p> : null}
      {shown ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-[64px] w-[96px] items-center justify-center overflow-hidden rounded-[3px] border border-black/10 bg-soft">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="" className="max-h-[64px] w-full object-contain" />
          </div>
          <span className="text-[11px] text-muted">{t.imagePreview}</span>
        </div>
      ) : null}
      {draft ? (
        <div className="mt-2">
          <button
            type="button"
            data-testid="image-reset"
            disabled={disabled}
            onClick={() => onChange("")}
            className={RESET_BUTTON}
          >
            {t.imageReset}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function FieldRow({
  def,
  locale,
  drafts,
  baseline,
  codeDefaults,
  status,
  error,
  disabled,
  targetMissing = false,
  t,
  boardPosts = EMPTY_BOARD_OPTIONS,
  onDraft,
  onSave,
}: {
  def: RegistryDef;
  locale: RegistryLocale;
  /** Override-only drafts (empty = "use the code default"). */
  drafts: LocalePair;
  /** Override-only effective values, used for the dirty comparison. */
  baseline: LocalePair;
  /** Raw code defaults, shown as placeholders / list seed content. */
  codeDefaults: LocalePair;
  status: SaveStatus;
  error?: string;
  disabled: boolean;
  /** The def's target widget/slide is absent from the crawled section. */
  targetMissing?: boolean;
  t: AdminDict["content"];
  /** Server-loaded board posts for the `picks` editor, keyed by locale. */
  boardPosts?: BoardPostsMap;
  onDraft: (locale: RegistryLocale, value: string) => void;
  onSave: () => void;
}) {
  const label = def.label[locale] || def.label.ko;
  const sharedUrl = def.kind === "url";
  const dirty = sharedUrl
    ? drafts.ko !== baseline.ko
    : drafts.ko !== baseline.ko || drafts.en !== baseline.en;
  const isDefault = drafts.ko === "" && (sharedUrl || drafts.en === "");

  const statusText = error
    ? error
    : status === "saving"
      ? t.saving
      : status === "saved"
        ? t.saved
        : dirty
          ? t.unsaved
          : t.upToDate;
  const statusClass = error
    ? "text-red-600"
    : status === "saved"
      ? "text-emerald-600"
      : dirty
        ? "text-amber-600"
        : "text-muted";

  let body: React.ReactNode;
  switch (def.kind) {
    case "list":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <ListField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "url":
      body = (
        <div>
          <div className="flex items-start gap-2">
            <input
              type="text"
              value={drafts.ko}
              placeholder={codeDefaults.ko || t.urlPlaceholder}
              disabled={disabled}
              onChange={(event) => {
                onDraft("ko", event.target.value);
                onDraft("en", event.target.value);
              }}
              className={`${INPUT} font-mono text-[12px]`}
            />
            <VideoUploadButton
              disabled={disabled}
              t={t}
              onUploaded={(url) => {
                onDraft("ko", url);
                onDraft("en", url);
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">{t.sharedUrlNote}</p>
        </div>
      );
      break;
    case "image":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <ImageControl
                draft={drafts[lang]}
                fallback={codeDefaults[lang]}
                locale={locale}
                t={t}
                disabled={disabled}
                onChange={(value) => onDraft(lang, value)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "textarea":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <label key={lang} className="block min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <textarea
                rows={5}
                value={drafts[lang]}
                placeholder={codeDefaults[lang]}
                disabled={disabled}
                onChange={(event) => onDraft(lang, event.target.value)}
                className={TEXTAREA}
              />
            </label>
          ))}
        </div>
      );
      break;
    case "lines":
      body = (
        <div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {LANGS.map((lang) => (
              <label key={lang} className="block min-w-0">
                <span className="mb-1 block text-[12px] font-medium text-ink/70">
                  {lang === "ko" ? t.ko : t.en}
                </span>
                <textarea
                  rows={5}
                  value={drafts[lang]}
                  placeholder={codeDefaults[lang]}
                  disabled={disabled}
                  onChange={(event) => onDraft(lang, event.target.value)}
                  className={TEXTAREA}
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">{t.linesHint}</p>
        </div>
      );
      break;
    case "slides":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <SlidesField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                lang={lang}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "overlay":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <OverlayField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                disabled={disabled}
                t={t}
                onChange={(alt) => onDraft(lang, alt)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "eras":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <ErasField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                lang={lang}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "locations":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <LocationsField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "gallery":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <GalleryField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                config={def.gallery}
                lang={lang}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "aboutCards":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <GalleryField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                config={def.gallery}
                lang={lang}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "facilityTabs":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <FacilityTabsField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                lang={lang}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "techFeatures":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <TechFeaturesField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                lang={lang}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "patentSections":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <PatentSectionsField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                lang={lang}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "facilitiesTable":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <FacilitiesTableField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "cards":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <CardsField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    case "picks":
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <div key={lang} className="min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <PicksField
                value={drafts[lang]}
                defaultValue={codeDefaults[lang]}
                options={boardPosts[lang] ?? EMPTY_BOARD_OPTIONS[lang]}
                disabled={disabled}
                t={t}
                onChange={(json) => onDraft(lang, json)}
              />
            </div>
          ))}
        </div>
      );
      break;
    default:
      body = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {LANGS.map((lang) => (
            <label key={lang} className="block min-w-0">
              <span className="mb-1 block text-[12px] font-medium text-ink/70">
                {lang === "ko" ? t.ko : t.en}
              </span>
              <input
                type="text"
                value={drafts[lang]}
                placeholder={codeDefaults[lang]}
                disabled={disabled}
                onChange={(event) => onDraft(lang, event.target.value)}
                className={INPUT}
              />
            </label>
          ))}
        </div>
      );
      break;
  }

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <span className="rounded-[3px] bg-soft px-1.5 py-0.5 text-[11px] text-muted">
          {t.kinds[def.kind] ?? def.kind}
        </span>
        {targetMissing ? (
          <span className="rounded-[3px] bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
            {t.targetMissing}
          </span>
        ) : null}
        {isDefault ? (
          <span className="rounded-[3px] bg-soft px-1.5 py-0.5 text-[11px] text-muted">
            {t.defaultBadge}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[11px] text-muted">{def.key}</span>
      </div>

      <div className="mt-3">{body}</div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || !dirty || status === "saving"}
          onClick={onSave}
          className={SAVE_BUTTON}
        >
          {status === "saving" ? t.saving : t.save}
        </button>
        <span className={`text-[12px] ${statusClass}`}>{statusText}</span>
      </div>
    </div>
  );
}
