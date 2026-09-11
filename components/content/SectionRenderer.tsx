import Link from "next/link";
import RichText from "@/components/ui/RichText";
import type { ColNode, Node, RowNode, Section, WidgetNode } from "@/lib/types";

/* ---------------- helpers ---------------- */

function num(style: string | undefined, prop: string): number | null {
  if (!style) return null;
  const m = style.match(new RegExp(prop + "\\s*:\\s*(-?[\\d.]+)px"));
  return m ? parseFloat(m[1]) : null;
}

const SPAN_CLASS: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  11: "lg:col-span-11",
  12: "lg:col-span-12",
};

function colClass(grid: string): string {
  const g = Math.min(12, Math.max(1, parseInt(grid, 10) || 12));
  return SPAN_CLASS[g];
}

function isWidget(n: Node): n is WidgetNode {
  return n.kind === "widget";
}
function isRow(n: Node): n is RowNode {
  return n.kind === "row";
}
function isCol(n: Node): n is ColNode {
  return n.kind === "col";
}

/* ---------------- widgets ---------------- */

export function GalleryCard({
  item,
  className = "",
}: {
  item: {
    org?: string | null;
    thumb?: string | null;
    title?: string;
    desc?: string;
  };
  className?: string;
}) {
  const src = item.org || item.thumb;
  if (!src) return null;
  return (
    <figure className={`relative overflow-hidden bg-soft ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={item.title || ""}
        className="aspect-square w-full object-cover"
        loading="lazy"
      />
      {(item.title || item.desc) && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          {item.title && (
            <h4 className="text-[14px] font-semibold text-white">
              {item.title}
            </h4>
          )}
          {item.desc && (
            <p className="text-[12px] text-white/85">{item.desc}</p>
          )}
        </figcaption>
      )}
    </figure>
  );
}

export function Widget({ w }: { w: WidgetNode }) {
  switch (w.type) {
    case "padding": {
      const fromData =
        typeof (w as unknown as { _h?: number })._h === "number"
          ? (w as unknown as { _h: number })._h
          : (() => {
              const m =
                (w.html || "").match(/data-height="(-?[\d.]+)"/) ||
                (w.html || "").match(/[^-]height:\s*(-?[\d.]+)px/);
              return m ? parseFloat(m[1]) : 0;
            })();
      if (!fromData) return null;
      return <div className="spacer" style={{ ["--h" as string]: fromData }} />;
    }
    case "text":
      return <RichText html={w.html} />;
    case "image": {
      const h = num(w.boxStyle, "height");
      const margin = num(w.imgStyle, "margin-top");
      return (
        <div
          className="relative w-full overflow-hidden"
          style={h ? { height: h } : undefined}
        >
          {w.src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={w.src}
              alt={w.alt || ""}
              className="block w-full"
              style={{
                marginTop: margin ? `${margin}px` : undefined,
                height: "auto",
              }}
            />
          )}
        </div>
      );
    }
    case "gallery2": {
      const items = (w.items || []).filter((it) => it.org || it.thumb);
      if (items.length === 0) return null;
      if (w.layout === "slide") {
        return (
          <div className="flex snap-x gap-2.5 overflow-x-auto pb-2">
            {items.map((it, i) => (
              <GalleryCard
                key={i}
                item={it}
                className="w-[238px] shrink-0 snap-start"
              />
            ))}
          </div>
        );
      }
      return (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it, i) => (
            <GalleryCard key={i} item={it} />
          ))}
        </div>
      );
    }
    case "code": {
      const clean = (w.html || "").replace(/<link[^>]*>/g, "").trim();
      return clean ? <div dangerouslySetInnerHTML={{ __html: clean }} /> : null;
    }
    case "video":
      return w.html ? (
        <div dangerouslySetInnerHTML={{ __html: w.html }} />
      ) : w.src ? (
        <iframe
          src={w.src}
          className="aspect-video w-full"
          allowFullScreen
          title="video"
        />
      ) : null;
    case "button": {
      const isTop =
        w.href === "#doz_header" || /icon-arrow-up/.test(w.html || "");
      return (
        <div className="text-right">
          <Link
            href={w.href || "#"}
            aria-label={w.text || "button"}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#ddd] text-body transition-colors hover:border-accent hover:text-accent"
          >
            {isTop && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
            )}
          </Link>
        </div>
      );
    }
    case "board":
      // board widgets are handled explicitly by their page components
      return <div data-board-ref={w.ref} data-board-cls={w.listCls} />;
    default:
      return w.html ? <RichText html={w.html} /> : null;
  }
}

/* ---------------- layout walker ---------------- */

export function Rows({ rows }: { rows: Node[] }) {
  const out: React.ReactNode[] = [];
  rows.forEach((n, i) => {
    if (isRow(n)) {
      out.push(<Row key={i} r={n} />);
    } else if (isWidget(n)) {
      out.push(
        <div key={i}>
          <Widget w={n} />
        </div>,
      );
    } else if (isCol(n)) {
      out.push(
        <div key={i} className={colClass(n.grid)}>
          <Rows rows={n.children} />
        </div>,
      );
    }
  });
  return <>{out}</>;
}

export function Row({ r }: { r: RowNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12">
      {r.cols.map((c, i) => (
        <div key={i} className={colClass(c.grid)}>
          <Rows rows={c.children} />
        </div>
      ))}
    </div>
  );
}

function urlFromStyle(style?: string): string | null {
  if (!style) return null;
  const m = style.match(/url\(["']?([^"')]+)["']?\)/);
  return m ? m[1] : null;
}

/** a section renders nothing when it only holds empty spacers/boards/empty code */
function sectionHasContent(sec: Section): boolean {
  let ok = false;
  (function ws(rows: Section["rows"]) {
    rows.forEach((r) => {
      if (ok) return;
      if (r.kind === "widget") {
        if (r.type === "padding" || r.type === "sub_menu" || r.type === "board") return;
        if (r.type === "code") {
          const clean = (r.html || "")
            .replace(/<link[^>]*>/g, "")
            .replace(/<script[\s\S]*?<\/script>/g, "")
            .trim();
          if (clean.length > 30) ok = true;
          return;
        }
        if (r.type === "text" && !(r.html || "").replace(/<[^>]+>/g, "").replace(/\s|&nbsp;/g, "").length) return;
        if (r.type === "gallery2" && !(r.items || []).length) return;
        ok = true;
        return;
      }
      if (r.kind === "row") r.cols.forEach((c) => ws(c.children));
    });
  })(sec.rows);
  return ok;
}

const FOOTER_SECTION_IDS = new Set(["s20250811f489e3443bdbe"]);

/**
 * Generic renderer for a crawled page's sections (row/col/widget tree).
 * Bespoke sections (home hero, board widgets) are implemented explicitly
 * in their page components and skipped here.
 */
export default function SectionRenderer({
  sections,
  skipIds = [],
}: {
  sections: Section[];
  skipIds?: string[];
}) {
  const skip = new Set([...FOOTER_SECTION_IDS, ...skipIds]);
  const list = sections.filter(
    (s) => !skip.has(s.id) && !/mobile_section/.test(s.cls || "") && sectionHasContent(s),
  );
  return (
    <div>
      {list.map((sec) => (
        <section key={sec.id} className="relative">
          {(sec.bg || urlFromStyle(sec.bgStyle)) && (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${sec.bg || urlFromStyle(sec.bgStyle)})`,
              }}
              aria-hidden
            />
          )}
          {sec.bgColor && (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: sec.bgColor }}
              aria-hidden
            />
          )}
          <div className="relative mx-auto max-w-[1440px] px-5 py-4 lg:px-10">
            <Rows rows={sec.rows} />
          </div>
        </section>
      ))}
    </div>
  );
}
