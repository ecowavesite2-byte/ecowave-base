// Content types extracted from the source site by scripts/crawl/crawl.mjs

export type WidgetNode = {
  kind: "widget";
  id: string;
  type: string;
  html?: string;
  text?: string;
  style?: string;
  src?: string | null;
  alt?: string;
  href?: string;
  hoverBg?: string | null;
  boxStyle?: string;
  imgStyle?: string;
  anim?: string;
  animDur?: string | null;
  animDelay?: string | null;
  layout?: "slide" | "grid";
  gridN?: string | null;
  itemW?: number | null;
  itemH?: number | null;
  items?: {
    org: string | null;
    thumb: string | null;
    title: string;
    desc: string;
  }[];
  ref?: string;
  listCls?: string;
  /** measured widget height (padding widget source of truth) */
  _h?: number;
  /** grid gallery metrics (crawl-only) */
  gridRowH?: number;
  gridGap?: number;
  gridCols?: number;
  /** gallery renders its caption as a band */
  captionBand?: boolean;
  /**
   * Mobile portrait rendition opt-out for `MOBILE_IMAGE_SRC`. `false` means the
   * admin replaced the desktop `src`, so the curated mobile portrait swap must
   * NOT apply (the authored image is the single source). `undefined` = use the
   * curated rendition when one exists.
   */
  mobileSrc?: string | null | false;
  /**
   * Carousel auto-advance in ms, consumed by the renderer (gallery `slide`
   * layouts). Crawl-emitted; 0/undefined = no autoplay.
   */
  autoplayMs?: number;
  /** Renderer variant for a structured gallery block. */
  galleryVariant?: "caption" | "plain";
};

export type ColNode = { kind: "col"; grid: string; children: Node[]; _h?: number };
export type RowNode = {
  kind: "row";
  grid: string;
  /** measured desktop size (px); w only for top-level rows */
  w?: number;
  h?: number;
  /** measured content inset (imweb gutter: 15px or 0) */
  pad?: number;
  cols: ColNode[];
  /** measured row height (crawl-only) */
  _h?: number;
};
export type Node = WidgetNode | ColNode | RowNode;

export type HeroSlide = {
  bg: string | null;
  bgColor: string | null;
  html: string;
};

/** One location holder card (home locations section; admin-editable list). */
export type LocationCard = { lines: string[] };

/** One year block of a company.history era (item text WITHOUT the leading "· "). */
export type EraYear = { year: string; items: string[] };
/** One timeline era of the company.history page (structured `eras` kind). */
export type EraEntry = { range: string; tagline: string; image: string; years: EraYear[] };
/**
 * One entry of the company.global page (structured `locations` kind): item 0 is
 * the HQ slot, items 1+ are branch offices. One uniform field set.
 */
export type GlobalLocation = {
  badge: string;
  city: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  mapSrc: string;
};

/** Per-item fields a structured media block can expose. */
export type GalleryFieldName = "image" | "title" | "desc";
/** One item of a structured `gallery` / `aboutCards` block (`org = thumb = image`). */
export type StructuredMediaItem = { image: string; title: string; desc: string };
/** Which fields are editable for one structured media block (+ optional cap). */
export interface GalleryBlockConfig {
  fields: GalleryFieldName[];
  maxItems?: number;
}

/** Ticker post selection (home notice ticker). */
export type TickerPicks = { board: "news" | "notices"; idxs: string[] };

export type Section = {
  id: string;
  cls?: string;
  /** visual hero slides (homepage visual_section) */
  visual?: HeroSlide[];
  /** ticker post picks (override); first 4 news is the default */
  picks?: TickerPicks;
  bg: string | null;
  /** original `.section_bg.fixed_bg_wrap` — pin the bg to the viewport */
  bgFixed?: boolean;
  bgStyle: string;
  bgColor: string | null;
  secStyle: string;
  rows: Node[];
  /** desktop/mobile authoring split (company.history): sticky side column */
  aside?: { pt?: number; items: Node[] };
};

export type PageContent = {
  key: string;
  sourceUrl: string;
  title: string;
  sections: Section[];
};

export type BoardPost = {
  idx: string;
  href?: string | null;
  title: string;
  category?: string;
  excerpt: string;
  thumb: string | null;
  isNotice: boolean;
  date: string | null;
  views: number | null;
  content?: string;
  info?: string;
  files?: { name: string; href: string; size?: number }[];
};

export type BoardContent = {
  name: string;
  count: number;
  listCls: string;
  posts: BoardPost[];
  /** legacy imweb pagination hrefs (crawl-only; unused by the rebuild) */
  pagLinks?: string[];
};

export type NavItem = {
  name: string;
  url: string;
  children: { name: string; url: string }[];
};

export type SiteData = {
  nav: NavItem[];
  logos: { src: string; cls: string; parentCls: string }[];
  footer: { logo: string | null; lines: string[]; copyright: string };
  bodyFont: string;
  bodyColor: string;
  bodyBg: string;
  /** crawled font stacks declared by the original stylesheet */
  fontFamilies?: string[];
  /** crawled icon/webfont families actually loaded */
  fontsLoaded?: string[];
};
