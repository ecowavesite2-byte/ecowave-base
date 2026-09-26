"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import SectionRenderer from "@/components/content/SectionRenderer";
import HeroCarousel from "@/components/sections/home/HeroCarousel";
import NoticeTicker, { isNoticeTickerSection } from "@/components/sections/home/NoticeTicker";
import type { Locale } from "@/lib/i18n";
import type { BoardPost, Section } from "@/lib/types";

/** `useLayoutEffect` in the browser (no flash), `useEffect` during SSR (no warning). */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Scaled live preview of a real page section.
 *
 * Mirrors MCell's `ScaledDesktop`: the section is laid out at the public site's
 * desktop width (1280px) and scaled down with a CSS transform so the preview is
 * a faithful thumbnail of the big-screen layout. A ResizeObserver keeps the
 * scale and the wrapper height in sync with the pane.
 */
export function ScaledDesktop({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [innerH, setInnerH] = useState(0);

  useIsomorphicLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      setScale(Math.min(1, outer.clientWidth / 1280));
      setInnerH(inner.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className="overflow-hidden"
      style={{ height: innerH && scale ? innerH * scale : undefined }}
    >
      <div
        ref={innerRef}
        className="pointer-events-none bg-white"
        style={{
          width: 1280,
          transform: scale ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Renders one crawled section through the public `SectionRenderer` (read-only
 * import — the public page rendering is not modified). Used with the draft
 * overrides applied, so the pane is a true live preview.
 *
 * Desktop hero ("visual") sections carry no widgets — the public home page
 * renders them through `HeroCarousel`, not `SectionRenderer` — so they mount
 * the same carousel here. `mobileSlides` is omitted: the mobile hero is a
 * separate crawled section (previewed as its own "mobile" pane), and this pane
 * lays the desktop layer out at 1280px.
 */
export default function SectionPreview({
  section,
  sections,
  locale,
  tickerPosts,
}: {
  /** A single section (default preview path). */
  section?: Section;
  /**
   * A full draft-applied section list (structured `eras`/`locations` previews,
   * which restructure the whole page). Takes precedence over `section`.
   */
  sections?: Section[];
  locale: Locale;
  /** Live picks for the notice ticker (falls back to an empty list). */
  tickerPosts?: BoardPost[];
}) {
  const full = Array.isArray(sections) && sections.length > 0;
  const single = section;
  return (
    <ScaledDesktop>
      {!full && single && isNoticeTickerSection(single) ? (
        <NoticeTicker section={single} posts={tickerPosts ?? []} locale={locale} />
      ) : !full && single?.visual?.length ? (
        <HeroCarousel slides={single.visual} />
      ) : (
        <SectionRenderer sections={full ? sections! : single ? [single] : []} locale={locale} />
      )}
    </ScaledDesktop>
  );
}
