"use client";

import type { ReactNode, Ref } from "react";

/**
 * Shared input primitives for the surviving admin screens (registry + boards).
 *
 * Moved out of the retired `app/admin/_components/editor/WidgetFields.tsx` when
 * the heavy 3-pane editor was removed. Only the primitives still used by the
 * registry and board editors live here (`Field`, `TextInput`, `TextArea`,
 * `ReadOnlyNotice`).
 */

const baseInput =
  "w-full rounded-md border border-line bg-white px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-[#9ca3af] focus:border-accent focus:ring-2 focus:ring-accent/25";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[12px] font-medium text-ink">
        <span>{label}</span>
        {hint ? <span className="text-[11px] font-normal text-[#6b7280]">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  mono = false,
  readOnly = false,
  placeholder,
  listId,
  type = "text",
  inputId,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  listId?: string;
  type?: string;
  inputId?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      id={inputId}
      ref={inputRef}
      type={type}
      value={value}
      readOnly={readOnly}
      list={listId}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 ${baseInput} ${mono ? "font-mono text-[12px]" : ""} ${
        readOnly ? "bg-[#f4f5f7] text-[#6b7280]" : ""
      }`}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 10,
  mono = true,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`${baseInput} min-h-[180px] resize-y py-2 leading-relaxed ${
        mono ? "font-mono text-[12px]" : ""
      }`}
    />
  );
}

export function ReadOnlyNotice({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-line bg-white px-3 py-2 text-[12px] text-[#6b7280]">
      {text}
    </p>
  );
}
