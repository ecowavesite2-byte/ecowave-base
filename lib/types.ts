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
  boxStyle?: string;
  imgStyle?: string;
  layout?: "slide" | "grid";
  items?: {
    org: string | null;
    thumb: string | null;
    title: string;
    desc: string;
  }[];
  href?: string;
  ref?: string;
  listCls?: string;
};

export type ColNode = { kind: "col"; grid: string; children: Node[] };
export type RowNode = { kind: "row"; grid: string; cols: ColNode[] };
export type Node = WidgetNode | ColNode | RowNode;

export type HeroSlide = {
  bg: string | null;
  bgColor: string | null;
  html: string;
};

export type Section = {
  id: string;
  cls?: string;
  /** visual hero slides (homepage visual_section) */
  visual?: HeroSlide[];
  bg: string | null;
  bgStyle: string;
  bgColor: string | null;
  secStyle: string;
  rows: Node[];
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
  files?: { name: string; href: string }[];
};

export type BoardContent = {
  name: string;
  count: number;
  listCls: string;
  posts: BoardPost[];
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
};
