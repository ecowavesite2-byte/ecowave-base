"use client";

import { useEffect } from "react";

/**
 * Scroll-to-top behaviour for imweb's `#doz_header` anchors.
 *
 * Original imweb exposes the scroll-to-top control twice: the mobile
 * `position:fixed` overlay (an image widget anchored to `#doz_header`) and the
 * desktop footer `.btn_top a[href="#doz_header"]`. Both rely on the browser
 * scrolling to the `#doz_header` fragment target. In the rebuild that target is
 * the **fixed** header (`components/layout/Header.tsx`), and a fragment link to
 * a `position:fixed` element is a no-op: the element is already inside the
 * viewport, so the browser has nowhere to scroll. The click set `location.hash`
 * but `window.scrollY` never moved (reproduced at 390 and 1440, KO/EN, home and
 * notices) — the "scroll up button does nothing" report.
 *
 * A single document-level capture delegate (the same pattern as
 * `LightboxHost`) repairs every current and future `#doz_header` anchor without
 * touching either render path or adding markup (so the fixed overlay's look,
 * position and breakpoints are unchanged). It intercepts before Next's `<Link>`
 * router handler, so the desktop footer link no longer lands inconsistently
 * (it stopped at y=88 on subpages), and honours `prefers-reduced-motion`.
 */
export default function ScrollToTop() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // let modified / non-primary clicks behave natively
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href="#doz_header"]');
      if (!anchor) return;
      // stop the native fragment jump (a fixed target can't be scrolled to) and
      // Next's client router, then scroll the window to the true top
      e.preventDefault();
      e.stopPropagation();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
