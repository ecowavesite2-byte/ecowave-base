import Link from "next/link";
import RichText from "@/components/ui/RichText";
import Reveal from "@/components/ui/Reveal";
import InquiryForm from "@/components/forms/InquiryForm";
import GallerySlider from "@/components/content/GallerySlider";
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

/**
 * Literal class strings for the opt-in measured gallery grid (rnd USP rows).
 * Tailwind only emits classes it can see as text, so the column count must be
 * mapped to a static class rather than interpolated.
 */
const GRID_COLS_CLASS: Record<number, string> = {
  1: "min-[992px]:grid-cols-1!",
  2: "min-[992px]:grid-cols-2!",
  3: "min-[992px]:grid-cols-3!",
  4: "min-[992px]:grid-cols-4!",
  5: "min-[992px]:grid-cols-5!",
  6: "min-[992px]:grid-cols-6!",
};

/**
 * imweb `grid_0N` is a fixed-column layout preset, NOT a numeric column count:
 * measured on the live site `grid_01` = 5 columns (about USP row), `grid_02` = 6
 * (about parts row) and `grid_03` = 4 (patents). Reading `Number("01")` as 1
 * makes each cell full-width, so the gallery stacks into one 1250px row per
 * item and the section height explodes.
 */
const GRID_N_COLS: Record<string, number> = {
  "01": 5,
  "02": 6,
  "03": 4,
};

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
  captionBand = false,
  className = "",
}: {
  item: { org?: string | null; thumb?: string | null; title?: string; desc?: string };
  /** measured slide-item box from the crawl (px) */
  w?: number | null;
  h?: number | null;
  /** stretch to the grid cell (grid layout) */
  fill?: boolean;
  /**
   * imweb certificate-card layout (rnd.patents): a 3:4 image area with a
   * centered caption band below it instead of the absolute hover overlay.
   * Measured on the live original: `.item_container` = 1px #eee border on a
   * #f6f6f6 ground, `.img_wrap` 288x384 (i.e. 3:4, so it scales down to
   * 171x228 at mobile) + `.text_wrap` 288x66 (20px padding, centered 16px
   * #212121 title). Opt-in per widget so the USP (rnd/rnd.technology) and the
   * company.about grids keep the overlay-card markup byte-for-byte.
   */
  captionBand?: boolean;
  className?: string;
}) {
  const src = item.org || item.thumb;
  if (!src) return null;
  const boxStyle = !fill && (w || h) ? { width: w ? `${w}px` : undefined, height: h ? `${h}px` : undefined } : undefined;
  if (captionBand) {
    return (
      <figure
        className={`relative flex flex-col overflow-hidden border border-[#eee] bg-[#f6f6f6] ${
          fill ? "h-full" : "shrink-0"
        } ${className}`}
        style={boxStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={item.title || ""}
          className="aspect-[3/4] w-full object-cover min-[992px]:aspect-auto min-[992px]:min-h-0 min-[992px]:flex-1"
          loading="lazy"
        />
        <figcaption className="flex min-h-[66px] shrink-0 flex-col items-center justify-center px-[20px] py-[20px] text-center">
          {item.title && <p className="text-[16px] font-normal leading-[1.6] text-[#212121]">{item.title}</p>}
          {item.desc && <p className="text-[14px] leading-[1.6] text-[#212121]">{item.desc}</p>}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure
      className={`group relative overflow-hidden bg-soft ${fill ? "h-full" : "shrink-0"} ${className}`}
      style={boxStyle}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={item.title || ""}
        className={fill || (w && h) ? "h-full w-full object-cover" : "aspect-square w-full object-cover"}
        loading="lazy"
      />
      {/* D9b: original `show_over` widget keeps `.text_wrap` at opacity 0 and
          fades the white caption in on hover (transition all .3s) with no dark
          scrim/zoom — measured on /17. */}
      {(item.title || item.desc) && (
        <figcaption className="absolute inset-x-0 bottom-0 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
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
    if (key === "margin") {
      // imweb emits the shorthand (`margin: 1px auto`, `margin: 86px auto`);
      // expand it against the CSS 1/2/3/4-value rules so the vertical offsets
      // survive (the longhand whitelist below never saw them). `auto` is left
      // unset — for an inline-block img it is a no-op anyway.
      const p = val.split(/\s+/).filter(Boolean);
      const [t, r = t, b = t, l = r] = p;
      const set = (prop: string, nv?: string) => {
        if (nv && nv !== "auto" && !nv.includes("inherit")) inlineStyle[prop] = nv;
      };
      set("margin-top", t);
      set("margin-right", r);
      set("margin-bottom", b);
      set("margin-left", l);
      return;
    }
    if (
      ["width", "height", "margin-top", "margin-left", "margin-right", "margin-bottom", "display"].includes(key) &&
      val &&
      !val.includes("inherit") &&
      !val.includes("visibility") &&
      // SC4: mobile_section crops carry `width: 0px; height: 0px` (imweb's
      // mobile placeholder); keeping them pins the <img> to 0 locally. Drop a
      // zero width/height so the image sizes from its natural aspect instead.
      !((key === "width" || key === "height") && /^0(?:px|%)?$/i.test(val))
    ) {
      inlineStyle[key] = val;
    }
  });
  if (!inlineStyle.width) inlineStyle.width = "100%";
  if (hasOverlay) inlineStyle.width = "100%";
  // RC5: source desktop-pixel dimensions must stay unclamped at >=992 (the
  // images are deliberate crops), but below 992 they overflow the 390 column.
  // Re-apply the desktop max-width/height only at >=992 and let the mobile
  // preflight (`img { max-width:100%; height:auto }`) scale them down. The fixed
  // height moves into a CSS var so it does not pin the mobile box.
  // SC4: a `width/height: 0px` pair must not count as a desktop crop either.
  const desktopSized =
    !!w.imgStyle && /(width|height)\s*:\s*(?!100%)(?!0(?:px|%)?\s*(?:;|$))/.test(w.imgStyle);
  let desktopHeight: string | null = null;
  if (desktopSized) {
    const hm = w.imgStyle?.match(/(?:^|;)\s*height\s*:\s*(-?[\d.]+)px/);
    if (hm && parseFloat(hm[1]) !== 0) {
      desktopHeight = `${parseFloat(hm[1])}px`;
      delete inlineStyle.height;
    }
  }
  const imgClass = `block${desktopSized ? " " + IMG_DESKTOP_MAX_NONE : ""}${desktopHeight ? " " + IMG_DESKTOP_HEIGHT : ""}`;
  const imgStyle = desktopHeight
    ? ({ ...inlineStyle, ["--img-h" as string]: desktopHeight } as React.CSSProperties)
    : inlineStyle;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={w.src || ""} alt={title || w.alt || ""} className={imgClass} style={imgStyle} loading="lazy" />
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
            className="absolute inset-0 bg-cover bg-center opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ backgroundImage: `url(${w.hoverBg})` }}
            aria-hidden
          />
        )}
        <div className="absolute inset-0 flex flex-col items-start justify-end p-5 opacity-0 group-hover:opacity-100">
          {label && <p className="text-[18px] leading-[1.2] text-white">{label}</p>}
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
      <div
        className={`relative w-full overflow-hidden${h ? " " + BOX_DESKTOP_HEIGHT : ""}`}
        style={h ? ({ ["--box-h" as string]: `${h}px` } as React.CSSProperties) : undefined}
      >
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

export function Widget({
  w,
  locale = defaultLocale,
  nested = false,
  vGutter = false,
}: {
  w: WidgetNode;
  locale?: Locale;
  nested?: boolean;
  vGutter?: boolean;
}) {
  const content = w.type === "padding" ? renderPadding(w) : WidgetContent({ w, locale });
  if (!content) return null;
  // imweb `.doz_sys .inside .widget { margin: 15px 0 }` applies to *every*
  // widget, cancelled for sections carrying `grid_v_gutter_0`. Images keep the
  // gutter at every width (existing behaviour). Plain text widgets now get it
  // too — this is the PROBE A systemic ~15px sub-hero caption offset: the
  // below-hero text widget was 15px high because only nested images received
  // the margin. Cover cards (`text_bg_img`) are excluded because
  // globals.css:108 already gives `.rich-text:has(> .text_bg_img)` a 15px
  // margin (double-guttering them to 30px).
  // The text gutter is gated to >=992 so the mobile layout does not gain a new
  // 15px margin (desktop measurement only; the row min-height already reserves
  // the space at desktop, where the fix targets below-hero h6 top y = 546.8).
  const imageGutter = w.type === "image" && nested && vGutter;
  const textGutter = vGutter && w.type === "text" && !/text_bg_img/.test(w.html || "");
  const margin = imageGutter
    ? "mt-[15px] mb-[15px]"
    : textGutter
      ? "min-[992px]:mt-[15px] min-[992px]:mb-[15px]"
      : "";
  const tagged = (
    <div data-widget-type={w.type} className={margin || undefined}>
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
          <GallerySlider count={items.length}>
            {items.map((it, i) => (
              <GalleryCard
                key={i}
                item={it}
                w={meta2.itemW || 238}
                h={meta2.itemH}
                className="snap-start"
              />
            ))}
          </GallerySlider>
        );
      }
      // grid layout: column count from imweb's `grid_0N` preset (see
      // GRID_N_COLS) or an explicit crawled `gridCols`; cells stretch to the
      // row's measured min-height, images fill them
      const measured = w as unknown as {
        gridRowH?: number;
        gridGap?: number;
        gridCols?: number;
        captionBand?: boolean;
      };
      const cols = Math.max(1, Math.min(6, measured.gridCols ?? GRID_N_COLS[meta2.gridN ?? ""] ?? 4));
      // imweb's `grid_03` renders 4 columns at desktop, where each item is a
      // 320px cell with 15px padding (290px card + 30px gutters). The measured
      // override pins that card height so the grid holds its shape before the
      // lazy images load — otherwise every cell collapses to 0 and whole
      // galleries go blank (the patents empty block).
      // `grid-cols-4!` MUST keep the important flag: Tailwind emits the
      // `min-[992px]` block before the `sm:` (40rem) block in the stylesheet, so
      // at 1440 the same-specificity `sm:grid-cols-3` otherwise wins and wraps
      // the galleries into 3 columns (+1402px page height).
      if (typeof measured.gridRowH === "number" && measured.gridRowH > 0) {
        const gc = Math.max(1, Math.min(6, measured.gridCols ?? 4));
        return (
          <div
            className={`grid grid-cols-2 gap-[10px] sm:grid-cols-3 min-[992px]:mt-[15px] ${GRID_COLS_CLASS[gc] ?? GRID_COLS_CLASS[4]} min-[992px]:gap-[var(--ggap)] min-[992px]:py-[15px] min-[992px]:auto-rows-[var(--growh)]`}
            style={{
              ["--ggap" as string]: `${measured.gridGap ?? 30}px`,
              ["--growh" as string]: `${measured.gridRowH}px`,
            }}
          >
            {items.map((it, i) => (
              <GalleryCard key={i} item={it} fill captionBand={measured.captionBand === true} />
            ))}
          </div>
        );
      }
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
      const html = w.html || "";
      const isTop = w.href === "#doz_header" || /icon-arrow-up/.test(html);
      const isPlus = /bt-plus|icon-plus|plus/.test(html);
      const internalHref = w.href && !/^https?:/i.test(w.href) && !w.href.startsWith("#") ? routeForSource(w.href) : null;
      const dest = internalHref ? localeHref(locale, internalHref) : w.href || "#";
      return (
        <div className="text-right">
          <Link
            href={dest}
            aria-label={w.text || "button"}
            className="inline-flex items-center justify-center rounded-full bg-[#f7f7f7] p-[14px] text-[rgba(0,0,0,0.15)] transition-all duration-300 hover:bg-transparent hover:text-accent"
          >
            {isTop && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            )}
            {!isTop && isPlus && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </Link>
        </div>
      );
    }
    case "board":
      // board widgets are handled explicitly by their page components
      return <div data-board-ref={w.ref} data-board-cls={w.listCls} />;
    case "form":
      // the imweb POST form has no live backend — static rebuild instead
      return <InquiryForm locale={locale} />;
    case "sitemap-links": {
      // footer sitemap sub-links injected from the nav tree (the crawl
      // missed them): 14px #959595, matching the live original
      const links = (w as unknown as { links?: { name: string; href: string }[] }).links || [];
      if (links.length === 0) return null;
      return (
        <ul>
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block text-[14px] leading-[1.6] text-[#959595]"
              >
                {l.name}
              </Link>
            </li>
          ))}
        </ul>
      );
    }
    default:
      return w.html ? <RichText html={w.html} /> : null;
  }
}

/* ---------------- layout walker ---------------- */

export function Rows({
  rows,
  locale = defaultLocale,
  nested = false,
  wdepth = 0,
  vGutter = false,
}: {
  rows: Node[];
  locale?: Locale;
  nested?: boolean;
  /** depth of the row that owns these direct widget children (0 = top level) */
  wdepth?: number;
  vGutter?: boolean;
}) {
  const out: React.ReactNode[] = [];
  rows.forEach((n, i) => {
    if (isRow(n)) {
      out.push(<Row key={i} r={n} locale={locale} nested={nested} wdepth={wdepth + 1} vGutter={vGutter} />);
    } else if (isWidget(n)) {
      out.push(
        <div key={i}>
          <Widget w={n} locale={locale} nested={wdepth > 0} vGutter={vGutter} />
        </div>,
      );
    } else if (n.kind === "col") {
      out.push(
        <div key={i} className={colClass(n.grid)}>
          <Rows rows={n.children} locale={locale} nested={nested} wdepth={wdepth} vGutter={vGutter} />
        </div>,
      );
    }
  });
  return <>{out}</>;
}

export function Row({
  r,
  locale = defaultLocale,
  nested = false,
  wdepth = 0,
  vGutter = false,
}: {
  r: RowNode;
  locale?: Locale;
  nested?: boolean;
  wdepth?: number;
  vGutter?: boolean;
}) {
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
  // five equal cols (footer sitemap) can't split a 12-grid evenly — use grid-cols-5
  const fiveCol = cols.length === 5 && cols.every((c) => (parseInt(c.grid, 10) || 0) === 1);
  return (
    <div className={`imweb-row grid grid-cols-1 ${fiveCol ? "lg:grid-cols-5" : "lg:grid-cols-12"}`} style={rowVars}>
      {cols.map((c, i) => (
        <div key={i} className={`imweb-col ${fiveCol ? "" : SPAN_CLASS[c.span] || colClass(c.grid)}`}>
          <Rows rows={c.children} locale={locale} nested wdepth={wdepth} vGutter={vGutter} />
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

/* ---------------- responsive section toggle (RC1) ---------------- */

/**
 * imweb authors every page as two section sets toggled at the 992px breakpoint:
 * `pc_section.mobile_hide` (hidden below 992) and `mobile_section` (shown below
 * 992, hidden above). The crawl keeps both; render one per viewport instead of
 * dropping the mobile set. Whole-token match: excludes `mobile_section` but not
 * the `mobile_section_first` marker.
 */
export const MOBILE_SECTION = /(^|\s)mobile_section(\s|$)/;
/** sections imweb hides below the 992px breakpoint */
export const MOBILE_HIDE = /(^|\s)mobile_hide(\s|$)/;

/** `min-[992px]` literal classes (Tailwind only emits classes it can see as text) */
const MOBILE_ONLY_CLASS = "min-[992px]:hidden";
const DESKTOP_ONLY_CLASS = "hidden min-[992px]:block";
const IMG_DESKTOP_MAX_NONE = "min-[992px]:max-w-none";
const IMG_DESKTOP_HEIGHT = "min-[992px]:h-[var(--img-h)]";
/**
 * RC5: the crawl's fixed `boxStyle` height is a desktop measurement. Keep it at
 * >=992 via a CSS var, but let the mobile box size to the clamped image (imweb
 * recomputes the box at 390). Without this the wrapper stays e.g. 509px tall
 * while its image shrinks to 144px, so the org chart / HQ map sections keep
 * their desktop height.
 */
const BOX_DESKTOP_HEIGHT = "min-[992px]:h-[var(--box-h)]";

/** imweb page-title hero markers: `_section_first` (desktop) / `mobile_section_first` (mobile) */
const PAGE_HERO = /(^|\s)(_section_first|mobile_section_first)(\s|$)/;

/**
 * True when the section is the imweb page-title hero band the rebuild replaces
 * with <PageHero> — detected by the first-section marker or a `menu_title`
 * widget. Used per channel so the mobile hero band is dropped at mobile too.
 */
export function isPageHeroSection(sec: Section): boolean {
  if (PAGE_HERO.test(sec.cls || "")) return true;
  let found = false;
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (found) return;
      if (n.kind === "widget" && n.type === "menu_title") found = true;
      else if (n.kind === "row") n.cols.forEach((c) => walk(c.children));
      else if (n.kind === "col") walk(n.children);
    }
  };
  walk(sec.rows);
  return found;
}

/**
 * imweb `side_left`/`side_right` sections render `doz_aside` (a left/right
 * column) + a `side_gutter` + the content `inside`. The crawl keeps only the
 * content rows, so the geometry is reconstructed from the content row width:
 * the section `main` is a 1280px table, therefore the aside occupies
 * `1280 - contentW` (e.g. philosophy 1280-950=330, history 1280-640=640).
 */
type AsideBlock = { pt?: number; gap?: number; items?: WidgetNode[] };

function AsideColumn({
  asideW,
  aside,
  locale,
  vGutter,
}: {
  asideW: number;
  aside?: AsideBlock;
  locale: Locale;
  vGutter: boolean;
}) {
  const items = aside?.items || [];
  return (
    <div
      className="hidden min-[1280px]:block min-[1280px]:w-[var(--aside-w)] min-[1280px]:shrink-0 min-[1280px]:pl-[15px] min-[1280px]:pt-[var(--aside-pt)]"
      style={
        {
          ["--aside-w" as string]: `${asideW}px`,
          ["--aside-pt" as string]: `${aside?.pt ?? 15}px`,
          ["--aside-gap" as string]: `${aside?.gap ?? 30}px`,
        } as React.CSSProperties
      }
    >
      {items.length > 0 && (
        <div className="flex flex-col gap-[var(--aside-gap)]">
          {items.map((n, i) => (
            <div key={i}>
              <Widget w={n} locale={locale} nested={false} vGutter={vGutter} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  // RC1: keep both the pc and mobile section sets — visibility is resolved per
  // breakpoint below instead of dropping the mobile set here.
  const list = sections.filter((s) => !skip.has(s.id) && sectionHasContent(s));
  return (
    <div>
      {list.map((sec) => {
        const cls = sec.cls || "";
        // mobile_section → mobile only; pc + mobile_hide → desktop only
        const mobileOnly = MOBILE_SECTION.test(cls);
        const desktopOnly = !mobileOnly && MOBILE_HIDE.test(cls);
        const visibility = mobileOnly ? MOBILE_ONLY_CLASS : desktopOnly ? DESKTOP_ONLY_CLASS : "";
        const side = /\bside_(left|right)\b/.exec(cls)?.[1] ?? null;
        const rowWs = sec.rows
          .filter((r): r is RowNode => r.kind === "row")
          .map((r) => r.w)
          .filter((n): n is number => typeof n === "number" && n > 0);
        const contentW = rowWs.length ? Math.max(...rowWs) : 0;
        // a side layout only offsets the content when the content column is
        // narrower than the 1280 main; side_basic / no-token sections keep the
        // existing centred rows untouched
        const isSide = !!side && contentW > 0 && contentW < 1280;
        const asideW = isSide ? 1280 - contentW : 0;
        // imweb `.inside .widget` gets 15px vertical margins unless the section
        // disables the vertical gutter (`grid_v_gutter_0`, e.g. all of home)
        const vGutter = !/(^|\s)grid_v_gutter_0(\s|$)/.test(cls);
        const aside = (sec as unknown as { aside?: AsideBlock }).aside;
        return (
          <section key={sec.id} className={`relative${visibility ? " " + visibility : ""}`}>
            {(sec.bg || urlFromStyle(sec.bgStyle)) && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url(${sec.bg || urlFromStyle(sec.bgStyle)})`,
                  // imweb `.section_bg.fixed_bg_wrap` heroes pin the image to the
                  // viewport (computed background-attachment: fixed); the visible
                  // crop is ~79.6% vs ~50% when scrolled, so match the original.
                  ...(sec.bgFixed ? { backgroundAttachment: "fixed" } : {}),
                }}
                aria-hidden
              />
            )}
            {sec.bgColor && <div className="absolute inset-0" style={{ backgroundColor: sec.bgColor }} aria-hidden />}
            <div
              className={
                isSide
                  ? "relative min-[1280px]:mx-auto min-[1280px]:flex min-[1280px]:max-w-[1280px]"
                  : "relative"
              }
            >
              {isSide && side === "left" && (
                <AsideColumn asideW={asideW} aside={aside} locale={locale} vGutter={vGutter} />
              )}
              <div
                className={isSide ? "min-[1280px]:w-[var(--content-w)] min-[1280px]:shrink-0" : undefined}
                style={isSide ? ({ ["--content-w" as string]: `${contentW}px` } as React.CSSProperties) : undefined}
              >
                {sec.rows
                  .filter((r) => r.kind === "row")
                  .map((r, i) => (
                    <Row key={i} r={r as RowNode} locale={locale} nested={false} wdepth={0} vGutter={vGutter} />
                  ))}
              </div>
              {isSide && side === "right" && (
                <AsideColumn asideW={asideW} aside={aside} locale={locale} vGutter={vGutter} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
