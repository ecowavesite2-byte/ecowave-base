/** Deep-dive: original home hero (slides, paging, autoplay) + vision section
 * (widget anims with durations/delays, card hover states). */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("https://imweb8701032505.imweb.me/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
try { await page.waitForSelector(".owl-carousel.owl-loaded", { timeout: 8000 }); } catch {}
await page.waitForTimeout(1500);

const r = await page.evaluate(() => {
  const out = {};

  // ---- HERO ----
  const hero = document.querySelector("#s20250811b5ffbb4730f67");
  const visual = hero.querySelector(".visual_section");
  const carousel = visual.querySelector(".owl-carousel");
  out.hero = {
    secCls: visual.className,
    carouselCls: carousel.className,
    pagingType: /paging_type_(\w+)/.exec(visual.className)?.[1] || null,
    // owl config exposed on the element
    dataAttrs: Array.from(carousel.attributes).filter((a) => a.name.startsWith("data-")).map((a) => a.name + "=" + a.value),
    slides: Array.from(carousel.querySelectorAll(".owl-item:not(.cloned)")).map((oi) => {
      const item = oi.querySelector(".item");
      const fr = item.querySelector(".text-wrap._text, .fr-view");
      return {
        bg: (item.style.backgroundImage || "").slice(5, 80),
        bgc: item.style.backgroundColor,
        h: Math.round(oi.getBoundingClientRect().height),
        textH: fr ? Math.round(fr.getBoundingClientRect().height) : null,
        textY: fr ? Math.round(fr.getBoundingClientRect().y - oi.getBoundingClientRect().y) : null,
        html: fr ? fr.innerHTML.replace(/\s+/g, " ").slice(0, 600) : null,
      };
    }),
    // paging UI
    paging: (() => {
      const pag = carousel.querySelector(".owl-dots, .owl-pagination");
      if (!pag) return null;
      const pr = pag.getBoundingClientRect();
      const cs = getComputedStyle(pag);
      return {
        cls: pag.className,
        x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height),
        dotCount: pag.querySelectorAll(".owl-dot").length,
        dotCls: pag.querySelector(".owl-dot")?.className,
        activeDotCls: pag.querySelector(".owl-dot.active")?.className || null,
        dotStyle: pag.querySelector(".owl-dot") ? getComputedStyle(pag.querySelector(".owl-dot")).width + "x" + getComputedStyle(pag.querySelector(".owl-dot")).height + " bg:" + getComputedStyle(pag.querySelector(".owl-dot")).backgroundColor : null,
      };
    })(),
    // autoplay + transition config from owl defaults or data
    autoplay: carousel.dataset.autoplay || null,
    autoplayTimeout: carousel.dataset.autoplayTimeout || null,
    smartSpeed: carousel.dataset.smartSpeed || null,
    animateOut: carousel.dataset.animateOut || null,
    animateIn: carousel.dataset.animateIn || null,
  };

  // owl instance settings (imweb usually stores in jQuery data)
  out.hero.owlCfg = (() => {
    const el = carousel;
    const keys = Object.keys(el);
    const jr = keys.filter((k) => k.startsWith("jQuery"));
    return jr.length ? "jquery-data-present" : Object.keys(el.dataset || {});
  })();

  // ---- VISION SECTION ----
  const vision = document.querySelector("#s20250811004ea868d7376");
  out.vision = {
    secCls: vision.className,
    widgets: Array.from(vision.querySelectorAll("._widget_data[data-widget-type]")).map((w) => ({
      t: w.getAttribute("data-widget-type"),
      anim: w.getAttribute("data-widget-anim"),
      dur: w.getAttribute("data-widget-anim-duration"),
      delay: w.getAttribute("data-widget-anim-delay"),
    })),
    // quick-link card detail: default vs hover
    card: (() => {
      const imgWidget = vision.querySelector('[data-widget-type="image"]');
      const a = imgWidget.querySelector("a");
      const mainImg = imgWidget.querySelector("._img_box img");
      const hoverImg = imgWidget.querySelector("._hover_image");
      const overlay = imgWidget.querySelector(".hover_txt");
      const overlayTxt = imgWidget.querySelector(".txt_body");
      const title = overlay ? overlay.querySelector("h5") : null;
      const topT = overlay ? overlay.querySelector(".top-t") : null;
      const addIcon = overlay ? overlay.querySelector(".material-symbols-outlined, span[class*=icon]") : null;
      const cs = (el) => (el ? getComputedStyle(el) : null);
      return {
        href: a?.getAttribute("href"),
        mainImgSrc: mainImg ? (mainImg.getAttribute("data-src") || mainImg.src).slice(-40) : null,
        hoverImgBg: hoverImg ? (hoverImg.style.backgroundImage || "").slice(5, 75) : null,
        hoverVisibleDefault: hoverImg ? getComputedStyle(hoverImg).opacity : null,
        overlayCls: overlay ? overlay.className.slice(0, 70) : null,
        overlayPos: overlay ? overlay.style.cssText.slice(0, 90) : null,
        align: overlayTxt ? getComputedStyle(overlayTxt).textAlign + "/" + getComputedStyle(overlayTxt).verticalAlign : null,
        titleText: title?.textContent.trim(),
        titleStyle: title ? getComputedStyle(title).fontSize + "|" + getComputedStyle(title).fontWeight + "|" + getComputedStyle(title).color + "|" + getComputedStyle(title).letterSpacing : null,
        topTStyle: topT ? getComputedStyle(topT).fontSize + "|" + getComputedStyle(topT).color + "|" + getComputedStyle(topT).textTransform : null,
        addIconCls: addIcon ? addIcon.className + " fs:" + getComputedStyle(addIcon).fontSize : null,
        overlayDefaultOpacity: overlay ? getComputedStyle(overlay).opacity : null,
        imgBoxH: mainImg ? Math.round(mainImg.closest("._img_box").getBoundingClientRect().height) : null,
        overlayAlwaysVisible: overlay ? /hover_txt_hide|hide/.test(overlay.className) === false : null,
      };
    })(),
    // hover state (simulate)
    hoverState: "captured-separately",
  };

  // hero text alignment sample
  const slideText = hero.querySelector(".fr-view p");
  out.heroTextAlign = slideText ? getComputedStyle(slideText).textAlign : null;

  return out;
});

console.log(JSON.stringify(r, null, 1));
await fs.writeFile("design/orig-section12.json", JSON.stringify(r, null, 1));
await ctx.close();
await browser.close();
