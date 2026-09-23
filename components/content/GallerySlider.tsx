"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const GAP = 5;

/**
 * D13: owl-carousel-style pager for the `layout:"slide"` galleries. Keeps the
 * native snap scroll strip but adds the measured `paging_type_line` dot row
 * (imweb `.owl-dot` indicators: 32x12 / 2px bar at <992px, 39x12 / 2px bar at
 * >=992px) and round prev/next arrows; a dot jumps to its page and the arrows
 * step one item, mirroring the original owl behaviour.
 *
 * Desktop geometry (all `min-[992px]:`, measured on the live originals): the
 * track bleeds one item padding past each column edge and drops the inter-item
 * gap (the item paddings supply the visual gutter), the carousel carries a
 * 20px bottom padding with the dot row sitting just below the stage, and the
 * arrows are pinned 15px inside the column, vertically centred, as 30x30
 * circles with a 1px rgba(255,255,255,.6) ring and a white glyph.
 *
 * Mobile geometry (measured live on the originals, <992px): every original
 * `gallery2 slide` shows TWO items per view (company.about: 21 items -> 11
 * dots, 7 items -> 4 dots; home: 3 items -> 3 dots), each dot advances one
 * full page (2 items), and the owl `nav_round`/`owl-nav` arrows are
 * `display:none` — mobile is a dots-only pager. Desktop fixed-width galleries
 * (the company.about pair) therefore override their item width to a 2-up
 * column and let the image keep its natural aspect; the mobile-only home
 * gallery keeps its authored 1-up full-width slide.
 */
export default function GallerySlider({
  count,
  children,
  pad = 5,
  arrows = true,
  autoplayMs = 0,
}: {
  count: number;
  children: ReactNode;
  /** item padding (5px captioned / 10px plain) — also the track bleed */
  pad?: number;
  /** the captioned variant has no arrows on the original (owl-prev/next display:none) */
  arrows?: boolean;
  /**
   * owl `auto_change` interval in ms (0 = manual). The home §5 mobile slider
   * (`s20250911db56ac49110f4`) autoplays on the original: the authored gallery
   * config is `"effect":"slide","effect_wait":"5","effect_time":"0.2",
   * "show_paging":"Y","auto_change":"Y","effect_loop":"Y"`, i.e. one full slide
   * per **5000ms**, looping. Opt-in per widget so no other page's gallery
   * (company.about etc.) gains motion it does not have. Honours
   * `prefers-reduced-motion: reduce` (render at rest, no timer).
   */
  autoplayMs?: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [perView, setPerView] = useState(1);
  const [active, setActive] = useState(0);

  /**
   * SectionRenderer renders the desktop-authored fixed-width slide galleries
   * as `pad=5/arrows=false` (captioned) and `pad=10/arrows=true` (plain); the
   * mobile-only home gallery keeps the `pad=5` + `arrows=true` defaults. Only
   * the fixed-width pair gets the owl 2-up mobile layout.
   */
  const fixedItems = arrows === false || pad >= 10;
  const scope = (useId().replace(/[^a-zA-Z0-9_-]/g, "") || "gs") + (fixedItems ? "-fx" : "");

  const step = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null | undefined;
    return first ? first.offsetWidth + GAP : el?.clientWidth || 1;
  };
  // owl `paging_type_line` renders one indicator per page and does NOT cap the
  // row (the original shows 11 dots for 21 items at 2-up), so dots == pages.
  const dotCount = Math.max(1, Math.ceil(count / perView));

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const s = first ? first.offsetWidth + GAP : el.clientWidth;
      setPerView(Math.max(1, Math.round(el.clientWidth / Math.max(s, 1))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count, fixedItems]);

  // mirror of `active` readable from the autoplay timer without re-arming it
  const activeRef = useRef(0);

  const goTo = (page: number) => {
    const el = track.current;
    if (!el) return;
    const p = Math.max(0, Math.min(dotCount - 1, page));
    const target = el.children[p * perView] as HTMLElement | undefined;
    if (target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: "smooth" });
    activeRef.current = p;
    setActive(p);
  };

  const nudge = (dir: -1 | 1) => {
    track.current?.scrollBy({ left: dir * step(), behavior: "smooth" });
  };

  // owl `auto_change` (home §5 mobile gallery): advance one page per interval,
  // looping. Off unless the caller opts in; `prefers-reduced-motion: reduce`
  // leaves the gallery at rest (the original does not respect it, but our
  // policy is to keep the reduced-motion build static).
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  useEffect(() => {
    if (!autoplayMs || dotCount <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      goToRef.current((activeRef.current + 1) % dotCount);
    }, autoplayMs);
    return () => clearInterval(t);
  }, [autoplayMs, dotCount]);

  // measured `nav_round` circles: 30x30, 1px rgba(255,255,255,.6) ring, white glyph
  const arrowDesktop =
    "hidden min-[992px]:absolute min-[992px]:top-1/2 min-[992px]:z-20 min-[992px]:flex min-[992px]:h-[30px] min-[992px]:w-[30px] min-[992px]:-translate-y-1/2 min-[992px]:rounded-full min-[992px]:border min-[992px]:border-white/60 min-[992px]:text-white";
  const bleed = pad >= 10 ? "min-[992px]:-mx-[10px]" : "min-[992px]:-mx-[5px]";

  return (
    <div className="relative min-[992px]:pb-[20px]">
      {fixedItems && (
        // Mobile-only 2-up override. The track's `figure` children carry an
        // inline desktop `width`/`height`; only below 992px do we widen them to
        // half the track (minus the 5px gutter) and drop the fixed height so
        // the image keeps its natural aspect — this is how the original owl
        // `slide_02` item scales at mobile (company.about: 185x243 and
        // 183x134 + caption). No >=992px rule is emitted, so desktop is
        // untouched.
        <style>{`@media (max-width:991.98px){[data-gs="${scope}"]>figure{width:calc((100% - ${GAP}px) / 2) !important;height:auto !important}[data-gs="${scope}"]>figure>img{height:auto !important}}`}</style>
      )}
      <div
        ref={track}
        data-gs={scope}
        onScroll={() => {
          const el = track.current;
          if (!el) return;
          const p = Math.min(dotCount - 1, Math.round(el.scrollLeft / Math.max(step() * perView, 1)));
          activeRef.current = p;
          setActive(p);
        }}
        className={`flex snap-x gap-[5px] overflow-x-auto min-[992px]:gap-0 ${bleed}`}
      >
        {children}
      </div>
      {dotCount > 1 && (
        // MB2/D13: the original owl nav (`.owl-nav`/`.owl-dots`) is an absolute
        // overlay, so it adds ZERO flow height. Anchor the pager inside the
        // gallery container instead of `mt-5` in-flow (which was +54px desktop
        // / +~40-130px mobile per gallery). The container is `relative`; the
        // strip itself is not, so the pager is not clipped by the track's
        // `overflow-x-auto`. Only the controls take pointer events so the strip
        // keeps its swipe target. Desktop: the measured `.owl-dots` row sits
        // just BELOW the stage (stage bottom +1) inside the carousel's 20px
        // bottom padding, so the overlay overrides to `top: calc(100% - 19px)`.
        //
        // Mobile carries the dot row only: the original hides its owl/round
        // arrows below 992px (`display:none`), so the row is centred.
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center min-[992px]:top-[calc(100%-19px)] min-[992px]:bottom-auto">
          <div className="flex items-center justify-center">
            {Array.from({ length: dotCount }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                onClick={() => goTo(i)}
                className={`pointer-events-auto flex h-[12px] w-[32px] items-center justify-center min-[992px]:w-[39px] ${
                  i === active ? "opacity-100" : "opacity-50"
                }`}
              >
                <span className="h-[2px] w-[24px] bg-[#363636] min-[992px]:w-[25px]" />
              </button>
            ))}
          </div>
        </div>
      )}
      {dotCount > 1 && arrows && (
        <>
          <button
            type="button"
            aria-label="이전"
            onClick={() => nudge(-1)}
            className={`${arrowDesktop} min-[992px]:left-[15px]`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="다음"
            onClick={() => nudge(1)}
            className={`${arrowDesktop} min-[992px]:right-[15px]`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
