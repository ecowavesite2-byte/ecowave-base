"use client";

import { useEffect, useRef, useState } from "react";

/**
 * imweb-style scroll reveal: fades/slides content in the first time it
 * enters the viewport (data-widget-anim="fadeInUp" / "fadeIn").
 *
 * When the user agent prefers reduced motion, skip the IntersectionObserver and
 * render the final (visible) state immediately with no transition. Every other
 * viewport animates (mobile was restored after batch A item 11 had disabled it).
 *
 * The mobile trigger is matched to the original's `wg_animated` runtime:
 * measured live at 390, a widget starts animating once its top is ~16.5px above
 * the viewport bottom (top 827.5 / vh 844, i.e. just inside the fold), where our
 * threshold-0 crossing fires at top == vh. A mobile-only `rootMargin` shrinks
 * the root's bottom edge by 16px so the trigger lines up; desktop keeps the
 * plain threshold-0 observer.
 */
export default function Reveal({
  anim = "fadeInUp",
  duration = 0.7,
  delay = 0,
  className = "",
  children,
}: {
  anim?: string;
  duration?: number;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Reduced motion: render the final state immediately with no opacity/
    // transform/transition (the original's forced end-state).
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    // imweb reveal fires when the element top is ~16.5px above the viewport
    // bottom at 390; a mobile-only negative bottom rootMargin reproduces it.
    const mobile = window.matchMedia("(max-width: 991px)").matches;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      mobile ? { threshold: 0, rootMargin: "0px 0px -6px 0px" } : { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // animate.css from-states: fadeInUp translate3d(0,60%,0) is the default;
  // fadeIn is opacity-only; Left/Right slide ±60% and Down -60% (the original
  // imweb keyframes use ±60% for every direction, NOT a full viewport width —
  // verified live via `getAnimations()`: `fadeInDown` = `translate3d(0,-60%,0)`).
  const from =
    anim === "fadeIn"
      ? "translateY(0)"
      : anim === "fadeInDown"
        ? "translateY(-60%)"
        : anim === "Left" || anim === "fadeInLeft"
          ? "translateX(-60%)"
          : anim === "Right" || anim === "fadeInRight"
            ? "translateX(60%)"
            : "translateY(60%)";

  return (
    <div
      ref={ref}
      // mirror imweb's animated-widget attributes so the reveal is observable
      // by the same tooling as the original (`data-widget-anim` etc.)
      data-widget-anim={anim}
      data-widget-anim-duration={String(duration)}
      data-widget-anim-delay={String(delay)}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0) translateX(0)" : from,
        transition: reduced
          ? "none"
          : `opacity ${duration}s ease ${delay}s, transform ${duration}s ease ${delay}s`,
        willChange: shown ? undefined : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
