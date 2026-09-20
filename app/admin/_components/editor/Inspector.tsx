"use client";

import { useRef } from "react";
import type { WidgetNode } from "@/lib/types";
import { widgetGlyph, widgetLabel } from "../../_lib/tree";
import AdvancedGroup from "./AdvancedGroup";
import { Field, NumberInput, ReadOnlyNotice, SelectField, TextArea, TextInput } from "./WidgetFields";

const TYPE_BADGE = "rounded bg-[#eef2ff] px-2 py-0.5 text-[11px] font-medium text-[#4338ca]";

function ImageFields({
  widget,
  imageOptions,
  onPatch,
}: {
  widget: WidgetNode;
  imageOptions: string[];
  onPatch: (patch: Partial<WidgetNode>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `image-options-${widget.id}`;

  return (
    <div className="space-y-4">
      <Field label="Image src" hint="root-relative or absolute URL">
        <div className="flex items-center gap-2">
          <TextInput
            inputId={`image-src-${widget.id}`}
            inputRef={inputRef}
            mono
            value={widget.src ?? ""}
            onChange={(value) => onPatch({ src: value })}
            listId={listId}
            placeholder="/images/…"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className="h-9 shrink-0 rounded-md border border-line px-3 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent"
          >
            Choose…
          </button>
        </div>
      </Field>
      <datalist id={listId}>
        {imageOptions.map((src) => (
          <option key={src} value={src} />
        ))}
      </datalist>
      <p className="text-[11px] text-[#6b7280]">
        Suggestions come from images already referenced on this page. The full media library
        arrives in Phase 6.
      </p>
      <Field label="Alt text" hint="accessibility">
        <TextInput
          value={widget.alt ?? ""}
          onChange={(value) => onPatch({ alt: value })}
          placeholder="Describe the image"
        />
      </Field>
      <Field label="Link href" hint="read-only">
        <TextInput readOnly value={widget.href ?? ""} onChange={() => {}} />
      </Field>
    </div>
  );
}

function GalleryFields({
  widget,
  onPatch,
  onGalleryItem,
}: {
  widget: WidgetNode;
  onPatch: (patch: Partial<WidgetNode>) => void;
  onGalleryItem: (index: number, patch: { title?: string; desc?: string }) => void;
}) {
  const items = widget.items ?? [];
  return (
    <div className="space-y-4">
      <Field label="Layout">
        <SelectField
          value={widget.layout ?? "grid"}
          onChange={(value) => onPatch({ layout: value === "slide" ? "slide" : "grid" })}
          options={[
            { value: "grid", label: "Grid" },
            { value: "slide", label: "Slide" },
          ]}
        />
      </Field>
      {items.length === 0 ? (
        <ReadOnlyNotice text="This gallery has no items." />
      ) : (
        items.map((item, index) => (
          <div key={index} className="rounded-md border border-line bg-white p-3">
            <p className="mb-2 text-[11px] font-medium text-[#6b7280]">Item {index + 1}</p>
            <div className="space-y-3">
              <Field label="Title">
                <TextInput
                  value={item.title ?? ""}
                  onChange={(value) => onGalleryItem(index, { title: value })}
                />
              </Field>
              <Field label="Description">
                <TextArea
                  rows={3}
                  mono={false}
                  value={item.desc ?? ""}
                  onChange={(value) => onGalleryItem(index, { desc: value })}
                />
              </Field>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function Inspector({
  widget,
  imageOptions,
  onPatch,
  onGalleryItem,
}: {
  widget: WidgetNode | null;
  imageOptions: string[];
  onPatch: (patch: Partial<WidgetNode>) => void;
  onGalleryItem: (index: number, patch: { title?: string; desc?: string }) => void;
}) {
  if (!widget) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
        <p className="text-[14px] font-medium text-ink">Select a widget</p>
        <p className="mt-1 text-[12px] text-[#6b7280]">
          Pick an item from the structure tree to edit its fields.
        </p>
      </div>
    );
  }

  let fields: React.ReactNode;
  switch (widget.type) {
    case "text":
      fields = (
        <div className="space-y-3">
          <Field label="HTML" hint="sanitized on save">
            <TextArea value={widget.html ?? ""} onChange={(value) => onPatch({ html: value })} />
          </Field>
          <p className="text-[11px] text-[#6b7280]">
            Save writes to the published page; use Revert to discard.
          </p>
        </div>
      );
      break;
    case "menu_title":
      fields = (
        <Field label="Menu title">
          <TextInput value={widget.text ?? ""} onChange={(value) => onPatch({ text: value })} />
        </Field>
      );
      break;
    case "image":
      fields = <ImageFields widget={widget} imageOptions={imageOptions} onPatch={onPatch} />;
      break;
    case "gallery2":
      fields = <GalleryFields widget={widget} onPatch={onPatch} onGalleryItem={onGalleryItem} />;
      break;
    case "button":
      fields = (
        <div className="space-y-4">
          <Field label="Text">
            <TextInput value={widget.text ?? ""} onChange={(value) => onPatch({ text: value })} />
          </Field>
          <Field label="Href">
            <TextInput
              mono
              value={widget.href ?? ""}
              onChange={(value) => onPatch({ href: value })}
            />
          </Field>
        </div>
      );
      break;
    case "padding":
      fields = (
        <Field label="Height (px)" hint="spacer">
          <NumberInput value={widget._h} onChange={(value) => onPatch({ _h: value })} />
        </Field>
      );
      break;
    case "code":
      fields = <ReadOnlyNotice text="Code block — read-only in this phase." />;
      break;
    case "video":
      fields = <ReadOnlyNotice text="Video embed — read-only in this phase." />;
      break;
    case "board":
      fields = (
        <ReadOnlyNotice
          text={`Board pointer${widget.ref ? ` · ${widget.ref}` : ""} — the board editor arrives in Phase 4.`}
        />
      );
      break;
    case "form":
      fields = <ReadOnlyNotice text="Inquiry form — labels are generated from lib/form-labels.ts (read-only)." />;
      break;
    default:
      fields = (
        <ReadOnlyNotice
          text={`${widget.type} widget — no primary fields in this phase. Use Advanced below for raw values.`}
        />
      );
      break;
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <header className="rounded-lg border border-line bg-white p-4">
        <div className="flex items-center gap-2">
          <span className={TYPE_BADGE}>
            {widgetGlyph(widget.type)} {widget.type}
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
            {widgetLabel(widget)}
          </span>
        </div>
        <p className="mt-2 font-mono text-[11px] text-[#6b7280]">{widget.id}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled
            title="Not available yet"
            className="rounded-md border border-line px-2.5 py-1 text-[11px] text-[#9ca3af]"
          >
            Duplicate
          </button>
          <button
            type="button"
            disabled
            title="Not available yet"
            className="rounded-md border border-line px-2.5 py-1 text-[11px] text-[#9ca3af]"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="mt-4 rounded-lg border border-line bg-white p-4">{fields}</div>

      <AdvancedGroup widget={widget} onPatch={onPatch} />
    </div>
  );
}
