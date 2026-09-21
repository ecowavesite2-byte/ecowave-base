"use client";

import { useState } from "react";
import { Field, TextArea, TextInput } from "../registry/fields";
import { formToPost, toPostForm, type PostForm } from "@/lib/content/board-form";
import type { BoardPost } from "@/lib/types";

/** One post edited inline; Save/Delete are disabled until the board is seeded. */

const SAVE_BUTTON =
  "rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
const REVERT_BUTTON =
  "rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent";
const DELETE_BUTTON =
  "rounded-md border border-red-200 px-2.5 py-1.5 text-[12px] text-red-700 transition-colors hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50";

function set<K extends keyof PostForm>(form: PostForm, key: K, value: PostForm[K]): PostForm {
  return { ...form, [key]: value };
}

export default function PostRow({
  post,
  isProduct,
  disabled,
  busy,
  onSave,
  onDelete,
}: {
  post: BoardPost;
  isProduct: boolean;
  disabled: boolean;
  busy: boolean;
  onSave: (post: BoardPost) => void;
  onDelete: (idx: string) => void;
}) {
  const base = toPostForm(post);
  const [form, setForm] = useState<PostForm>(base);
  const dirty = JSON.stringify(form) !== JSON.stringify(base);

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[11px] text-[#9ca3af]">{post.idx}</span>
        {post.isNotice ? (
          <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[10px] font-medium text-[#4338ca]">
            Notice
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          {dirty ? (
            <button
              type="button"
              className={REVERT_BUTTON}
              onClick={() => setForm(base)}
              disabled={busy}
            >
              Revert
            </button>
          ) : null}
          <button
            type="button"
            className={SAVE_BUTTON}
            disabled={disabled || busy || !dirty}
            title={disabled ? "Seed the board first" : undefined}
            onClick={() => onSave(formToPost(form, post))}
          >
            Save
          </button>
          <button
            type="button"
            className={DELETE_BUTTON}
            disabled={disabled || busy}
            title={disabled ? "Seed the board first" : undefined}
            onClick={() => {
              if (window.confirm(`Delete post “${post.title || post.idx}”?`)) onDelete(post.idx);
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <Field label="Title">
          <TextInput value={form.title} onChange={(v) => setForm(set(form, "title", v))} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {isProduct ? (
            <Field label="Category">
              <TextInput
                value={form.category}
                onChange={(v) => setForm(set(form, "category", v))}
              />
            </Field>
          ) : null}
          <Field label="Date" hint="free text">
            <TextInput value={form.date} onChange={(v) => setForm(set(form, "date", v))} />
          </Field>
        </div>

        <Field label="Thumbnail" hint="relative /… path or https URL">
          <TextInput
            value={form.thumb}
            onChange={(v) => setForm(set(form, "thumb", v))}
            mono
            placeholder="/images/…"
          />
        </Field>

        <Field label="Excerpt">
          <TextInput value={form.excerpt} onChange={(v) => setForm(set(form, "excerpt", v))} />
        </Field>

        <Field label="Content" hint="HTML · sanitized on save">
          <TextArea value={form.content} onChange={(v) => setForm(set(form, "content", v))} />
        </Field>

        <label className="flex items-center gap-2 text-[12px] text-ink">
          <input
            type="checkbox"
            checked={form.isNotice}
            disabled={disabled || busy}
            onChange={(e) => setForm(set(form, "isNotice", e.target.checked))}
            className="h-4 w-4 rounded border-line accent-accent"
          />
          Pinned notice
        </label>
      </div>
    </div>
  );
}
