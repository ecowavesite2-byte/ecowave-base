"use client";

import { useEffect } from "react";

/**
 * Admin-wide trim-on-blur for text fields.
 *
 * The controlled editors keep the raw keystroke stream in state, so users can
 * type (and keep) spaces mid-word without the value being normalized under the
 * caret. When focus leaves a field, leading/trailing whitespace is trimmed
 * once — the same normalization the save API applies.
 *
 * React tracks a controlled input's previous value, so assigning `value`
 * directly would not fire `onChange`. The native prototype setter updates the
 * DOM without touching React's tracker, then the dispatched `input` event makes
 * the controlled editor commit the trimmed string to its draft state.
 */
const TRIMMABLE_TYPES = new Set(["text", "search", "email", "tel", "url"]);

function trimField(field: HTMLInputElement | HTMLTextAreaElement): void {
  const current = field.value;
  const trimmed = current.trim();
  if (current === trimmed) return;

  const proto =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setValue?.call(field, trimmed);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function TrimOnBlur() {
  useEffect(() => {
    const onFocusOut = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement) {
        // Skip date/number/password/file/range/checkbox controls: trimming a
        // password would change credentials, and the others cannot hold spaces.
        if (!TRIMMABLE_TYPES.has(target.type)) return;
        trimField(target);
        return;
      }
      if (target instanceof HTMLTextAreaElement) trimField(target);
    };

    document.addEventListener("focusout", onFocusOut, true);
    return () => document.removeEventListener("focusout", onFocusOut, true);
  }, []);

  return null;
}
