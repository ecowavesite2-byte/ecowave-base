/** Measures the original header + home sections 1-2 in detail at 1440px. */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("https://imweb8701032505.imweb.me/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
try { await page.waitForSelector("#doz_header_wrap .viewport-nav", { timeout: 10000 }); } catch {}
await page.waitForTimeout(1500);

const m = await page.evaluate(() => {
  const h = document.querySelector("#doz_header_wrap");
  const logo = h.querySelector(".normal_logo");
  const logoR = logo ? logo.getBoundingClientRect() : null;
  const logoScroll = h.querySelector(".scroll_logo");
  const menuWrap = h.querySelector(".viewport-nav.desktop._main_menu");
  const mw = menuWrap ? menuWrap.getBoundingClientRect() : null;
  const items = menuWrap ? Array.from(menuWrap.querySelectorAll("li.dropdown > a")).slice(0, 6) : [];
  const fa = items[0] ? items[0].getBoundingClientRect() : null;
  const itemGap = items[1] ? Math.round(items[1].getBoundingClientRect().x - fa.x) : 0;
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const langCandidates = Array.from(h.querySelectorAll("a, span, div")).filter((el) => /한국어|English/.test(el.textContent) && el.children.length <= 2).slice(0, 5).map((el) => ({
    tag: el.tagName, cls: (el.className || "").toString().slice(0, 60), text: el.textContent.replace(/\s+/g, " ").trim().slice(0, 30),
    x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height),
  }));
  const inlineBtn = h.querySelector('._widget_data[data-widget-type="inline_button"] a');
  const inlineMenuBtn = h.querySelector('._widget_data[data-widget-type="inline_menu_btn"]');

  // home sections detail
  const secs = Array.from(document.querySelectorAll("body > div.section_wrap"));
  const home = secs
    .filter((s) => !/mobile_section/.test(s.className))
    .slice(0, 12)
    .map((s, i) => {
      const r = s.getBoundingClientRect();
      const bgEl = s.querySelector(":scope > .section_bg");
      const bg = bgEl ? (bgEl.style.backgroundImage || "").slice(5, 90) : null;
      const bgc = bgEl && bgEl.style.backgroundColor !== "rgba(0, 0, 0, 0)" ? bgEl.style.backgroundColor : null;
      const widgets = [];
      s.querySelectorAll("._widget_data[data-widget-type]").forEach((w) => {
        const t = w.getAttribute("data-widget-type");
        if (["padding", "sub_menu", "inline_logo", "inline_menu", "inline_button", "inline_menu_btn"].includes(t)) return;
        const anim = w.getAttribute("data-widget-anim") || "";
        widgets.push(t + (anim !== "none" ? "(" + anim + ")" : ""));
      });
      return { i, id: s.id.slice(0, 24), h: Math.round(r.height), bg, bgc, widgets: widgets.slice(0, 10) };
    });

  // banner section (에코웨이브는 깨끗한 물...) widget detail: text alignment + box heights
  const banner = document.querySelector("#s202508116d15f8202cd82");
  const bannerInfo = banner
    ? (() => {
        const clone = banner.cloneNode(true);
        clone.querySelectorAll("script,style").forEach((e) => e.remove());
        const fr = banner.querySelector(".fr-view");
        const textWidget = banner.querySelector('[data-widget-type="text"]');
        const widgetBox = textWidget ? textWidget.closest('[doz_type="widget"]') : null;
        const colBox = widgetBox ? widgetBox.closest(".col-dz") : null;
        const imgBox = banner.querySelector('[data-widget-type="image"] ._img_box');
        return {
          html: fr ? fr.innerHTML.replace(/\s+/g, " ").slice(0, 500) : null,
          textWidgetStyle: widgetBox ? (widgetBox.getAttribute("style") || "") : "",
          colGrid: colBox ? colBox.className.match(/col-dz-(\d+)/)?.[1] : null,
          colH: colBox ? Math.round(colBox.getBoundingClientRect().height) : 0,
          imgBoxH: imgBox ? Math.round(imgBox.getBoundingClientRect().height) : 0,
          widgetAnim: textWidget ? textWidget.getAttribute("data-widget-anim") : null,
        };
      })()
    : null;

  // vision section (s20250811004ea868d7376) bg check
  const vision = document.querySelector("#s20250811004ea868d7376");
  const visionBg = vision
    ? (() => {
        const bgEl = vision.querySelector(":scope > .section_bg");
        const style = vision.getAttribute("style") || "";
        return { bgEl: bgEl ? bgEl.style.backgroundImage.slice(5, 90) : null, secStyle: style, bgc: bgEl ? bgEl.style.backgroundColor : null };
      })()
    : null;

  // the 155px strip section
  const strip = document.querySelector("#s202508119ee9efac0385c");
  const stripInfo = strip
    ? {
        h: Math.round(strip.getBoundingClientRect().height),
        bg: strip.querySelector(":scope > .section_bg") ? strip.querySelector(":scope > .section_bg").style.backgroundImage.slice(5, 90) : null,
        codePreview: (strip.querySelector('[data-widget-type="code"]') || { innerHTML: "" }).innerHTML.replace(/\s+/g, " ").slice(0, 200),
      }
    : null;

  return {
    header: {
      h: Math.round(h.getBoundingClientRect().height),
      logo: logoR ? { x: Math.round(logoR.x), w: Math.round(logoR.width), h: Math.round(logoR.height) } : null,
      logoScroll: logoScroll ? (logoScroll.getAttribute("data-src") || logoScroll.src) : null,
      logoNormal: logo ? (logo.getAttribute("data-src") || logo.src) : null,
      menuWrap: mw ? { x: Math.round(mw.x), y: Math.round(mw.y), w: Math.round(mw.width) } : null,
      menuItem: fa ? { x: Math.round(fa.x), w: Math.round(fa.width), h: Math.round(fa.height) } : null,
      itemSpacing: items[1] && fa ? Math.round(items[1].getBoundingClientRect().x - (fa.x + fa.width)) : 0,
      font: fa ? cs(items[0]).fontSize + "|" + cs(items[0]).fontWeight + "|" + cs(items[0]).color : null,
      inlineBtn: inlineBtn ? { text: inlineBtn.textContent.trim(), x: Math.round(inlineBtn.getBoundingClientRect().x), w: Math.round(inlineBtn.getBoundingClientRect().width), h: Math.round(inlineBtn.getBoundingClientRect().height) } : null,
      inlineMenuBtn: inlineMenuBtn ? "present" : "none",
    },
    home,
    bannerInfo,
    visionBg: visionBg,
    stripInfo,
  };
});

await ctx.close();
await browser.close();
await fs.writeFile("design/header-home.json", JSON.stringify(m, null, 1));
console.log(JSON.stringify(m, null, 1).slice(0, 4200));
