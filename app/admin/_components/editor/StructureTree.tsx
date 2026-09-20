"use client";

import { useState } from "react";
import type { Node, PageContent, Section } from "@/lib/types";
import {
  flattenSection,
  sectionLabel,
  sectionViewport,
  walkWidgets,
  widgetGlyph,
  widgetLabel,
  type Selection,
  type Viewport,
  type WidgetEntry,
} from "../../_lib/tree";

const VIEWPORT_CLASS: Record<Viewport, string> = {
  PC: "bg-[#eef2ff] text-[#4338ca]",
  MOBILE: "bg-[#fef3c7] text-[#92400e]",
  "PC+MO": "bg-[#ecfeff] text-[#155e75]",
};

function WidgetRow({
  entry,
  active,
  onSelect,
}: {
  entry: WidgetEntry;
  active: boolean;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <button
      type="button"
      role="treeitem"
      aria-selected={active}
      onClick={() => onSelect({ sectionId: entry.sectionId, widgetId: entry.widget.id })}
      title={`${entry.widget.type} · ${entry.widget.id}`}
      className={`flex w-full items-center gap-2 rounded-md py-[3px] pr-2 pl-6 text-left transition-colors ${
        active ? "bg-accent/10 text-accent" : "text-ink hover:bg-[#f4f5f7]"
      }`}
    >
      <span
        className={`inline-flex h-4 w-7 shrink-0 items-center justify-center rounded text-[10px] ${
          active ? "bg-accent text-white" : "bg-[#e5e7eb] text-[#4b5563]"
        }`}
      >
        {widgetGlyph(entry.widget.type)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px]">{widgetLabel(entry.widget)}</span>
    </button>
  );
}

function NodeList({
  nodes,
  section,
  sectionLabelText,
  sectionViewportValue,
  selected,
  onSelect,
  depth = 0,
}: {
  nodes: Node[];
  section: Section;
  sectionLabelText: string;
  sectionViewportValue: Viewport;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node, index) => {
        const indent = { paddingLeft: depth * 10 };
        if (node.kind === "row") {
          return (
            <div key={`row-${index}`} style={indent}>
              <div className="px-2 py-0.5 font-mono text-[10px] text-[#9ca3af]">
                row · grid {node.grid}
                {typeof node.h === "number" ? ` · h${node.h}` : ""}
                {typeof node.pad === "number" ? ` · pad${node.pad}` : ""}
              </div>
              <NodeList
                nodes={node.cols}
                section={section}
                sectionLabelText={sectionLabelText}
                sectionViewportValue={sectionViewportValue}
                selected={selected}
                onSelect={onSelect}
                depth={depth + 1}
              />
            </div>
          );
        }
        if (node.kind === "col") {
          return (
            <div key={`col-${index}`} style={indent}>
              <div className="px-2 py-0.5 font-mono text-[10px] text-[#9ca3af]">
                col · grid {node.grid}
              </div>
              <NodeList
                nodes={node.children}
                section={section}
                sectionLabelText={sectionLabelText}
                sectionViewportValue={sectionViewportValue}
                selected={selected}
                onSelect={onSelect}
                depth={depth + 1}
              />
            </div>
          );
        }
        return (
          <WidgetRow
            key={node.id}
            entry={{
              sectionId: section.id,
              sectionLabel: sectionLabelText,
              viewport: sectionViewportValue,
              widget: node,
            }}
            active={selected?.widgetId === node.id && selected?.sectionId === section.id}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}

export default function StructureTree({
  page,
  selected,
  onSelect,
}: {
  page: PageContent;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [layoutView, setLayoutView] = useState<Set<string>>(new Set());

  const toggle = (setter: typeof setCollapsed, id: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div role="tree" aria-label="Page structure" className="p-2">
      {page.sections.map((section, index) => {
        const entries = walkWidgets(section, index);
        const shape = flattenSection(section);
        const viewport = sectionViewport(section);
        const isCollapsed = collapsed.has(section.id);
        const showLayout = layoutView.has(section.id);

        return (
          <div key={section.id} className="mb-0.5">
            <div className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-[#f4f5f7]">
              <button
                type="button"
                aria-label={isCollapsed ? "Expand section" : "Collapse section"}
                onClick={() => toggle(setCollapsed, section.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[13px] text-[#6b7280] hover:bg-[#e5e7eb]"
              >
                {isCollapsed ? "+" : "−"}
              </button>
              <button
                type="button"
                role="treeitem"
                aria-expanded={!isCollapsed}
                aria-selected={false}
                onClick={() => toggle(setCollapsed, section.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[13px] font-medium text-ink">
                  {sectionLabel(section, index)}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-px text-[10px] font-medium ${VIEWPORT_CLASS[viewport]}`}
                  >
                    {viewport}
                  </span>
                  <span className="text-[10px] text-[#6b7280]">{entries.length} widgets</span>
                </span>
              </button>
              {shape.mode === "tree" ? (
                <button
                  type="button"
                  aria-pressed={showLayout}
                  onClick={() => toggle(setLayoutView, section.id)}
                  title="Reveal the row/col layout"
                  className={`rounded border px-1.5 py-px text-[10px] transition-colors ${
                    showLayout
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-amber-300 text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  ⌗ Layout
                </button>
              ) : null}
            </div>

            {!isCollapsed ? (
              showLayout && shape.mode === "tree" ? (
                <NodeList
                  nodes={shape.nodes}
                  section={section}
                  sectionLabelText={sectionLabel(section, index)}
                  sectionViewportValue={viewport}
                  selected={selected}
                  onSelect={onSelect}
                />
              ) : (
                entries.map((entry) => (
                  <WidgetRow
                    key={entry.widget.id}
                    entry={entry}
                    active={
                      selected?.widgetId === entry.widget.id &&
                      selected?.sectionId === entry.sectionId
                    }
                    onSelect={onSelect}
                  />
                ))
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
