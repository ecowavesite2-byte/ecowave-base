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

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

/**
 * Residual #1: imweb's `.table-responsive` wrapper is `overflow-x:auto` with
 * `nowrap` cells, so the authored 991px R&D table scrolls inside the 360px
 * mobile column instead of wrapping (measured live on /21: wrapper `overflow-x:
 * auto`, cell `white-space: nowrap`, table 991px wide, row pitch 93px). The
 * local rebuild dropped both rules, squeezing the table to 360px and doubling
 * every row (pitch 181). globals.css is owned by another lane, so inject the
 * two rules inline on the wrapper (the only element carrying the class); the
 * `nowrap` inherits to the cells. Desktop is unaffected — 991px fits the
 * desktop column, where both sides already render the table unwrapped.
 */
const TABLE_HORIZONTAL_MOBILE_CSS =
  "<style>@media (max-width:991px){" +
  ".pc-at-mobile .rich-text table.tableHorizontal:not(.tableHover) td," +
  ".pc-at-mobile .rich-text table.tableHorizontal:not(.tableHover) th{padding:20px;line-height:24px}" +
  '.pc-at-mobile .rich-text table.tableHorizontal:not(.tableHover) span[style*="font-size: 18px"]{font-size:15px !important}' +
  '.pc-at-mobile .rich-text table.tableHorizontal:not(.tableHover) span[style*="font-size: 16px"]{font-size:14px !important}' +
  // imweb's `.table-responsive` wrapper keeps bootstrap's `margin-bottom:15px`
  // at mobile (measured live on rnd §2: wrapper h281 with `margin:0 0 15px`,
  // local had `margin:0`). Only rnd/rnd.technology author `.table-responsive`.
  ".pc-at-mobile .rich-text .table-responsive{margin-bottom:15px}" +
  "}</style>";

function fixResponsiveTables(html: string): string {
  const out = html.replace(
    /class="([^"]*\btable-responsive\b[^"]*)"/g,
    'class="$1" style="overflow-x:auto;overflow-y:hidden;white-space:nowrap;"',
  );
  // Mobile `tableHorizontal` cell metrics (rnd / rnd.technology §§2–4). Measured
  // live at 390 against the originals: their cells are `padding:20px` with
  // `line-height:24px`, and the pc-at-mobile runtime downscales the authored
  // 18px -> 15px and 16px -> 14px text (row pitch 72/125/153; local 50/113/145).
  // Only rnd/rnd.technology author `tableHorizontal` WITHOUT `tableHover` —
  // rnd.facilities uses `tableHover tableHorizontal` and its 8px padding already
  // matches — so the rule is inert on every other page and on desktop (the
  // whole block is behind `max-width:991px`). Verified live before editing:
  // rnd §3 1270 -> 1378 (orig 1371), §4 1239 -> 1323 (orig 1316) and the §2
  // table 221 -> 281 = the original exactly (rows 94/93/93).
  return /class="[^"]*\btableHorizontal\b/.test(out) ? TABLE_HORIZONTAL_MOBILE_CSS + out : out;
}

/**
 * Image widgets carry overlay labels encoded in their `alt` attribute in two
 * authored shapes (both measured live on the home originals):
 *
 *  - desktop `img-title` (home §2 pc pillar cards):
 *      `<div class="img-title"><div class="top-t"><P>Company</P></div><h5>회사소개</h5></div>
 *       <span class="material-symbols-outlined">add</span>`
 *    → label "Company" (18px) ABOVE title "회사소개" (40px) plus a 30px "+".
 *  - mobile (home §회사소개 mobile_section pillar cards):
 *      `<h5>회사소개</h5><span>Company</span>`
 *    → title "회사소개" (25px) ABOVE label "Company" (18px), no "+".
 *
 * Both are visible **at rest** on the original (`.overlay` scrim
 * rgba(0,0,0,0.3) opacity 1 + white labels), not hover-only. The `layout`
 * field selects the label order / type scale / alignment.
 */
function parseImageAlt(alt?: string): {
  label: string;
  title: string;
  plus: boolean;
  layout: "desktop" | "mobile" | "none";
  hasOverlay: boolean;
} {
  if (!alt) return { label: "", title: "", plus: false, layout: "none", hasOverlay: false };
  const html = decodeEntities(alt);
  if (/img-title/i.test(html)) {
    const label = stripTags(html.match(/top-t[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
    const title = stripTags(html.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)?.[1] || "");
    const plus = /material-symbols-outlined/i.test(html);
    return { label, title, plus, layout: "desktop", hasOverlay: true };
  }
  // mobile pillar cards: `<h5>회사소개</h5><span>Company</span>` (the en locale
  // sometimes omits the English `<span>`)
  const title = stripTags(html.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)?.[1] || "");
  if (!title) return { label: "", title: "", plus: false, layout: "none", hasOverlay: false };
  const spans = [...html.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => stripTags(m[1])).filter(Boolean);
  return { label: spans[0] || "", title, plus: false, layout: "mobile", hasOverlay: true };
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

function ImageWidget({ w, locale, mobileBox = false }: { w: WidgetNode; locale: Locale; mobileBox?: boolean }) {
  const h = num(w.boxStyle, "height");
  const { label, title, plus, layout, hasOverlay } = parseImageAlt(w.alt);

  // S1: imweb's scroll-to-top button (`.btn_top a[href="#doz_header"]`) is
  // crawled with `width:0;height:0;margin:21px auto`; the runtime then paints
  // the 90px source at 41x41 inside the original 56px band. The generic
  // zero-size drop below would instead stretch it to the full mobile column
  // (`width:100%`), ending every non-products page with a 390x390 icon
  // (+376px). Real content band images (company.history year bands, home
  // category cards) carry `margin-left/right:auto` with no `#doz_header` link,
  // so they keep the zero-size drop.
  const isScrollTop =
    (w.href || "").includes("#doz_header") && /margin\s*:\s*21px\s+auto/i.test(w.imgStyle || "");

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
  if (isScrollTop) {
    // pin the measured original geometry: a 41x41 icon vertically centred in
    // the original 56px band (live probe: section top 748.1, icon top 755.6 →
    // 7.5px gutter; 15px would push it to the band's bottom edge)
    inlineStyle.width = "41px";
    inlineStyle.height = "41px";
    inlineStyle["margin-top"] = "7.5px";
    delete inlineStyle["margin-bottom"];
  } else if (!inlineStyle.width) {
    inlineStyle.width = "100%";
  }
  if (hasOverlay) inlineStyle.width = "100%";
  // MB4: a `mobile_section` image is re-fit by imweb's mobile runtime to the
  // 390 column — the probe measures `width:100%` with the natural height, and
  // the authored box clips it (company.about `196f5234277f5.jpg`: img 360x433 in
  // a 318 box). The crawled `imgStyle` is instead the DESKTOP runtime state: a
  // portrait crop (`width:auto; height:100%`) plus a large negative
  // `margin-left`. Applied at mobile that paints only the sliver left of the
  // box (local card x15-146 vs the original x15-374). Drop the crop
  // offsets/height and fill the box, exactly like the original mobile runtime.
  const isMobileCrop =
    /margin(?:-left|-right)?\s*:\s*-/.test(w.imgStyle || "") || /width\s*:\s*auto/i.test(w.imgStyle || "");
  if (mobileBox && isMobileCrop) {
    inlineStyle.width = "100%";
    delete inlineStyle.height;
    delete inlineStyle["margin-left"];
    delete inlineStyle["margin-right"];
  }
  // item 3 — EN home §3 (물을 깨끗하게 / Healthy water): a `mobile_section`
  // image widget whose crawl style is a zero-size desktop placeholder
  // (`width:0;height:0;margin:335px auto`). The split-loop above expands the
  // shorthand and keeps the two 335px vertical margins, inflating the widget
  // from 720 to 1390 and the section from 1010 to 1680 (EN original 1029/699).
  // imweb's mobile runtime re-lays the image out and drops them (measured live:
  // the original img computes 335x670 with `margin:0`). Drop the placeholder's
  // vertical margins; `isScrollTop` (the back-to-top overlay, same zero-size +
  // `margin:21px auto` shape) sets its own margins below and is excluded.
  const isZeroPlaceholder =
    mobileBox &&
    /width\s*:\s*0(?:px)?\b/.test(w.imgStyle || "") &&
    /height\s*:\s*0(?:px)?\b/.test(w.imgStyle || "");
  if (isZeroPlaceholder && !isScrollTop) {
    delete inlineStyle["margin-top"];
    delete inlineStyle["margin-bottom"];
  }
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
      // Both overlay formats show at rest on the original: a `rgba(0,0,0,0.3)`
      // scrim plus white labels. Desktop cards centre their 18/40px label+title
      // block in a 114px column inside a 20px-rounded frame; mobile cards stack
      // the 25px title over the 18px label bottom-left inside a 7px-rounded
      // frame. The image is a `cover`/`center` background layer, which also
      // reproduces the original mobile crop (a 480x644 source vertically
      // centred in the 179px band).
      <div
        className={`group relative w-full overflow-hidden bg-soft ${
          layout === "desktop" ? "rounded-[20px]" : "rounded-[7px]"
        }`}
        style={h ? { height: h } : undefined}
      >
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
        {/* measured `.overlay` layer, visible at rest */}
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.3)]" aria-hidden />
        {layout === "desktop" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-5">
            <div className="w-[114px] text-left">
              {label && <p className="text-[18px] leading-[1.2] text-white">{label}</p>}
              {title && <h3 className="mt-[9px] text-[40px] leading-[1.2] font-bold text-white">{title}</h3>}
              {plus && (
                <span className="mt-[12px] block text-[30px] leading-none text-white">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-start justify-end p-5">
            {title && <h3 className="text-[25px] leading-[1.5] font-bold text-white">{title}</h3>}
            {label && <p className="mt-[12px] text-[18px] leading-[1.2] text-white">{label}</p>}
          </div>
        )}
      </div>
    ) : (
      <div
        className={`relative w-full overflow-hidden${mobileBox ? " rounded-[6px]" : ""}${
          mobileBox && isMobileCrop ? " flex items-center" : ""
        }${h ? " " + (mobileBox ? BOX_MOBILE_HEIGHT : BOX_DESKTOP_HEIGHT) : ""}`}
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

/**
 * Resolve the effective reveal direction for a widget.
 *
 * imweb authors these cards as `fadeInUp` and its runtime then remaps the
 * direction via an extra class the crawler dropped:
 *   `._widget_data.fadeInUp.Right { animation-name: fadeInLeft }`,
 *   `.Left → fadeInRight`, `.Down → fadeInDown`.
 * The current crawl JSON has no direction field (verified: 0 matches), so the
 * measured stop-gap below is an id → animation-name map for the two affected
 * home sections:
 *   - desktop §7 `s20250811004ea868d7376` — Company / R&D / Products / PR Center
 *     cards (all authored `Right` on the live original).
 *   - mobile §회사소개 `s20250911281117781b494` — the four cards alternate
 *     `Right` / `Left` (measured at 390).
 *   - desktop §7 HQ `s202508112787439deffdb` — the three address holder cards
 *     (KOR/CHN/KHM) and the §8 ticker "+" button (`s2025081139ff276cae8d6`) are
 *     authored `Left` → `fadeInRight`.
 *
 * Durable fix: teach the crawler to record the widget's direction class as
 * `animDir: "Left" | "Right" | "Down" | null`; then the branch below mirrors the
 * original's injected rule and the id map can be deleted.
 */
const ANIM_DIR_OVERRIDES: Record<string, string> = {
  // home §7 desktop pillar cards (all `Right`)
  w20250811c8b38b2e2cde9: "fadeInLeft",
  w20250811d66d9ca495dfe: "fadeInLeft",
  w202508114adeb9816c562: "fadeInLeft",
  w20250811dc0392f259c1d: "fadeInLeft",
  // home §회사소개 mobile cards (alternating Right/Left)
  w202509119ecb84eb6e940: "fadeInLeft",
  w2025091149bbbec8e797d: "fadeInRight",
  w20250911cb710bccd6323: "fadeInLeft",
  w20250911edd80efa0562b: "fadeInRight",
  // home §7 (Headquarters & Factory Locations) holder cards — the three
  // address cards (KOR / CHN / KHM) are authored `fadeInUp` but carry the
  // dropped `.Left` class, so the original remaps them to `fadeInRight`
  // (`translate3d(60%,0,0)`). Live probe (1440 + 390): animation-name
  // `fadeInRight`, 1.2s ease, delays 0.2/0.3/0.4, fill both.
  w202508128d2c07927c2ff: "fadeInRight",
  w2025081223442f1bcc005: "fadeInRight",
  w20250812061e68ea9a22d: "fadeInRight",
  // home §8 Notice ticker round "+" button — authored `fadeInUp` with the
  // dropped `.Left` class on its inner `.inline-blocked` wrap; the original
  // remaps it to `fadeInRight` (0.7s ease, delay 0). Desktop-only in practice
  // (the local mobile ticker hides the button column).
  w2025081232232779d83d2: "fadeInRight",
};

function effectiveAnim(w: WidgetNode): string | undefined {
  // durable path — inert until the crawler writes `animDir`
  const dir = (w as unknown as { animDir?: string | null }).animDir;
  if (dir && w.anim === "fadeInUp") {
    if (dir === "Right") return "fadeInLeft";
    if (dir === "Left") return "fadeInRight";
    if (dir === "Down") return "fadeInDown";
  }
  // stop-gap id map for the sections whose direction the crawl dropped
  return ANIM_DIR_OVERRIDES[w.id] ?? w.anim;
}

export function Widget({
  w,
  locale = defaultLocale,
  nested = false,
  vGutter = false,
  mobileBox = false,
  topBand = false,
  mobileBand = false,
}: {
  w: WidgetNode;
  locale?: Locale;
  nested?: boolean;
  vGutter?: boolean;
  /** MB1: this widget lives in a `mobile_section`; apply its box height on mobile */
  mobileBox?: boolean;
  /** this widget's section is in TOP_BAND_SECTION_IDS; band its top-level widgets at mobile */
  topBand?: boolean;
  /** this widget's section is in MOBILE_SECTION_BAND_IDS; band all its widgets at mobile */
  mobileBand?: boolean;
}) {
  const content = w.type === "padding" ? renderPadding(w) : WidgetContent({ w, locale, mobileBox });
  if (!content) return null;
  // imweb `.doz_sys .inside .widget { margin: 15px 0 }`, cancelled for sections
  // carrying `grid_v_gutter_0`. Scoped to image widgets only: applying it to
  // text widgets double-counts the gutter (our section/row spacing already
  // reproduces it), which measurably grew desktop heights by +30px per text
  // widget (+18..+563px per page). PROBE A's ~15px sub-hero caption offset is a
  // positional residual, not a size mismatch — do not re-add the text gutter
  // without removing the compensating spacing elsewhere.
  //
  // Measured live at 390 (home §2 회사소개 pillar cards): every `.widget.image`
  // in a `mobile_section` carries `margin: 7.5px 0` — the 4 card rows are 194px
  // (179 box + 15 band), the section 882 vs local 807 (−75). The band applies to
  // the mobile-authored widgets too (they are top-level, `nested` false), so it
  // is gated on `mobileBox`. Verified by DOM simulation: home §2 807→867,
  // history §2/§5/§8 298/255/255→313/270/270 (originals 328/270/270), about §3
  // 790→805 (orig 835); rnd/rnd.facilities/rnd.patents pc sections untouched.
  //
  // The pc-section nested band lives in NESTED_IMAGE_BAND / NESTED_TEXT_BAND
  // above (7.5px at mobile, images 15px at desktop); `text_bg_color` cards are
  // excluded because their own box already reproduces the band. The optional
  // top-level band (TOP_BAND_SECTION_IDS) is applied to non-padding top-level
  // widgets of the measured pc sections only.
  const margin =
    w.type === "image" && vGutter
      ? mobileBox
        ? "mt-[7.5px] mb-[7.5px]"
        : nested
          ? NESTED_IMAGE_BAND
          : topBand
            ? WIDGET_TOP_BAND
            : ""
      : mobileBox && mobileBand
        ? MOBILE_SECTION_BAND
        : !mobileBox && vGutter && nested && w.type === "text" && !/text_bg_color/.test(w.html || "")
          ? NESTED_TEXT_BAND
          : !mobileBox && vGutter && topBand && !nested && w.type !== "padding"
            ? WIDGET_TOP_BAND
            : "";
  const tagged = (
    <div data-widget-type={w.type} className={margin || undefined}>
      {content}
    </div>
  );
  if (w.anim && w.anim !== "none") {
    return (
      <Reveal
        anim={effectiveAnim(w)}
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

/**
 * Desktop card for `layout:"slide"` galleries. Measured on the live
 * company.about originals: the item box carries the authored width/height
 * plus a white background and `pad` padding (5px when captioned, 10px when
 * plain — the padding also supplies the 2x visual gutter between items since
 * the track drops its own gap); the image fills the remaining box. The
 * captioned variant adds an in-flow white title bar (padding 20px, 14px/1.6,
 * #212121, centered); the plain variant carries a 1px #eee border instead.
 * Mobile keeps the historic full-bleed hover-caption card, so every desktop
 * rule is `min-[992px]:` gated.
 */
function SlideCard({
  item,
  w,
  h,
  pad,
  titleBar,
  className = "",
}: {
  item: {
    org?: string | null;
    thumb?: string | null;
    title?: string | null;
    desc?: string | null;
  };
  w: number;
  h?: number | null;
  pad: number;
  titleBar: boolean;
  className?: string;
}) {
  const src = item.org || item.thumb || "";
  const padCls = pad >= 10 ? "min-[992px]:p-[10px]" : "min-[992px]:p-[5px]";
  const box = titleBar ? "" : "min-[992px]:border min-[992px]:border-[#eee]";
  return (
    <figure
      className={`group relative shrink-0 overflow-hidden bg-soft ${padCls} min-[992px]:flex min-[992px]:flex-col min-[992px]:bg-white ${box} ${className}`}
      style={{ width: w, height: h ?? undefined }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={item.title || ""}
        className="h-full w-full object-cover min-[992px]:h-auto min-[992px]:min-h-0 min-[992px]:flex-1"
        loading="lazy"
      />
      {item.title && (
        <figcaption className="absolute inset-x-0 bottom-0 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 min-[992px]:hidden">
          <h4 className="text-[14px] font-semibold text-white">{item.title}</h4>
          {item.desc && <p className="text-[12px] text-white/85">{item.desc}</p>}
        </figcaption>
      )}
      {titleBar && item.title && (
        // The captioned slide (company.about §4) renders its title bar in flow
        // BELOW the image at every width. Measured live on the original at 390:
        // `.item_container` 178x219 = `.img_wrap` 178x134 (3:4) + `.text_wrap`
        // 178x62/85, and `.text_wrap p.title` is `padding:20px`, 14px/22.4
        // (leading 1.6), centered, #212121. Previously this bar was desktop-only
        // (`hidden ... min-[992px]:flex`) so the mobile 2-up slides rendered with
        // no caption.
        <figcaption className="flex shrink-0 items-center justify-center bg-white px-[20px] py-[20px] text-center text-[14px] font-normal leading-[1.6] text-[#212121]">
          {item.title}
        </figcaption>
      )}
    </figure>
  );
}

function WidgetContent({ w, locale, mobileBox = false }: { w: WidgetNode; locale: Locale; mobileBox?: boolean }) {
  switch (w.type) {
    case "text":
      // `text-widget` mirrors imweb's `div[doz_type="text"]` scope: the original
      // applies an !important size-keyed line-height only inside text widgets,
      // so html/code widgets must not receive it (see app/globals.css).
      return <RichText html={fixResponsiveTables(w.html || "")} className="text-widget" />;
    case "image":
      return <ImageWidget w={w} locale={locale} mobileBox={mobileBox} />;
    case "gallery2": {
      const items = (w.items || []).filter((it) => it.org || it.thumb);
      if (items.length === 0) return null;
      const meta2 = w as unknown as { itemW?: number; itemH?: number; gridN?: string };
      if (w.layout === "slide") {
        // MB6: a mobile-authored slider shows one full-width slide with the
        // caption in flow below the image (measured on the live original, home
        // section s20250911db56ac49110f4: slide 365x362 image + `.text_wrap`
        // 122px, title strong 19px/30.4, desc 15px/24, left aligned). pc slide
        // galleries (company.about) keep the existing fixed-width hover card.
        if (mobileBox) {
          return (
            <GallerySlider count={items.length} autoplayMs={w.id === HOME_MOBILE_SLIDER_ID ? 5000 : 0}>
              {items.map((it, i) => (
                <figure key={i} className="w-full shrink-0 snap-start">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.org || it.thumb || ""}
                    alt={it.title || ""}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                  <figcaption className="px-[15px] pt-[13px] pb-[15px]">
                    {it.title && (
                      <p className="text-[19px] font-bold leading-[30.4px] text-black">{it.title}</p>
                    )}
                    {it.desc && <p className="text-[15px] leading-[24px] text-body">{it.desc}</p>}
                  </figcaption>
                </figure>
              ))}
            </GallerySlider>
          );
        }
        // Measured on the live originals (company.about galleries): the item
        // box carries the authored itemW/itemH plus a white background and
        // `pad` padding — 5px when the gallery is captioned, 10px when plain —
        // and the captioned variant adds an in-flow white title bar while the
        // plain one keeps the image only and gets the `nav_round` arrows. The
        // data itself is the discriminator (the crawl stores no nav/variant
        // field): titles present -> captioned, absent -> plain. Desktop-only —
        // every rule lives behind `min-[992px]:`, mobile keeps the historic
        // hover-caption card.
        const hasTitles = items.some((it) => (it.title || "").trim() !== "");
        const slidePad = hasTitles ? 5 : 10;
        return (
          <div className="min-[992px]:mt-[15px]">
            <GallerySlider count={items.length} pad={slidePad} arrows={!hasTitles}>
              {items.map((it, i) => (
                <SlideCard
                  key={i}
                  item={it}
                  w={meta2.itemW || 238}
                  h={meta2.itemH}
                  pad={slidePad}
                  titleBar={hasTitles}
                  className="snap-start"
                />
              ))}
            </GallerySlider>
          </div>
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
        // item 2/3 — mobile geometry of the measured gallery grids. Live 390
        // measurements of the originals (`.item_gallary` table-cells, padding on
        // all sides, adjacent cells so the gutter is 2x the padding):
        //  - rnd.patents certificates (`captionBand`): cell 7.5px -> 172.5px
        //    cards, 310.59px row pitch.
        //  - rnd / rnd.technology §5 USP (no captions): cell 3.75px -> 176.25px
        //    cards, 183.5px row pitch.
        // The local mobile grid used `grid-cols-2 gap-[10px]` for both, so the
        // cards and the outer vertical band were off. These literals restore the
        // measured gutters + outer band; `min-[992px]:gap/py` still win at
        // desktop and the gate keeps the two grid shapes apart.
        // Simulated on the running build: rnd.patents §2 3773 -> 3821 (orig
        // 3820); rnd §5 (with the top band below) 728.59 -> 779.84 (orig 779.09).
        const mobileGrid = measured.captionBand === true
          ? " max-[991.98px]:gap-[15px] max-[991.98px]:py-[7.5px]"
          : " max-[991.98px]:gap-[7.5px] max-[991.98px]:py-[3.75px]";
        return (
          <div
            className={`grid grid-cols-2 gap-[10px] sm:grid-cols-3 min-[992px]:mt-[15px] ${GRID_COLS_CLASS[gc] ?? GRID_COLS_CLASS[4]} min-[992px]:gap-[var(--ggap)] min-[992px]:py-[15px] min-[992px]:auto-rows-[var(--growh)] ${mobileGrid}`}
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
      const clean = fixResponsiveTables((w.html || "").replace(/<link[^>]*>/g, "").trim());
      return clean ? <div dangerouslySetInnerHTML={{ __html: clean }} /> : null;
    }
    case "video":
      // MB5: a `mobile_section` video is injected by imweb's mobile runtime and
      // sized to the 16:9 holder (measured on the live original, home section
      // s20250911ce32ed6fec574: `.img_box`/iframe = 360x202.5). The crawled
      // `html` is the pre-JS 0-height holder, so it renders nothing locally.
      // Render the iframe directly for mobile sections; the pc `mobile_hide`
      // video (desktop channel) keeps the html path byte-identical.
      if (mobileBox && w.src) {
        return <iframe src={w.src} className="aspect-video w-full" allowFullScreen title="video" />;
      }
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
            className={`inline-flex items-center justify-center rounded-full bg-[#f7f7f7] p-[14px] text-[rgba(0,0,0,0.15)] transition-all duration-300 hover:bg-transparent hover:text-accent ${
              isPlus && !isTop ? "text-[17px]" : ""
            }`}
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
  mobileBox = false,
  topBand = false,
  mobileBand = false,
}: {
  rows: Node[];
  locale?: Locale;
  nested?: boolean;
  /** depth of the row that owns these direct widget children (0 = top level) */
  wdepth?: number;
  vGutter?: boolean;
  /** MB1: propagate the mobile-authored box height from the owning section */
  mobileBox?: boolean;
  /** propagate the TOP_BAND_SECTION_IDS flag to top-level widgets */
  topBand?: boolean;
  /** propagate the MOBILE_SECTION_BAND_IDS flag to the mobile section's widgets */
  mobileBand?: boolean;
}) {
  const out: React.ReactNode[] = [];
  rows.forEach((n, i) => {
    if (isRow(n)) {
      out.push(<Row key={i} r={n} locale={locale} nested={nested} wdepth={wdepth + 1} vGutter={vGutter} mobileBox={mobileBox} topBand={topBand} mobileBand={mobileBand} />);
    } else if (isWidget(n)) {
      out.push(
        <div key={i}>
          <Widget w={n} locale={locale} nested={wdepth > 0} vGutter={vGutter} mobileBox={mobileBox} topBand={topBand} mobileBand={mobileBand} />
        </div>,
      );
    } else if (n.kind === "col") {
      out.push(
        <div key={i} className={colClass(n.grid)}>
          <Rows rows={n.children} locale={locale} nested={nested} wdepth={wdepth} vGutter={vGutter} mobileBox={mobileBox} topBand={topBand} mobileBand={mobileBand} />
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
  mobileInset = false,
  mobileBox = false,
  topBand = false,
  mobileBand = false,
}: {
  r: RowNode;
  locale?: Locale;
  nested?: boolean;
  wdepth?: number;
  vGutter?: boolean;
  /**
   * S3: imweb's mobile runtime pads the `.inside` container to 360px inside a
   * 390 viewport (15px per side). The crawl stores `pad: 0` for those mobile
   * rows (it measured the desktop gutter), so mobile-only sections re-apply the
   * 15px inset on their top-level rows. Nested rows sit inside an already
   * padded ancestor and stay at 0. Sections carrying `mobile_section` never
   * render at >=992, so this needs no breakpoint guard.
   */
  mobileInset?: boolean;
  /** MB1: mobile-authored box heights apply at all widths for mobile sections */
  mobileBox?: boolean;
  /** propagate the TOP_BAND_SECTION_IDS flag to top-level widgets */
  topBand?: boolean;
  /** propagate the MOBILE_SECTION_BAND_IDS flag to the mobile section's widgets */
  mobileBand?: boolean;
}) {
  const rowVars: React.CSSProperties = {};
  if (!nested && r.w) (rowVars as Record<string, string>)["--row-w"] = `${r.w}px`;
  if (r.h) (rowVars as Record<string, string>)["--row-h"] = `${r.h}px`;
  // item 6 — home §4 친환경: the crawled third row is imweb's `hidden-xs` strip
  // (an authored 82px padding) which the original renders `display:none` at
  // mobile. The crawler drops row classes (`RowNode` has no `cls`), so the flag
  // is carried in the content JSON as `_hiddenXs`; emit the `hidden-xs` class
  // that globals.css already ships (`@media (max-width:767px)`, the bootstrap
  // xs boundary the original uses).
  const hiddenXs = (r as unknown as { _hiddenXs?: boolean })._hiddenXs === true;
  // only top-level rows add the gutter inset — nested rows sit inside an
  // already-padded ancestor col, so re-applying would double the inset
  const pad = nested ? 0 : mobileInset ? Math.max(r.pad ?? 0, 15) : r.pad ?? 0;
  (rowVars as Record<string, string>)["--row-pad"] = `${pad}px`;
  // nested imweb rows scale to their parent col's grid (doz_grid), not 12
  const cols = r.cols.map((c) => ({
    ...c,
    span: Math.max(1, Math.min(12, Math.round(((parseInt(c.grid, 10) || 12) / (parseInt(r.grid, 10) || 12)) * 12))),
  }));
  // five equal cols (footer sitemap) can't split a 12-grid evenly — use grid-cols-5
  const fiveCol = cols.length === 5 && cols.every((c) => (parseInt(c.grid, 10) || 0) === 1);
  return (
    <div className={`imweb-row grid grid-cols-1 ${fiveCol ? "lg:grid-cols-5" : "lg:grid-cols-12"}${hiddenXs ? " hidden-xs" : ""}`} style={rowVars}>
      {cols.map((c, i) => (
        <div key={i} className={`imweb-col ${fiveCol ? "" : SPAN_CLASS[c.span] || colClass(c.grid)}`}>
          <Rows rows={c.children} locale={locale} nested wdepth={wdepth} vGutter={vGutter} mobileBox={mobileBox} topBand={topBand} mobileBand={mobileBand} />
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
/**
 * MB1: `mobile_section` widgets are authored for the 390px viewport, so their
 * crawled `boxStyle` height IS the mobile measurement — the opposite of the RC5
 * desktop-crop case above. Measured on home `s20250911281117781b494`: the four
 * image widgets carry `height: 179px` and the original mobile screenshot paints
 * each card as a 179px band (img element 360x483 clipped by the box); the
 * section is 4x179 + margins + 91 padding = 882. Keep the box height at every
 * width; the section itself never renders at >=992 (`mobile_section`), so
 * desktop is untouched. Independently confirmed on company.about
 * `s202509191b81eb54a6991` (`height: 318px` -> original band 694..1012 = 318).
 */
const BOX_MOBILE_HEIGHT = "h-[var(--box-h)]";

/**
 * Nested widget band inside a `vGutter` pc section (measured live at 390 on the
 * original rnd / rnd.facilities pc sections). imweb gives every `.inside .widget`
 * `margin: 7.5px 0` at mobile; the local row/col scaffolding already reproduces
 * that for top-level widgets but not for widgets nested one level deeper (a col
 * holding a nested row). Two shapes were measured:
 *
 * - nested IMAGE: the previous rebuild applied `15px/15px` (=30px) at every
 *   width. The original is `7.5px/7.5px` (15px) at mobile — it only doubles to
 *   15px/15px at desktop — so the mobile size is corrected here while the
 *   `min-[992px]` pair keeps the desktop value byte-identical.
 * - nested TEXT (facilities §생산능력): the band was missing entirely, leaving
 *   the section 115px short (local 1580 / orig 1695). The 8 nested text widgets
 *   × 15px restores it to 1700 (+5). Text widgets carrying a `text_bg_color`
 *   card (company.philosophy §경영이념) already reproduce the band inside the
 *   card's own box, so they are excluded — adding it there measured +91.
 *
 * Live 390 simulation of this exact scope (pc sections, vGutter, mobile 7.5px):
 *   facilities §3 1580→1700 (orig 1695) · rnd §3/§4/§5, patents, history, about,
 *   philosophy, organization 0 change · company §2 1293→1323 (−65→−35) ·
 *   global §4 1212→1272 (−100→−40) · home unchanged (its visible pc sections
 *   carry `grid_v_gutter_0`, so vGutter is false).
 */
const NESTED_IMAGE_BAND =
  "max-[991.98px]:mt-[7.5px] max-[991.98px]:mb-[7.5px] min-[992px]:mt-[15px] min-[992px]:mb-[15px]";
const NESTED_TEXT_BAND = "max-[991.98px]:mt-[7.5px] max-[991.98px]:mb-[7.5px]";

/**
 * Top-level widget band for `TOP_BAND_SECTION_IDS` (mobile only, 7.5px each
 * side). A top-level band cannot be applied globally: measured at 390 it
 * inflates company.about by +419 body and the home §7 map by +56 (their content
 * already folds the gutter in) and regresses every §첨단 sub-hero by +15 (that
 * heading needs the desktop-only 48px line-height rule, not a band). So the band
 * is applied only to the pc sections whose deficit was traced to it.
 */
const WIDGET_TOP_BAND = "max-[991.98px]:mt-[7.5px] max-[991.98px]:mb-[7.5px]";

/**
 * pc sections needing the top-level band, measured section-by-section. Expected
 * live 390 heights (original in parens): rnd/rnd.technology §2 464→494 (490) ·
 * §5 729→774 (779) · rnd.patents §2 3683→3773 (3820; the remaining −47 was the
 * certificate-card geometry, closed by the mobile grid gutters above) ·
 * company.history §3/§6/§9 874/738/812→904/768/842 (926/824/890) ·
 * company/ceo §2 1293→1338 (1358). Every other section measures 0 change.
 * Ids are stable across the duplicated routes (rnd == rnd.technology; company ==
 * company.ceo) — verified in the content JSON.
 *
 * item 3: the §5 entry used to be `s20250909b12fa8000068e`, which is the
 * *스마트·살균 기술* section (content rnd.json sec5). That section's widgets are
 * all nested (its band comes from increment 5), so the entry was inert and the
 * real §5 (투자자 핵심 USP 요약, content sec6 `s2025090979d4f02da9a4c`) never got
 * the band — measured live at 390: 728.59 vs the original 779.09. Corrected to
 * the USP id; §4 stays 1323.34 and §2/§3 are unchanged (simulated).
 */
const TOP_BAND_SECTION_IDS = new Set([
  "s202509091799d895b62ea", // rnd / rnd.technology §2 다단계 정수 시스템
  "s2025090979d4f02da9a4c", // rnd / rnd.technology §5 투자자 핵심 USP 요약
  "s202508114d9bc90ceb876", // rnd.patents §2 인증서
  "s20250811d0a0980d730fb", // company.history §3 2020 - 2023
  "s20250828fe85691f33b65", // company.history §6 2015 - 2019
  "s2025082848202431448dd", // company.history §9 2010 - 2014
  "s20250811fd0a82675a6bc", // company / company.ceo §2
  // EN channel equivalent. Verified live at 390 against the EN original:
  // rnd / rnd.technology §2 (en) local 516 / orig 546 — same structure and the
  // same deficit as ko (−26), and the band lands it at 546. The other EN band
  // candidates were measured and deliberately NOT added because their local
  // deficits differ from ko (the EN originals do not show the same gaps, so the
  // ko band would overshoot them): rnd §5 (local −15, band → +30), rnd.patents
  // §2 (local −27, band → +63), company.history §3/§6/§9 and company §2
  // (opposite-sign deficits). See design/audit/DEEP-UI-AUDIT.md §10.
  "s20250911b2b3771c0a0cd", // rnd / rnd.technology §2 (en)
]);

/**
 * Home §5 mobile slider (`s20250911db56ac49110f4`, gallery2 `layout:"slide"`).
 * The crawl stores no gallery autoplay config, so the measured value is pinned
 * here: the original's authored gallery config for this widget is
 * `"effect":"slide","effect_wait":"5","effect_time":"0.2","show_paging":"Y",
 * "auto_change":"Y","effect_loop":"Y"` → one full slide per 5000ms, looping,
 * dots paging, no arrows at mobile. Only this widget opts into autoplay;
 * every other slide gallery stays manual (their originals do not auto-advance).
 * Durable path: have the crawler persist `auto_change`/`effect_wait` on the
 * widget and read it here (mirrors the `animDir` migration note).
 */
const HOME_MOBILE_SLIDER_ID = "w20250911b19e5033093cd";

/**
 * Mobile-authored (`mobile_section`) widget band (7.5px each side).
 *
 * imweb gives every `.inside .widget` a `margin: 7.5px 0` at 390; the rebuild
 * already applies it to IMAGE widgets of a mobile section (Widget's `mobileBox`
 * branch) but not to the padding / text / video / gallery widgets. Measured live
 * at 390 on the home originals (per-widget margins): §회사소개 padding 91 →
 * 7.5/7.5; §에코웨이브는 padding 44 + text + padding 30; §생활환경 gallery 507 +
 * padding 30; §물을 깨끗하게 padding 45 + text + video + padding 101 — every one
 * `7.5px 0` on the original and `0` locally, which is exactly the reported
 * section deficits (−15 / −45 / −23 / −62).
 *
 * A GLOBAL mobile band is unsafe: measured it regresses company.about §3 by +30
 * and company.global §3 by +30 (those mobile sections' text widgets already run
 * ~+30 tall locally, so the band alone overshoots) and lifts home §1 by +30 (its
 * text runs +48 tall). Scoped to the measured home sections via this allowlist
 * (the TOP_BAND_SECTION_IDS pattern). The EN home mobile sections were measured
 * too (same 7.5px margins on the originals; §2 867→882 exact, §6 416→476 exact)
 * but are deliberately NOT listable: the EN home is currently +651 on its §3
 * from an unrelated full-width image bug, and the band would lift that section
 * further, so EN home is left untouched pending that fix.
 */
const MOBILE_SECTION_BAND = "mt-[7.5px] mb-[7.5px]";
const MOBILE_SECTION_BAND_IDS = new Set([
  "s20250911281117781b494", // home §회사소개 (ko mobile)
  "s20250911e7c6ef8d60c18", // home §에코웨이브는 깨끗한 물을… (ko mobile)
  "s20250911db56ac49110f4", // home §생활환경 솔루션 slider (ko mobile)
  "s20250911ce32ed6fec574", // home §물을 깨끗하게… (ko mobile)
]);

/**
 * item 1 — company.philosophy mobile rich-text downscale (coordinated set).
 *
 * At 390 imweb's pc-at-mobile runtime downscales the authored inline rich-text
 * spans: `font-size:18px` -> 15px/18px and `font-size:16px` -> 14px (verified
 * live on the /18 original: h6 18px spans compute 15px/18px, 16px spans compute
 * 14px/19.6px = the h6 1.4 factor). A *no-size* `p span` that inherits 15px
 * computes 24px (the body 1.6 factor) where the rebuild's `.rich-text p span`
 * lock forces 18px (1.2).
 *
 * Applied globally the coordinated set is NOT safe — turning on per-element
 * correctness exposes each page's other compensating errors. Measured live 390
 * (local body delta before -> after; original in parens):
 *   about  -6 -> -929 (9964) · history -150 -> -214 (4625) ·
 *   rnd/technology +12 -> +23 (4858) · rnd.patents -7 -> +27 (4722) ·
 *   rnd.facilities -3 -> -14 (4382) · company/ceo -28 -> -23 (2300) ·
 *   global -22 -> -8 (3080) · philosophy +49 -> +34 (4308).
 * The p-span half is context-dependent: on company/global the original no-size
 * p span already computes 1.2 (18px) and the local value matches, so applying
 * the rule there would be per-element *wrong* (raised to 38.4px). Only the
 * philosophy sections both carry the 18/16px spans and gain from the set, so the
 * hook is allowlisted to them (`data-rtm`, see globals.css). Verified by CSSOM
 * simulation of exactly this scope across all 20 mobile pages: philosophy
 * 4357 -> 4342 (-15, section deltas 경영이념 1026->1011 / 비전 487->494 /
 * 3단계 1911->1903) and **0 change on the other 19 pages**; desktop 0 (the
 * rules live in `@media (max-width:991px)`).
 *
 * EN philosophy authors the equivalent spans on different section ids; it is
 * deliberately NOT listed because the EN channel is outside the measured 20-page
 * protocol (would need its own validation pass).
 */
const RT_MOBILE_SECTION_IDS = new Set([
  "s202508119eca72dc669e0", // philosophy §경영이념 (18px x5)
  "s202508280e68f158799c2", // philosophy §비전 (18px x2)
  "s20250829e04e5ce09ea7e", // philosophy §3단계 서비스 (18px x12, 16px x3)
]);

/**
 * item 2 — home §7 (Headquarters & Factory Locations) holder box model.
 *
 * The original's address holders compute `.text-table.holder { padding: 20px
 * 50px }` inside a `.widget._text_wrap` carrying `padding: 0 15px`, so the `h6`
 * is 260px wide and wraps 5/5/3 lines. Locally the holder is `padding: 20px 0`
 * and the wrapper has no inset, so the `h6` is 390px wide. The larger gap,
 * however, is the mobile line-height: the holder `h6`s carry an inline
 * `line-height: 1.5`/`2`, and the authored 36/30/20px spans inherit it
 * (36/48/30px) where the original downscales them to 1.2 (24->28.8, 20->24,
 * 15->18). Applying only the holder padding reaches the right h6 width but
 * overshoots the section to +56; adding the mobile 1.2 line-height on the
 * measured span sizes lands the section exactly:
 *
 *   live 390 sim · section 845 -> 864 (orig 864); holders 144/140/140 ->
 *   161/157/125 = original; h6 widths 390 -> 260 = original; h6 heights
 *   84/80/80 -> 101/97/65 = original.
 *
 * The `.text-table.holder` class also appears on about/philosophy, so the fix is
 * allowlisted to the home §7 section (`data-mapholder`) and gated to
 * `max-width:991px` (desktop measurement already matches). Verified by CSSOM
 * simulation across all 20 mobile pages: only home moves (§7 exact; home body
 * 5539 -> 5558) and 0 change on the other 19; desktop 0.
 */
const MAP_HOLDER_SECTION_IDS = new Set([
  "s202508112787439deffdb", // home §7 Headquarters & Factory Locations (ko)
]);

/**
 * item 1 — mobile 48px-span line-height hook (`data-mh6`).
 *
 * imweb gives inline-sized text spans an `!important` line-height keyed by
 * their own font-size (48px -> 1.2). globals.css already carries that rule for
 * >=992px, but at mobile it is a per-element no-op for most spans because the
 * base `.rich-text p span { line-height: 1.2 }` covers paragraphs. The gap is
 * a 48px span that descends from an `h6[style*="line-height: 2"]`: the h6's
 * inline 2 wins (locally the span computes `28px/56px`), where the original
 * computes `28px/33.6px` (1.2) — measured live at 390 on the original home
 * (fix-35 `out/home4.txt`: orig H6 h37, span lh 33.6; local H6 h56, span lh
 * 56, section 273 vs orig 164).
 *
 * A GLOBAL mobile rule for every 48px span is unsafe: it also shrinks the
 * §첨단 sub-hero headings (h6 without the inline line-height), whose sections
 * are already height-compensated elsewhere (company.about, philosophy,
 * organization, company/global), so it regresses them. Instead the rule is
 * scoped to the measured trigger via this section hook — the same pattern as
 * `TOP_BAND_SECTION_IDS`.
 *
 * Trigger (matches globals.css exactly): an `<h6>` whose inline `style` contains
 * `line-height: 2` that wraps (descendant) a `<span>` whose inline `style`
 * contains `font-size: 48px`. Live measurement of the original at 390 confirms
 * every such span computes 1.2 (33.6px). Sections detected in the crawled
 * content (ko and en): home §7/§9/§14/§15. company.history §4/§7/§10 also
 * author 48px spans, but they sit in sibling `<p style="line-height: 2">`
 * elements, not inside the h6, and already compute 1.2 locally via the base
 * `p span` rule — they are correctly NOT hooked.
 */
const H6_LINE_HEIGHT_2 = /<h6\b[^>]*\bstyle="[^"]*line-height:\s*2[^"]*"[^>]*>([\s\S]*?)<\/h6>/gi;

export function sectionHasMh6Spans(sec: Section): boolean {
  let found = false;
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (found) return;
      if (n.kind === "widget") {
        const html = n.html || "";
        if (html.includes("font-size: 48px")) {
          H6_LINE_HEIGHT_2.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = H6_LINE_HEIGHT_2.exec(html))) {
            if (/font-size:\s*48px/.test(m[1])) {
              found = true;
              break;
            }
          }
        }
      } else if (n.kind === "row") n.cols.forEach((c) => walk(c.children));
      else if (n.kind === "col") walk(n.children);
    }
  };
  walk(sec.rows);
  return found;
}

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
 * T4: imweb's mobile back-to-top widget (`#doz_header`) is a `position:fixed`
 * viewport overlay. Measured live at 390x844 on the original: `position:fixed;
 * right:0; top:692.078px` (= 82% of the 844 viewport); `z-index:9999;
 * transform:translateY(56px)`; a 71x56 box (41px icon + 15px side gutters,
 * vertically centred) contributing **0 document-flow height**, visible at rest.
 * At >=992 it collapses (`display:none`, `top:82%`). Locally it rendered as an
 * in-flow `<section>` adding 56px on 16/20 mobile pages. These literals
 * reproduce the original geometry (fixed → no flow, floats top-right, hidden
 * at desktop).
 */
const BACK_TO_TOP_CLASS =
  "fixed right-0 top-[82%] z-[9999] h-[56px] w-[71px] translate-y-[56px] overflow-hidden min-[992px]:hidden";

/**
 * True when the section is imweb's mobile back-to-top overlay — an image widget
 * linking to `#doz_header` with the crawled `margin: 21px auto` placeholder
 * (the same discriminator as ImageWidget's `isScrollTop`). The desktop footer
 * also links to `#doz_header` but as a `button` widget, which is excluded.
 */
export function isBackToTopSection(sec: Section): boolean {
  let found = false;
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (found) return;
      if (
        n.kind === "widget" &&
        n.type === "image" &&
        (n.href || "").includes("#doz_header") &&
        /margin\s*:\s*21px\s+auto/i.test(n.imgStyle || "")
      ) {
        found = true;
      } else if (n.kind === "row") n.cols.forEach((c) => walk(c.children));
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
        // T4: the mobile back-to-top widget is an out-of-flow fixed overlay, not
        // an ordinary mobile section (it must not contribute flow height).
        const backToTop = isBackToTopSection(sec);
        const visibility = backToTop ? "" : mobileOnly ? MOBILE_ONLY_CLASS : desktopOnly ? DESKTOP_ONLY_CLASS : "";
        const side = /\bside_(left|right)\b/.exec(cls)?.[1] ?? null;
        // imweb shows *pc-authored* sections at 390 with a reduced typographic
        // scale (measured on the live original: 48->28, 36->24, 30->20, 24->16,
        // 22->16, 20->15, 18->15, 16->14) while `mobile_section` text keeps its
        // authored mobile sizes. Tag pc-channel sections so globals.css can scope
        // the downscale to them (mobile sections stay untouched).
        const pcAtMobile = !mobileOnly;
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
        // the measured top-level band applies to a fixed set of pc sections only
        const topBand = TOP_BAND_SECTION_IDS.has(sec.id);
        // the mobile-authored widget band applies to a fixed set of home sections
        const mobileBand = MOBILE_SECTION_BAND_IDS.has(sec.id);
        // item 1: mobile 48px-span line-height hook (globals.css `data-mh6`)
        const mh6 = sectionHasMh6Spans(sec);
        // item 1: philosophy mobile rich-text downscale (globals.css `data-rtm`)
        const rtm = RT_MOBILE_SECTION_IDS.has(sec.id);
        // item 2: home §7 holder box model (globals.css `data-mapholder`)
        const mapHolder = MAP_HOLDER_SECTION_IDS.has(sec.id);
        const aside = (sec as unknown as { aside?: AsideBlock }).aside;
        return (
          <section
            key={sec.id}
            className={`${backToTop ? BACK_TO_TOP_CLASS : "relative"}${visibility ? " " + visibility : ""}${pcAtMobile ? " pc-at-mobile" : ""}`}
            // globals.css hook (globals lane): `section[data-vgutter="0"] .spacer`
            // at <=1023px halves the spacer height, which imweb does for
            // `grid_v_gutter_0` sections (no `.inside .widget` gutter to fold in).
            // Same `vGutter` const the Widget margins use. Home §4 spacers
            // measured 75/56 -> 60/41 against the original 60/41.
            data-vgutter={vGutter ? undefined : "0"}
            // item 1 hook (globals.css): mobile-only 1.2 line-height on the
            // `h6[style*="line-height: 2"] span[style*="font-size: 48px"]`
            // headings this section authors (measured trigger).
            data-mh6={mh6 ? "1" : undefined}
            // item 1 hook (globals.css): philosophy mobile rich-text downscale
            // (18px->15/18, 16px->14, no-size p span 1.2->1.6) for the measured
            // section allowlist above.
            data-rtm={rtm ? "1" : undefined}
            // item 2 hook (globals.css): home §7 holder box model
            // (wrapper 0 15px + holder 20px 50px + mobile span 1.2).
            data-mapholder={mapHolder ? "1" : undefined}
          >
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
                    <Row
                      key={i}
                      r={r as RowNode}
                      locale={locale}
                      nested={false}
                      wdepth={0}
                      vGutter={vGutter}
                      mobileInset={mobileOnly}
                      mobileBox={mobileOnly}
                      topBand={topBand}
                      mobileBand={mobileBand}
                    />
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
