"use client";

import type { AdminDict } from "@/lib/admin/i18n";
import { Field, TextInput } from "../registry/fields";

/** Board name override editor (stored in `page_content`); empty reverts. */

const SAVE_BUTTON =
  "rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";

export default function BoardNameField({
  t,
  value,
  dirty,
  disabled,
  saving,
  saved,
  onChange,
  onSave,
}: {
  t: AdminDict["boards"];
  value: string;
  dirty: boolean;
  disabled: boolean;
  saving: boolean;
  saved: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-white p-4">
      <Field label={t.nameLabel} hint={t.nameHint}>
        <div className="flex items-center gap-2">
          <TextInput value={value} onChange={onChange} />
          <button type="button" className={SAVE_BUTTON} disabled={disabled || !dirty} onClick={onSave}>
            {saving ? t.saving : t.save}
          </button>
        </div>
      </Field>
      {saved ? <p className="mt-2 text-[11px] text-emerald-600">{t.saved}</p> : null}
    </div>
  );
}
