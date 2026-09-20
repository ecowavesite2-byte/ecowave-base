import { z } from "zod";

/**
 * Loose Zod schemas mirroring `lib/types.ts`.
 *
 * These schemas intentionally `.passthrough()` every object so crawl-only keys
 * survive a parse/round-trip (secStyle, aside, bgFixed, _h, gridRowH,
 * gridGap, gridCols, captionBand, pagLinks, fontFamilies, fontsLoaded, ...).
 * `widget.type` stays a free string: the crawl discovers new widget kinds and
 * the admin lane must not reject them.
 *
 * This module does not modify or import `lib/types.ts`; the inferred types
 * below are named with the `Schema` value + matching bare type name.
 */

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

export const HeroSlideSchema = z
  .object({
    bg: z.string().nullable(),
    bgColor: z.string().nullable(),
    html: z.string(),
  })
  .passthrough();
export type HeroSlide = z.infer<typeof HeroSlideSchema>;

/* -------------------------------------------------------------------------- */
/* Node tree                                                                   */
/* -------------------------------------------------------------------------- */

export const WidgetNodeSchema = z
  .object({
    kind: z.literal("widget"),
    id: z.string(),
    /** free string: new widget kinds must not be rejected */
    type: z.string(),
    html: z.string().optional(),
    text: z.string().optional(),
    style: z.string().optional(),
    src: z.string().nullable().optional(),
    alt: z.string().optional(),
    href: z.string().optional(),
    hoverBg: z.string().nullable().optional(),
    boxStyle: z.string().optional(),
    imgStyle: z.string().optional(),
    anim: z.string().optional(),
    animDur: z.string().nullable().optional(),
    animDelay: z.string().nullable().optional(),
    layout: z.union([z.literal("slide"), z.literal("grid")]).optional(),
    gridN: z.string().nullable().optional(),
    itemW: z.number().nullable().optional(),
    itemH: z.number().nullable().optional(),
    items: z
      .array(
        z
          .object({
            org: z.string().nullable(),
            thumb: z.string().nullable(),
            title: z.string(),
            desc: z.string(),
          })
          .passthrough(),
      )
      .optional(),
    ref: z.string().optional(),
    listCls: z.string().optional(),
  })
  .passthrough();
export type WidgetNode = z.infer<typeof WidgetNodeSchema>;

/**
 * Recursive structural types are written by hand to break the inference cycle
 * (TS cannot fully infer a self-referential Zod schema). The schemas below are
 * annotated with them; top-level inferred types remain `z.infer`.
 */
export type ColNode = { kind: "col"; grid: string; children: Node[] };
export type RowNode = {
  kind: "row";
  grid: string;
  /** measured desktop size (px); w only for top-level rows */
  w?: number;
  h?: number;
  /** measured content inset (imweb gutter: 15px or 0) */
  pad?: number;
  cols: ColNode[];
};
export type Node = WidgetNode | ColNode | RowNode;

export const ColNodeSchema: z.ZodType<ColNode> = z.lazy(() =>
  z
    .object({
      kind: z.literal("col"),
      grid: z.string(),
      children: z.array(NodeSchema),
    })
    .passthrough(),
);

export const RowNodeSchema: z.ZodType<RowNode> = z.lazy(() =>
  z
    .object({
      kind: z.literal("row"),
      grid: z.string(),
      w: z.number().optional(),
      h: z.number().optional(),
      pad: z.number().optional(),
      cols: z.array(ColNodeSchema),
    })
    .passthrough(),
);

export const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.union([WidgetNodeSchema, ColNodeSchema, RowNodeSchema]),
);

/* -------------------------------------------------------------------------- */
/* Pages                                                                       */
/* -------------------------------------------------------------------------- */

export const SectionSchema = z
  .object({
    id: z.string(),
    cls: z.string().optional(),
    visual: z.array(HeroSlideSchema).optional(),
    bg: z.string().nullable(),
    bgFixed: z.boolean().optional(),
    bgStyle: z.string(),
    bgColor: z.string().nullable(),
    secStyle: z.string(),
    rows: z.array(NodeSchema),
  })
  .passthrough();
export type Section = z.infer<typeof SectionSchema>;

export const PageContentSchema = z
  .object({
    key: z.string(),
    sourceUrl: z.string(),
    title: z.string(),
    sections: z.array(SectionSchema),
  })
  .passthrough();
export type PageContent = z.infer<typeof PageContentSchema>;

/* -------------------------------------------------------------------------- */
/* Boards                                                                      */
/* -------------------------------------------------------------------------- */

export const BoardPostSchema = z
  .object({
    idx: z.string(),
    href: z.string().nullable().optional(),
    title: z.string(),
    category: z.string().optional(),
    excerpt: z.string(),
    thumb: z.string().nullable(),
    isNotice: z.boolean(),
    date: z.string().nullable(),
    views: z.number().nullable(),
    content: z.string().optional(),
    info: z.string().optional(),
    files: z
      .array(
        z
          .object({
            name: z.string(),
            href: z.string(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type BoardPost = z.infer<typeof BoardPostSchema>;

export const BoardContentSchema = z
  .object({
    name: z.string(),
    count: z.number(),
    listCls: z.string(),
    posts: z.array(BoardPostSchema),
  })
  .passthrough();
export type BoardContent = z.infer<typeof BoardContentSchema>;

/* -------------------------------------------------------------------------- */
/* Site                                                                        */
/* -------------------------------------------------------------------------- */

export const NavItemSchema = z
  .object({
    name: z.string(),
    url: z.string(),
    children: z.array(
      z
        .object({
          name: z.string(),
          url: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export type NavItem = z.infer<typeof NavItemSchema>;

export const LogoItemSchema = z
  .object({
    src: z.string(),
    cls: z.string(),
    parentCls: z.string(),
  })
  .passthrough();
export type LogoItem = z.infer<typeof LogoItemSchema>;

export const SiteFooterSchema = z
  .object({
    logo: z.string().nullable(),
    lines: z.array(z.string()),
    copyright: z.string(),
  })
  .passthrough();
export type SiteFooter = z.infer<typeof SiteFooterSchema>;

export const SiteDataSchema = z
  .object({
    nav: z.array(NavItemSchema),
    logos: z.array(LogoItemSchema),
    footer: SiteFooterSchema,
    bodyFont: z.string(),
    bodyColor: z.string(),
    bodyBg: z.string(),
  })
  .passthrough();
export type SiteData = z.infer<typeof SiteDataSchema>;
