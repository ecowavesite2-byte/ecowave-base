"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** imweb owl `paging_type_line` pager caps out at five indicators */
const MAX_DOTS = 5;
const GAP = 5;

/**
 * D13: owl-carousel-style pager for the `layout:"slide"` galleries. Keeps the
 * native snap scroll strip but adds the measured `paging_type_line` dot row
 * (39x12 indicators) and round prev/next arrows; a dot jumps to its page and
 * the arrows step one item, mirroring the original owl behaviour measured on
 * company.about (`container_w20250918692bb854e97af` 2 dots,
 * `container_w20250918b0ab58de4000e` 5 dots + `custom_nav nav_round`).
 *
 * Desktop geometry (all `min-[992px]:`, measured on the live originals): the
 * track bleeds one item padding past each column edge and drops the inter-item
 * gap (the item paddings supply the visual gutter), the carousel carries a
 * 20px bottom padding with the dot row sitting just below the stage, and the
 * arrows are pinned 15px inside the column, vertically centred, as 30x30
 * circles with a 1px rgba(255,255,255,.6) ring and a white glyph. Everything
 * is desktop-gated so the verified mobile rendering is untouched.
 */
export default function GallerySlider({
  count,
  children,
  pad = 5,
  arrows = true,
}: {
  count: number;
  children: ReactNode;
  /** item padding (5px captioned / 10px plain) — also the track bleed */
  pad?: number;
  /** the captioned variant has no arrows on the original (owl-prev/next display:none) */
  arrows?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [perView, setPerView] = useState(1);
  const [active, setActive] = useState(0);

  const step = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null | undefined;
    return first ? first.offsetWidth + GAP : el?.clientWidth || 1;
  };
  const dotCount = Math.min(MAX_DOTS, Math.max(1, Math.ceil(count / perView)));

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
  }, [count]);

  const goTo = (page: number) => {
    const el = track.current;
    if (!el) return;
    const p = Math.max(0, Math.min(dotCount - 1, page));
    const target = el.children[p * perView] as HTMLElement | undefined;
    if (target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: "smooth" });
    setActive(p);
  };

  const nudge = (dir: -1 | 1) => {
    track.current?.scrollBy({ left: dir * step(), behavior: "smooth" });
  };

  const arrow =
    "pointer-events-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[#ddd] text-body transition duration-300 hover:border-accent hover:text-accent";
  // measured `nav_round` circles: 30x30, 1px rgba(255,255,255,.6) ring, white glyph
  const arrowDesktop =
    "hidden min-[992px]:absolute min-[992px]:top-1/2 min-[992px]:z-20 min-[992px]:flex min-[992px]:h-[30px] min-[992px]:w-[30px] min-[992px]:-translate-y-1/2 min-[992px]:rounded-full min-[992px]:border min-[992px]:border-white/60 min-[992px]:text-white";
  const bleed = pad >= 10 ? "min-[992px]:-mx-[10px]" : "min-[992px]:-mx-[5px]";

  return (
    <div className="relative min-[992px]:pb-[20px]">
      <div
        ref={track}
        onScroll={() => {
          const el = track.current;
          if (el) setActive(Math.min(dotCount - 1, Math.round(el.scrollLeft / Math.max(step() * perView, 1))));
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-5 min-[992px]:top-[calc(100%-19px)] min-[992px]:bottom-auto">
          {/* mobile pager arrows (desktop renders the measured nav_round circles below) */}
          <button type="button" aria-label="이전" onClick={() => nudge(-1)} className={`${arrow} min-[992px]:hidden`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex items-center justify-center">
            {Array.from({ length: dotCount }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                onClick={() => goTo(i)}
                className={`pointer-events-auto flex h-[12px] w-[39px] items-center justify-center ${
                  i === active ? "opacity-100" : "opacity-50"
                }`}
              >
                <span className="h-[2px] w-full bg-[#363636] min-[992px]:w-[25px]" />
              </button>
            ))}
          </div>
          <button type="button" aria-label="다음" onClick={() => nudge(1)} className={`${arrow} min-[992px]:hidden`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
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
