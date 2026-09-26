"use client";

import {
  Children,
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

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
 *
 * company.about audit (2026-09-24): the original is an owl carousel
 * (`loop:true`, `mouseDrag:true`, `touchDrag:true`, container
 * `overflow:hidden`, dots/arrows `cursor:pointer`). Four gaps were closed here
 * so both company.about galleries (and the home §5 slider) match:
 *
 * 1. **Hidden scrollbar** — the owl outer is `overflow:hidden` (never shows a
 *    bar); the native strip is `overflow-x:auto`, so `scrollbar-width:none`
 *    + the webkit pseudo-element are applied to the track.
 * 2. **`cursor:pointer`** on the dots and arrows (the original computes
 *    `pointer`; it has NO grab/grabbing, so none is added).
 * 3. **Mouse/pen drag** — pointer down/move/up pans `scrollLeft` (fractional
 *    mouse deltas are ignored below 3px so a plain click/tap still works;
 *    `pointerType === "touch"` is left to the native overflow-x swipe). The
 *    card under the pointer cannot be activated mid-drag.
 * 4. **Infinite loop (owl `loop:true`)** — a full page of items is cloned at
 *    each end and the track is recentred by one real span whenever it enters a
 *    clone region. This is the owl-equivalent (owl also clones for wrap) and
 *    is the only mechanism that also reaches the tail page for counts that are
 *    not a multiple of `perView` (21 / 5 -> page 5 starts at item 20, which a
 *    clamped native strip cannot scroll to). The dot/scroll synchronisation is
 *    preserved: dot count is still derived from the REAL item count and the
 *    active dot is computed modulo it, so the clones never appear in the dot
 *    math. Trade-off: clones add hidden DOM (invisible — the track clips them)
 *    where the simpler "wrap inside goTo" fallback would not; the fallback was
 *    rejected because it leaves the tail page partial and cannot physically
 *    wrap a drag/wheel past either end.
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
  // Autoplay pauses while the user interacts (hover, press, focus, drag) and
  // resumes once the pointer/focus leaves.
  const [paused, setPaused] = useState(false);

  /**
   * SectionRenderer renders the desktop-authored fixed-width slide galleries
   * as `pad=5/arrows=false` (captioned) and `pad=10/arrows=true` (plain); the
   * mobile-only home gallery keeps the `pad=5` + `arrows=true` defaults. Only
   * the fixed-width pair gets the owl 2-up mobile layout.
   */
  const fixedItems = arrows === false || pad >= 10;
  const scope = (useId().replace(/[^a-zA-Z0-9_-]/g, "") || "gs") + (fixedItems ? "-fx" : "");

  // clone one page of items at each end for the owl loop wrap
  const kids = Children.toArray(children);
  const cloneN = Math.min(perView, kids.length);

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

  // Park the track on the first REAL item (one clone-page in from the left) so
  // the leading clones sit hidden to the left and the loop can recentre.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const firstReal = el.children[cloneN] as HTMLElement | undefined;
    if (firstReal) el.scrollLeft = firstReal.offsetLeft - el.offsetLeft;
  }, [cloneN, count, perView]);

  // exact item pitch from two adjacent real children (falls back to the old
  // `offsetWidth + GAP` measurement when the gallery holds a single item)
  const unit = () => {
    const el = track.current;
    if (!el) return 1;
    const a = el.children[cloneN] as HTMLElement | undefined;
    const b = el.children[cloneN + 1] as HTMLElement | undefined;
    if (a && b) return Math.max(1, b.offsetLeft - a.offsetLeft);
    return a ? a.offsetWidth + GAP : el.clientWidth || 1;
  };
  const origin = () => {
    const el = track.current;
    if (!el) return 0;
    const a = el.children[cloneN] as HTMLElement | undefined;
    return a ? a.offsetLeft - el.offsetLeft : 0;
  };
  const wrap = (n: number, m: number) => ((n % m) + m) % m;

  // mirror of `active` readable from the autoplay timer without re-arming it
  const activeRef = useRef(0);

  const goTo = (page: number) => {
    const el = track.current;
    if (!el) return;
    const p = wrap(page, dotCount);
    const idx = Math.min(count - 1, p * perView);
    const target = el.children[cloneN + idx] as HTMLElement | undefined;
    if (target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: "smooth" });
    activeRef.current = p;
    setActive(p);
  };

  // step ONE item, wrapping at both ends (owl `slideBy: 1`)
  const nudge = (dir: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    const idx = wrap(Math.round((el.scrollLeft - origin()) / unit()) + dir, count);
    const target = el.children[cloneN + idx] as HTMLElement | undefined;
    if (target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  // owl `auto_change` (home §5 mobile gallery): advance one page per interval,
  // looping. Off unless the caller opts in; `prefers-reduced-motion: reduce`
  // leaves the gallery at rest (the original does not respect it, but our
  // policy is to keep the reduced-motion build static).
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  // mouse/pen drag state. Touch is intentionally excluded — the native
  // `overflow-x:auto` swipe already matches the original `touchDrag`.
  const dragging = useRef(false);
  const drag = useRef<{ id: number; x: number; left: number } | null>(null);
  const moved = useRef(false);

  // Pause the auto-advance while the pointer is over/pressing the track or a
  // control holds focus, and while a drag is in flight; the interval restarts
  // when the interaction ends. Kept below the drag refs so the guard can read
  // `dragging.current`.
  useEffect(() => {
    if (!autoplayMs || dotCount <= 1) return;
    if (paused || dragging.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      goToRef.current(activeRef.current + 1);
    }, autoplayMs);
    return () => clearInterval(t);
  }, [autoplayMs, dotCount, paused]);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const firstReal = el.children[cloneN] as HTMLElement | undefined;
    if (!firstReal) return;
    const o = firstReal.offsetLeft - el.offsetLeft;
    const firstTrail = el.children[cloneN + count] as HTMLElement | undefined;
    const span = firstTrail ? firstTrail.offsetLeft - firstReal.offsetLeft : el.scrollWidth;
    // recentre when the strip enters either clone region (not mid-drag — the
    // pointer math holds an absolute start offset and a jump would fight it)
    if (!dragging.current && span > 1) {
      if (el.scrollLeft < o - 1) el.scrollLeft += span;
      else if (el.scrollLeft >= o + span - 1) el.scrollLeft -= span;
    }
    const idx = wrap(Math.round((el.scrollLeft - o) / unit()), count);
    const p = wrap(Math.floor(idx / perView), dotCount);
    activeRef.current = p;
    setActive(p);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setPaused(true);
    if (e.pointerType === "touch" || e.button !== 0) return;
    const el = track.current;
    if (!el) return;
    drag.current = { id: e.pointerId, x: e.clientX, left: el.scrollLeft };
    moved.current = false;
    dragging.current = true;
    el.setPointerCapture(e.pointerId);
    el.style.scrollSnapType = "none";
    el.style.userSelect = "none";
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const el = track.current;
    if (!el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) moved.current = true;
    el.scrollLeft = d.left - dx;
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    setPaused(false);
    const d = drag.current;
    if (!d) return;
    const el = track.current;
    drag.current = null;
    dragging.current = false;
    if (!el) return;
    el.style.scrollSnapType = "";
    el.style.userSelect = "";
    try {
      el.releasePointerCapture(d.id);
    } catch {
      /* pointer not captured (already released) */
    }
    // settle on the nearest REAL item — this also walks any clone position back
    // into the real region, so a drag that ran past either end wraps cleanly
    const o = origin();
    const idx = wrap(Math.round((el.scrollLeft - o) / unit()), count);
    const target = el.children[cloneN + idx] as HTMLElement | undefined;
    if (target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: "smooth" });
    if (moved.current) {
      // swallow the click the browser fires after this drag (same task)
      window.setTimeout(() => {
        moved.current = false;
      }, 0);
    }
  };
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!moved.current) return;
    e.preventDefault();
    e.stopPropagation();
    moved.current = false;
  };

  // measured `nav_round` circles: 30x30, 1px rgba(255,255,255,.6) ring, white glyph
  const arrowDesktop =
    "hidden min-[992px]:absolute min-[992px]:top-1/2 min-[992px]:z-20 min-[992px]:flex min-[992px]:h-[30px] min-[992px]:w-[30px] min-[992px]:-translate-y-1/2 min-[992px]:rounded-full min-[992px]:border min-[992px]:border-white/60 min-[992px]:cursor-pointer min-[992px]:text-white";
  const bleed = pad >= 10 ? "min-[992px]:-mx-[10px]" : "min-[992px]:-mx-[5px]";

  return (
    <div
      className="relative min-[992px]:pb-[20px]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
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
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={onClickCapture}
        className={`flex snap-x gap-[5px] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-[992px]:gap-0 ${bleed}`}
      >
        {cloneN > 0 &&
          kids.slice(kids.length - cloneN).map((c, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Fragment key={`lead-${i}`}>{c}</Fragment>
          ))}
        {kids}
        {cloneN > 0 &&
          kids.slice(0, cloneN).map((c, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Fragment key={`trail-${i}`}>{c}</Fragment>
          ))}
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
                className={`pointer-events-auto flex h-[12px] w-[32px] cursor-pointer items-center justify-center min-[992px]:w-[39px] ${
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
