import Link from "next/link";
import RichText from "@/components/ui/RichText";
import Reveal from "@/components/ui/Reveal";
import type { ColNode, Node, RowNode, Section, WidgetNode } from "@/lib/types";
import { defaultLocale, localeHref, type Locale } from "@/lib/i18n";
import { routeForSource } from "@/lib/routes";

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

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** image widgets can carry overlay labels encoded in their alt attribute */
function parseImageAlt(alt?: string): { label: string; title: string; hasOverlay: boolean } {
  if (!alt) return { label: "", title: "", hasOverlay: false };
  const html = decodeEntities(alt);
  if (!/img-title/i.test(html)) return { label: "", title: "", hasOverlay: false };
  const label = html.match(/top-t[^>]*>\s*<P[^>]*>([\s\S]*?)<\/P>/i)?.[1]?.trim() || "";
  const title = html.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
  return { label, title, hasOverlay: true };
}

/* ---------------- widgets ---------------- */

export function GalleryCard({
  item,
  w,
  h,
  fill = false,
  className = "",
}: {
  item: { org?: string | null; thumb?: string | null; title?: string; desc?: string };
  /** measured slide-item box from the crawl (px) */
  w?: number | null;
  h?: number | null;
  /** stretch to the grid cell (grid layout) */
  fill?: boolean;
  className?: string;
}) {
  const src = item.org || item.thumb;
  if (!src) return null;
  const boxStyle = !fill && (w || h) ? { width: w ? `${w}px` : undefined, height: h ? `${h}px` : undefined } : undefined;
  return (
    <figure className={`relative overflow-hidden bg-soft ${fill ? "h-full" : "shrink-0"} ${className}`} style={boxStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={item.title || ""}
        className={fill || (w && h) ? "h-full w-full object-cover" : "aspect-square w-full object-cover"}
        loading="lazy"
      />
      {(item.title || item.desc) && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          {item.title && <h4 className="text-[14px] font-semibold text-white">{item.title}</h4>}
          {item.desc && <p className="text-[12px] text-white/85">{item.desc}</p>}
        </figcaption>
      )}
    </figure>
  );
}

function ImageWidget({ w, locale }: { w: WidgetNode; locale: Locale }) {
  const h = num(w.boxStyle, "height");
  const { label, title, hasOverlay } = parseImageAlt(w.alt);

  // apply the original img inline styles verbatim (crop margins, sizes);
  // neutralize Tailwind preflight's img{max-width:100%} when the source crops
  const inlineStyle: Record<string, string> = {};
  (w.imgStyle || "").split(";").forEach((part) => {
    const [k, v] = part.split(":");
    if (!k || !v) return;
    const key = k.trim();
    const val = v.trim();
    if (
      ["width", "height", "margin-top", "margin-left", "margin-right", "margin-bottom", "display"].includes(key) &&
      val &&
      !val.includes("inherit") &&
      !val.includes("visibility")
    ) {
      inlineStyle[key] = val;
    }
  });
  if (!inlineStyle.width) inlineStyle.width = "100%";
  if (hasOverlay) inlineStyle.width = "100%";
  if (w.imgStyle && /(width|height)\s*:\s*(?!100%)/.test(w.imgStyle)) {
    inlineStyle["max-width"] = "none";
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={w.src || ""} alt={title || w.alt || ""} className="block" style={inlineStyle} loading="lazy" />
  );

  const body =
    hasOverlay && (label || title) ? (
      <div className="group relative w-full overflow-hidden bg-soft" style={h ? { height: h } : undefined}>
        {w.src && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${w.src})` }}
            aria-hidden
          />
        )}
        {w.hoverBg && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-0 group-hover:opacity-100"
            style={{ backgroundImage: `url(${w.hoverBg})` }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 flex flex-col items-start justify-end p-5 opacity-0 group-hover:opacity-100">
          {label && <p className="text-[18px] text-white">{label}</p>}
          {title && <h3 className="mt-1 text-[40px] font-bold leading-[1.2] text-white">{title}</h3>}
          {hasOverlay && (
            <span className="mt-2 text-[30px] leading-none text-white">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          )}
        </div>
      </div>
    ) : (
      <div className="relative w-full overflow-hidden" style={h ? { height: h } : undefined}>
        {w.src && img}
      </div>
    );

  const internalHref = w.href && !/^https?:/i.test(w.href) && !w.href.startsWith("#") ? routeForSource(w.href) : null;
  if (internalHref) {
    return (
      <Link href={localeHref(locale, internalHref)} className="group block">
        {body}
      </Link>
    );
  }
  if (w.href) {
    return (
      <a href={w.href} className="group block" target={/^https?:/i.test(w.href) ? "_blank" : undefined} rel="noreferrer">
        {body}
      </a>
    );
  }
  return body;
}

export function Widget({ w, locale = defaultLocale }: { w: WidgetNode; locale?: Locale }) {
  const content = w.type === "padding" ? renderPadding(w) : WidgetContent({ w, locale });
  if (!content) return null;
  const tagged = (
    <div data-widget-type={w.type}>
      {content}
    </div>
  );
  if (w.anim && w.anim !== "none") {
    return (
      <Reveal
        anim={w.anim}
        duration={w.animDur ? parseFloat(w.animDur) : undefined}
        delay={w.animDelay ? parseFloat(w.animDelay) : undefined}
      >
        {tagged}
      </Reveal>
    );
  }
  return tagged;
}

function renderPadding(w: WidgetNode) {
  const fromData =
    typeof (w as unknown as { _h?: number })._h === "number"
      ? (w as unknown as { _h: number })._h
      : (() => {
          const m = (w.html || "").match(/data-height="(-?[\d.]+)"/) || (w.html || "").match(/[^-]height:\s*(-?[\d.]+)px/);
          return m ? parseFloat(m[1]) : 0;
        })();
  if (!fromData) return null;
  return <div className="spacer" style={{ ["--h" as string]: fromData }} />;
}

function WidgetContent({ w, locale }: { w: WidgetNode; locale: Locale }) {
  switch (w.type) {
    case "text":
      return <RichText html={w.html} />;
    case "image":
      return <ImageWidget w={w} locale={locale} />;
    case "gallery2": {
      const items = (w.items || []).filter((it) => it.org || it.thumb);
      if (items.length === 0) return null;
      const meta2 = w as unknown as { itemW?: number; itemH?: number; gridN?: string };
      if (w.layout === "slide") {
        return (
          <div className="flex snap-x gap-[5px] overflow-x-auto">
            {items.map((it, i) => (
              <GalleryCard
                key={i}
                item={it}
                w={meta2.itemW || 238}
                h={meta2.itemH}
                className="snap-start"
              />
            ))}
          </div>
        );
      }
      // grid layout: column count from the crawled grid_0N class;
      // cells stretch to the row's measured min-height, images fill them
      const cols = Math.max(1, Math.min(6, Number(meta2.gridN) || 4));
      return (
        <div
          className="gallery-grid"
          style={{ ["--gcols" as string]: cols }}
        >
          {items.map((it, i) => (
            <GalleryCard key={i} item={it} fill />
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
        <iframe src={w.src} className="aspect-video w-full" allowFullScreen title="video" />
      ) : null;
    case "button": {
      const isTop = w.href === "#doz_header" || /icon-arrow-up/.test(w.html || "");
      return (
        <div className="text-right">
          <Link
            href={w.href || "#"}
            aria-label={w.text || "button"}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#ddd] text-body transition-colors hover:border-accent hover:text-accent"
          >
            {isTop && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

export function Rows({ rows, locale = defaultLocale, nested = false }: { rows: Node[]; locale?: Locale; nested?: boolean }) {
  const out: React.ReactNode[] = [];
  rows.forEach((n, i) => {
    if (isRow(n)) {
      out.push(<Row key={i} r={n} locale={locale} nested={nested} />);
    } else if (isWidget(n)) {
      out.push(
        <div key={i}>
          <Widget w={n} locale={locale} />
        </div>,
      );
    } else if (n.kind === "col") {
      out.push(
        <div key={i} className={colClass(n.grid)}>
          <Rows rows={n.children} locale={locale} nested />
        </div>,
      );
    }
  });
  return <>{out}</>;
}

export function Row({ r, locale = defaultLocale, nested = false }: { r: RowNode; locale?: Locale; nested?: boolean }) {
  const rowVars: React.CSSProperties = {};
  if (!nested && r.w) (rowVars as Record<string, string>)["--row-w"] = `${r.w}px`;
  if (r.h) (rowVars as Record<string, string>)["--row-h"] = `${r.h}px`;
  // only top-level rows add the gutter inset — nested rows sit inside an
  // already-padded ancestor col, so re-applying would double the inset
  (rowVars as Record<string, string>)["--row-pad"] = nested ? "0px" : `${r.pad ?? 0}px`;
  // nested imweb rows scale to their parent col's grid (doz_grid), not 12
  const cols = r.cols.map((c) => ({
    ...c,
    span: Math.max(1, Math.min(12, Math.round(((parseInt(c.grid, 10) || 12) / (parseInt(r.grid, 10) || 12)) * 12))),
  }));
  return (
    <div className="imweb-row grid grid-cols-1 lg:grid-cols-12" style={rowVars}>
      {cols.map((c, i) => (
        <div key={i} className={`imweb-col ${SPAN_CLASS[c.span] || colClass(c.grid)}`}>
          <Rows rows={c.children} locale={locale} nested />
        </div>
      ))}
    </div>
  );
}

/* ---------------- section ---------------- */

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
        if (r.type === "sub_menu" || r.type === "board") return;
        if (r.type === "padding") {
          const h =
            typeof (r as unknown as { _h?: number })._h === "number"
              ? (r as unknown as { _h: number })._h
              : (() => {
                  const m = (r.html || "").match(/data-height="(-?[\d.]+)"/) || (r.html || "").match(/[^-]height:\s*(-?[\d.]+)px/);
                  return m ? parseFloat(m[1]) : 0;
                })();
          if (h > 1) ok = true; // spacer rhythm counts as content
          return;
        }
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
  locale = defaultLocale,
}: {
  sections: Section[];
  skipIds?: string[];
  locale?: Locale;
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
              style={{ backgroundImage: `url(${sec.bg || urlFromStyle(sec.bgStyle)})` }}
              aria-hidden
            />
          )}
          {sec.bgColor && <div className="absolute inset-0" style={{ backgroundColor: sec.bgColor }} aria-hidden />}
          <div className="relative">
            {sec.rows
              .filter((r) => r.kind === "row")
              .map((r, i) => (
                <Row key={i} r={r as RowNode} locale={locale} nested={false} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
