"use client";

import { useState } from "react";
import type { WidgetNode } from "@/lib/types";
import { Field, TextInput } from "./WidgetFields";

/** Raw-style fields are quarantined behind an explicit amber disclosure. */
export default function AdvancedGroup({
  widget,
  onPatch,
}: {
  widget: WidgetNode;
  onPatch: (patch: Partial<WidgetNode>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 rounded-md border border-amber-300 bg-amber-50">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-[12px] font-medium text-amber-900">Advanced — raw styles</span>
        <span className="text-[12px] text-amber-800">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-amber-200 px-3 py-3">
          <p className="text-[11px] text-amber-800">
            Quarantined: these values control pixel layout. Edit only from a measurement.
          </p>
          <Field label="style">
            <TextInput mono value={widget.style ?? ""} onChange={(value) => onPatch({ style: value })} />
          </Field>
          <Field label="imgStyle">
            <TextInput
              mono
              value={widget.imgStyle ?? ""}
              onChange={(value) => onPatch({ imgStyle: value })}
            />
          </Field>
          <Field label="boxStyle">
            <TextInput
              mono
              value={widget.boxStyle ?? ""}
              onChange={(value) => onPatch({ boxStyle: value })}
            />
          </Field>
          <Field label="listCls" hint="widget class list">
            <TextInput
              mono
              value={widget.listCls ?? ""}
              onChange={(value) => onPatch({ listCls: value })}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
