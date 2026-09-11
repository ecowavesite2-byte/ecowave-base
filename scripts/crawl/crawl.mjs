/**
 * ECOWAVE site crawler (Stage 1)
 * - Crawls all static pages + boards (KR + EN) from the imweb source
 * - Extracts structured content JSON into content/{locale}/...
 * - Downloads every referenced asset into public/images/... (mirroring CDN paths)
 * - Captures full-page screenshots into design/ for pixel-perfect reference
 *
 * Usage:  node scripts/crawl/crawl.mjs [--locales=ko,en] [--only=globals,pages,boards,shots,assets] [--shots=ko] [--workers=4]
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const ROOT = path.resolve(process.cwd());
const CONTENT_DIR = path.join(ROOT, "content");
const DESIGN_DIR = path.join(ROOT, "design");

const LOCALES = {
  ko: "https://imweb8701032505.imweb.me",
  en: "https://en.ecowavekorea.co.kr",
};

/** static (non-board) pages: key -> source path (board pages included for their banner sections) */
const STATIC_PAGES = {
  home: "/",
  company: "/15",
  "company/ceo": "/16",
  "company/about": "/17",
  "company/philosophy": "/18",
  "company/history": "/19",
  "company/organization": "/31",
  "company/global": "/20",
  rnd: "/21",
  "rnd/technology": "/22",
  "rnd/patents": "/23",
  "rnd/facilities": "/24",
  products: "/32",
  newsroom: "/26",
  support: "/28",
  news: "/29",
  notices: "/27",
  "products/eco-wave": "/37",
  "products/clean-b": "/38",
  "products/flowell": "/36",
};

/** boards: slug -> source path (NOTE: numeric paths differ between locales!) */
const BOARDS_BY_LOCALE = {
  ko: {
    news: "/29",
    notices: "/27",
    "products/eco-wave": "/37",
    "products/clean-b": "/38",
    "products/flowell": "/36",
  },
  en: {
    news: "/29",
    notices: "/27",
    "products/eco-wave": "/36",
    "products/clean-b": "/37",
    "products/flowell": "/38",
  },
};

// ---------------------------------------------------------------------------
// Page-context extraction functions (self-contained; injected via evaluate)
// ---------------------------------------------------------------------------

function EXTRACT_PAGE() {
  const IMG_RE = /url\(["']?([^"')]+)["']?\)/;
  function widgetData(widgetEl) {
    const meta = widgetEl.querySelector(":scope > ._widget_data");
    if (!meta) return null;
    const type = meta.getAttribute("data-widget-type");
    const SKIP = [
      "sub_menu",
      "inline_logo",
      "inline_menu",
      "inline_button",
      "inline_menu_btn",
      "line",
      "space",
      "social",
    ];
    if (SKIP.includes(type)) return null;
    // padding widgets are kept: their height drives the vertical rhythm
    if (type === "padding") {
      const html = meta.innerHTML || "";
      const m =
        html.match(/data-height="(-?[\d.]+)"/) ||
        html.match(/[^-]height:\s*(-?[\d.]+)px/);
      return {
        type: "padding",
        html,
        _h: m ? parseFloat(m[1]) : 0,
      };
    }
    const cleanClone = (el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll("script,style,noscript").forEach((e) => e.remove());
      return c;
    };
    switch (type) {
      case "menu_title": {
        const h = meta.querySelector("h1,h2,h3,h4,.widget_menu_title");
        return {
          type: "menu_title",
          text: h ? h.textContent.replace(/\s+/g, " ").trim() : "",
          style: h ? h.getAttribute("style") || "" : "",
        };
      }
      case "text": {
        const fr =
          meta.querySelector(".fr-view") ||
          meta.querySelector('[doz_type="text"]');
        return {
          type: "text",
          html: (fr || cleanClone(meta)).innerHTML,
          anim: meta.getAttribute("data-widget-anim") || "none",
        };
      }
      case "image": {
        const img = meta.querySelector("img");
        const box = meta.querySelector("._img_box");
        const hoverEl = meta.querySelector("._hover_image");
        const linkEl = meta.querySelector("a[href]");
        const hoverMatch = hoverEl
          ? hoverEl.style.backgroundImage.match(
              /url\(["']?([^"')]+)["']?\)/,
            )
          : null;
        return {
          type: "image",
          src: img
            ? img.getAttribute("data-src") || img.getAttribute("src")
            : null,
          alt: img ? img.getAttribute("alt") || "" : "",
          href: linkEl ? linkEl.getAttribute("href") : undefined,
          hoverBg: hoverEl ? hoverMatchSafe(hoverEl) : null,
          boxStyle: box ? box.getAttribute("style") || "" : "",
          imgStyle: img ? img.getAttribute("style") || "" : "",
          anim: meta.getAttribute("data-widget-anim") || "none",
        };
        function hoverMatchSafe(el) {
          const m = el.style.backgroundImage.match(
            /url\(["']?([^"')]+)["']?\)/,
          );
          return m ? m[1] : null;
        }
      }
      case "gallery2": {
        const cont = meta.querySelector(
          '[class*="gallery2"], [class*="img_rendering"]',
        );
        const cls = cont ? cont.className : "";
        const layout = /type_slide/.test(cls) ? "slide" : "grid";
        const items = [];
        const seen = new Set();
        meta
          .querySelectorAll("._item, .item_gallary, .gallery_item")
          .forEach((it) => {
            const owlItem = it.closest(".owl-item");
            if (owlItem && /cloned/.test(owlItem.className)) return;
            const org = it.getAttribute("data-org");
            const key = org || (it.innerHTML || "").slice(0, 60);
            if (seen.has(key)) return;
            seen.add(key);
            const cap = it.querySelector("h4");
            const capP = it.querySelector("p");
            const bgEl = it.querySelector('[style*="background-image"]');
            const bg = bgEl ? bgEl.style.backgroundImage.match(IMG_RE) : null;
            const imgEl = it.querySelector("img");
            items.push({
              org: org ? "https://cdn.imweb.me/upload/" + org : null,
              thumb: bg
                ? bg[1]
                : imgEl
                  ? imgEl.getAttribute("data-src") || imgEl.getAttribute("src")
                  : null,
              title: cap ? cap.textContent.replace(/\s+/g, " ").trim() : "",
              desc: capP ? capP.textContent.replace(/\s+/g, " ").trim() : "",
            });
          });
        return { type: "gallery2", layout, anim: meta.getAttribute("data-widget-anim") || "none", items };
      }
      case "code": {
        return { type: "code", html: cleanClone(meta).innerHTML, anim: meta.getAttribute("data-widget-anim") || "none" };
      }
      case "video": {
        const ifr = meta.querySelector("iframe");
        const src = meta.querySelector("video source, video");
        return {
          type: "video",
          src: ifr
            ? ifr.getAttribute("src")
            : src
              ? src.getAttribute("src") || src.src
              : null,
          html: cleanClone(meta).innerHTML,
          anim: meta.getAttribute("data-widget-anim") || "none",
        };
      }
      case "button": {
        const a = meta.querySelector("a");
        const label = meta.querySelector(".btn, button");
        return {
          type: "button",
          text: label ? label.textContent.replace(/\s+/g, " ").trim() : "",
          href: a ? a.getAttribute("href") || "" : "",
          html: cleanClone(meta).innerHTML,
          anim: meta.getAttribute("data-widget-anim") || "none",
        };
      }
      case "board": {
        const listEl = meta.querySelector(".list-style");
        const listCls = listEl ? listEl.className : "";
        return { type: "board", ref: widgetEl.id, listCls };
      }
      default: {
        return { type: type || "unknown", html: cleanClone(meta).innerHTML };
      }
    }
  }

  function walkRows(container) {
    const out = [];
    Array.from(container.children).forEach((el) => {
      const t = el.getAttribute && el.getAttribute("doz_type");
      const cls = typeof el.className === "string" ? el.className : "";
      if (t === "row" || cls.includes("doz_row")) {
        const cols = Array.from(el.children)
          .filter(
            (c) =>
              (c.getAttribute && c.getAttribute("doz_type") === "grid") ||
              (typeof c.className === "string" &&
                c.className.includes("col-dz")),
          )
          .map((c) => ({
            kind: "col",
            grid:
              (c.getAttribute && c.getAttribute("doz_grid")) ||
              (c.className.match(/col-dz-(\d+)/) || [])[1] ||
              "12",
            children: walkRows(c),
          }));
        // measured desktop width drives the row's max-width in the rebuild
        const rowW = Math.round(el.getBoundingClientRect().width);
        out.push({
          kind: "row",
          grid: (el.getAttribute && el.getAttribute("doz_grid")) || "12",
          w: rowW >= 600 ? rowW : undefined,
          cols,
        });
      } else if (t === "widget" || (el.id && /^w20/.test(el.id))) {
        const d = widgetData(el);
        if (d) out.push({ kind: "widget", id: el.id, ...d });
      } else if (el.tagName !== "HEADER") {
        out.push(...walkRows(el));
      }
    });
    return out;
  }

  const sections = [];
  document.querySelectorAll("body > div.section_wrap").forEach((sec) => {
    const cls = typeof sec.className === "string" ? sec.className : "";
    // visual hero sections have no main/inside; they are owl-carousels of slides
    const visual = sec.querySelector(":scope > .visual_section");
    if (visual) {
      const slides = [];
      visual
        .querySelectorAll(".owl-item:not(.cloned) .item")
        .forEach((item) => {
          const style = item.getAttribute("style") || "";
          const bgM = style.match(
            /background-image:\s*url\(["']?([^"')]+)["']?\)/,
          );
          const bgcM = style.match(/background-color:\s*([^;]+);/);
          const fr =
            item.querySelector(".text-wrap._text") ||
            item.querySelector(".fr-view");
          slides.push({
            bg: bgM ? bgM[1] : null,
            bgColor: bgcM ? bgcM[1].trim() : null,
            html: fr ? fr.innerHTML : "",
          });
        });
      sections.push({
        id: sec.id,
        cls,
        visual: slides,
        bg: null,
        bgStyle: "",
        bgColor: null,
        secStyle: sec.getAttribute("style") || "",
        rows: [],
      });
      return;
    }
    const bg = sec.querySelector(":scope > .section_bg");
    const bgStyle = bg ? bg.getAttribute("style") || "" : "";
    const bgMatch = bgStyle.match(IMG_RE);
    const bgUrl = bgMatch ? bgMatch[1] : null;
    const secStyle = sec.getAttribute("style") || "";
    const secBgColor = secStyle.match(
      /background(?:-color)?:\s*(#[0-9a-fA-F]{3,8}|rgb[^;]+)/,
    );
    const main = sec.querySelector(":scope > main");
    if (!main) return;
    const inside = main.querySelector(":scope > .inside") || main;
    sections.push({
      id: sec.id,
      cls,
      bg: bgMatch ? bgMatch[1] : null,
      bgStyle,
      bgColor: secBgColor ? secBgColor[1] : null,
      secStyle,
      rows: walkRows(inside),
    });
  });
  return sections;
}

function EXTRACT_BOARD_LIST() {
  const w = document.querySelector('._widget_data[data-widget-type="board"]');
  if (!w) return null;
  const head = w.querySelector(".board-head .heading header");
  const name = head
    ? head.childNodes[0]
      ? head.childNodes[0].textContent.replace(/\s+/g, " ").trim()
      : ""
    : "";
  const countEl = head ? head.querySelector("em") : null;
  const listEl = w.querySelector(".list-style");
  const listCls = listEl ? listEl.className : "";
  // group links by post idx; keep the variant that carries the real title
  // (boards render desktop rows + hidden mobile duplicate links with empty text)
  const posts = [];
  const byIdx = new Map();
  w.querySelectorAll('a[href*="bmode=view"]').forEach((a) => {
    const href = a.getAttribute("href") || "";
    const m = href.match(/idx=(\d+)/);
    if (!m) return;
    const idx = m[1];
    const tEl =
      a.querySelector(".title") ||
      (/list_text_title/.test(a.className)
        ? a
        : a.querySelector(".list_text_title"));
    const rawTitle = tEl ? tEl.textContent.replace(/\s+/g, " ").trim() : "";
    const cur = byIdx.get(idx);
    if (cur && rawTitle.length <= (cur._titleLen || 0)) return;
    const row =
      a.closest("li, ._post_row, tr, .list-style-card, .post_row") || a;
    const rowText = row.textContent ? row.textContent.replace(/\s+/g, " ") : "";
    // category badge: the em inside the title's wrapping span (not the notice em)
    let category = "";
    const ems = tEl ? tEl.querySelectorAll("span > em") : [];
    ems.forEach((em) => {
      const txt = em.textContent.replace(/\s+/g, " ").trim();
      if (txt && txt !== "공지" && !category) category = txt;
    });
    const titleClone = (tEl || a).cloneNode(true);
    titleClone
      .querySelectorAll("em, .icons, span.icons")
      .forEach((e) => e.remove());
    const noticeEl =
      a.querySelector(".notice-block") || row.querySelector(".notice-block");
    const thumbEl =
      a.querySelector(".card-thumbnail-wrap") ||
      row.querySelector(".card-thumbnail-wrap");
    const thumbMatch = thumbEl
      ? thumbEl.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)
      : null;
    const dateM = rowText.match(/\d{4}-\d{2}-\d{2}/);
    const viewsM = rowText.match(/(?:조회수|조회)\s*(\d+)/);
    const cleanTitle = titleClone.textContent.replace(/\s+/g, " ").trim();
    byIdx.set(idx, {
      idx,
      href: href.startsWith("http") ? href : null,
      title: cleanTitle,
      category,
      _titleLen: cleanTitle.length,
      excerpt: a.querySelector(".text")
        ? a
            .querySelector(".text")
            .textContent.replace(/\s+/g, " ")
            .trim()
            .slice(0, 120)
        : "",
      thumb: thumbMatch ? thumbMatch[1] : null,
      isNotice: noticeEl
        ? getComputedStyle(noticeEl).display !== "none"
        : /(^|\s)(notice|공지)(\s|$)/.test(row.className || ""),
      date: dateM ? dateM[0] : null,
      views: viewsM ? Number(viewsM[1]) : null,
    });
  });
  byIdx.forEach((p) => {
    delete p._titleLen;
    posts.push(p);
  });
  const pagLinks = [
    ...new Set(
      Array.from(w.querySelectorAll('a[href*="page="]')).map((a) =>
        a.getAttribute("href"),
      ),
    ),
  ];
  return {
    name,
    count: countEl ? Number(countEl.textContent) : posts.length,
    listCls,
    posts,
    pagLinks,
  };
}

function EXTRACT_BOARD_DETAIL() {
  const w = document.querySelector('._widget_data[data-widget-type="board"]');
  if (!w) return null;
  const view = w.querySelector(".board_view");
  if (!view) return null;
  const titleEl = view.querySelector("h1.view_tit, .view_tit");
  const contentEl =
    view.querySelector(".board_txt_area .fr-view") ||
    view.querySelector(".board_txt_area");
  const summaryEl = view.querySelector(".board_summary");
  const files = Array.from(view.querySelectorAll(".file_area a")).map((a) => ({
    name: a.textContent.replace(/\s+/g, " ").trim(),
    href: a.href,
  }));
  return {
    title: titleEl ? titleEl.textContent.replace(/\s+/g, " ").trim() : "",
    summary: summaryEl ? summaryEl.textContent.replace(/\s+/g, " ").trim() : "",
    content: contentEl ? contentEl.innerHTML : "",
    files,
  };
}

function EXTRACT_GLOBALS() {
  function cleaned(el) {
    if (!el) return null;
    const c = el.cloneNode(true);
    c.querySelectorAll("script,style,noscript,iframe").forEach((e) =>
      e.remove(),
    );
    return c.outerHTML;
  }
  const header = document.querySelector("#doz_header_wrap");
  const items = [];
  header &&
    Array.from(
      header.querySelectorAll(".viewport-nav.desktop._main_menu > li.dropdown"),
    ).forEach((li) => {
      const a = li.querySelector(":scope > a");
      if (!a) return;
      const children = [];
      li.querySelectorAll(":scope > .dropdown-menu > li").forEach((li2) => {
        const a2 = li2.querySelector("a");
        if (!a2) return;
        children.push({
          name: a2.textContent.replace(/\s+/g, " ").trim(),
          url: a2.getAttribute("data-url") || a2.getAttribute("href"),
        });
      });
      let name = a.textContent.replace(/\s+/g, " ").trim();
      let url = a.getAttribute("data-url") || a.getAttribute("href");
      // some top items render with empty anchor text; fall back to first child label
      if (!name && children.length) {
        name = children[0].name;
        url = url || children[0].url;
      }
      items.push({ name, url, children });
    });
  const logos = header
    ? Array.from(header.querySelectorAll("img"))
        .slice(0, 4)
        .map((i) => ({
          src: i.getAttribute("data-src") || i.src,
          cls: i.className,
          parentCls: i.parentElement ? i.parentElement.className : "",
        }))
    : [];
  const bodyStyle = getComputedStyle(document.body);
  const fontFamilies = new Set();
  document.querySelectorAll("h1,h2,h3,p,span,a").forEach((el) => {
    const ff = getComputedStyle(el).fontFamily;
    if (ff) fontFamilies.add(ff);
  });
  const footerEl =
    document.querySelector("#doz_footer_wrap") ||
    document.querySelector(".footer_wrap") ||
    document.querySelector("footer") ||
    // imweb renders the footer as the last section_wrap on the page
    Array.from(document.querySelectorAll("body > div.section_wrap")).pop() ||
    null;
  const fontsLoaded = Array.from(document.fonts || []).map(
    (f) => f.family + "|" + f.weight,
  );
  return {
    bodyFont: bodyStyle.fontFamily,
    bodyColor: bodyStyle.color,
    bodyBg: bodyStyle.backgroundColor,
    fontFamilies: Array.from(fontFamilies).slice(0, 12),
    fontsLoaded: [...new Set(fontsLoaded)].slice(0, 30),
    nav: items,
    logos,
    footerHtml: cleaned(footerEl),
  };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};
const LOCALE_FILTER = getArg("locales", "ko,en").split(",");
const ONLY = getArg("only", "globals,pages,boards,shots,assets").split(",");
const SHOTS = getArg("shots", "ko").split(",");
const WORKERS = Number(getArg("workers", "4"));

const ASSET_EXT =
  /\.(png|jpe?g|webp|gif|svg|ico|mp4|webm|mp3|woff2?|ttf|otf)(\?|$)/i;
const collectedAssets = new Map(); // url -> localPath

function noteAsset(url) {
  if (!url || !/^https?:\/\//.test(url)) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!ASSET_EXT.test(u.pathname)) return null;
  const local = "/images" + u.pathname;
  const key = u.origin + u.pathname;
  if (!collectedAssets.has(key)) collectedAssets.set(key, local);
  return local;
}

/** collect every asset URL embedded in an arbitrary value */
function harvestAssets(value) {
  if (typeof value === "string") {
    const re = /https?:\/\/[^\s"'<>\)&]+/g;
    let m;
    while ((m = re.exec(value))) {
      noteAsset(m[0]);
    }
  } else if (Array.isArray(value)) value.forEach(harvestAssets);
  else if (value && typeof value === "object")
    Object.values(value).forEach(harvestAssets);
}

/** rewrite all collected asset URLs to local paths inside content JSON */
function rewriteAssets(value) {
  if (typeof value === "string") {
    let out = value;
    for (const [url, local] of collectedAssets) {
      if (out.includes(url)) out = out.split(url).join(local);
      const enc = url.replace(/&/g, "&amp;");
      if (out.includes(enc)) out = out.split(enc).join(local);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map(rewriteAssets);
  if (value && typeof value === "object") {
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = rewriteAssets(v);
    return o;
  }
  return value;
}

async function downloadAssets() {
  const manifest = {};
  const list = [...collectedAssets.entries()];
  console.log(`\n>>> downloading ${list.length} assets ...`);
  let failed = 0,
    i = 0;
  const queue = [...list];
  async function worker() {
    while (queue.length) {
      const [url, local] = queue.shift();
      const dest = path.join(ROOT, "public", local.replace(/^\//, ""));
      try {
        if (!existsSync(dest)) {
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const buf = Buffer.from(await res.arrayBuffer());
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, buf);
        }
        manifest[url] = local;
      } catch (e) {
        failed++;
        console.error("  FAIL " + url + " -> " + e.message);
      }
      i++;
      if (i % 50 === 0) console.log(`  ${i}/${list.length}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`  downloaded: ${list.length - failed}, failed: ${failed}`);
  await fs.writeFile(
    path.join(CONTENT_DIR, "assets-manifest.json"),
    JSON.stringify(manifest, null, 1),
  );
}

// generic parallel task runner over N browser pages
async function runPool(browser, tasks, worker) {
  const queue = [...tasks];
  let idx = 0;
  async function run() {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "ko-KR",
    });
    const page = await ctx.newPage();
    while (true) {
      const i = idx++;
      if (i >= queue.length) break;
      try {
        await worker(page, queue[i], i);
      } catch (e) {
        console.error(
          "  task failed: " +
            (queue[i].url || queue[i].key || "?") +
            " :: " +
            e.message,
        );
      }
    }
    await ctx.close();
  }
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, Math.max(1, tasks.length)) }, run),
  );
}

async function gotoReady(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  try {
    await page.waitForSelector("div.section_wrap, ._widget_data", {
      timeout: 8000,
    });
  } catch {}
  await page.waitForTimeout(500);
}

async function crawl() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  console.log("browser launched, workers=" + WORKERS);

  for (const locale of LOCALE_FILTER) {
    const BASE = LOCALES[locale];
    const L = path.join(CONTENT_DIR, locale);
    await fs.mkdir(path.join(L, "pages"), { recursive: true });
    await fs.mkdir(path.join(L, "boards"), { recursive: true });

    // ---- globals (nav, footer, fonts) ----
    if (ONLY.includes("globals")) {
      const globals = await runPoolOnce(
        browser,
        [{ url: BASE + "/" }],
        async (page, t) => {
          await gotoReady(page, t.url);
          // header nav initializes asynchronously; wait until all 5 top items are named
          await page
            .waitForFunction(
              () => {
                const lis = document.querySelectorAll(
                  "#doz_header_wrap .viewport-nav.desktop._main_menu > li.dropdown",
                );
                const named = Array.from(lis).filter((li) => {
                  const a = li.querySelector(":scope > a");
                  return a && a.textContent.trim().length > 0;
                }).length;
                return named >= 5;
              },
              { timeout: 10000 },
            )
            .catch(() => {});
          await page.waitForTimeout(300);
          return await page.evaluate(EXTRACT_GLOBALS);
        },
      );
      await fs.writeFile(
        path.join(L, "site.json"),
        JSON.stringify(globals[0], null, 2),
      );
      console.log(
        `[${locale}] globals saved (nav items: ${(globals[0].nav || []).length})`,
      );
    }

    // ---- static pages ----
    if (ONLY.includes("pages")) {
      const tasks = Object.entries(STATIC_PAGES).map(([key, src]) => ({
        key,
        url: BASE + src,
      }));
      await runPool(browser, tasks, async (page, t) => {
        await gotoReady(page, t.url);
        const sections = await page.evaluate(EXTRACT_PAGE);
        const title = await page.title();
        const data = { key: t.key, sourceUrl: t.url, title, sections };
        harvestAssets(data);
        await fs.writeFile(
          path.join(L, "pages", t.key.replace(/\//g, ".") + ".json"),
          JSON.stringify(data, null, 2),
        );
        console.log(`[${locale}] page ${t.key} (${sections.length} sections)`);
      });
    }

    // ---- boards + post details ----
    if (ONLY.includes("boards")) {
      const boardTasks = Object.entries(BOARDS_BY_LOCALE[locale]).map(
        ([slug, src]) => ({
          slug,
          src,
        }),
      );
      // 1) list pages
      const boards = await runPoolOnce(browser, boardTasks, async (page, t) => {
        await gotoReady(page, BASE + t.src);
        const b = await page.evaluate(EXTRACT_BOARD_LIST);
        if (!b) {
          console.warn(`[${locale}] board ${t.slug}: no board widget`);
          return null;
        }
        // pagination pages
        const pageUrls = [
          ...new Set(
            (b.pagLinks || [])
              .filter((h) => /[?&]page=\d+/.test(h))
              .map((h) => BASE + h),
          ),
        ];
        b.pageUrls = pageUrls;
        return { ...t, board: b, locale };
      });
      // 2) paginate + collect posts
      const detailTasks = [];
      for (const entry of boards) {
        if (!entry) continue;
        const { board, locale: _l } = entry;
        for (const pu of board.pageUrls || []) {
          const extra = await runPoolOnce(
            browser,
            [{ url: pu }],
            async (page, t) => {
              await gotoReady(page, t.url);
              return await page.evaluate(EXTRACT_BOARD_LIST);
            },
          );
          if (extra && extra[0])
            for (const p of extra[0].posts) {
              if (!board.posts.find((x) => x.idx === p.idx))
                board.posts.push(p);
            }
        }
        console.log(
          `[${locale}] board ${entry.slug}: ${board.posts.length} posts`,
        );
        for (const post of board.posts) {
          const href =
            post.href ||
            `${BASE}${entry.src}?bmode=view&idx=${post.idx}&t=board`;
          detailTasks.push({
            slug: entry.slug,
            locale,
            post,
            href: href.startsWith("http") ? href : BASE + href,
          });
        }
      }
      // 3) post details in parallel
      await runPool(browser, detailTasks, async (page, t) => {
        await gotoReady(page, t.href);
        const detail = await page.evaluate(EXTRACT_BOARD_DETAIL);
        if (detail) {
          t.post.content = detail.content;
          t.post.info = detail.info;
          t.post.files = detail.files;
          harvestAssets(t.post.content);
          harvestAssets((t.post.files || []).map((f) => f.href));
        } else {
          console.warn(
            `  [${t.locale}] ${t.slug}/${t.post.idx}: detail extraction failed`,
          );
        }
      });
      // 4) save
      for (const entry of boards) {
        if (!entry) continue;
        const { board } = entry;
        delete board.pageUrls;
        await fs.writeFile(
          path.join(L, "boards", entry.slug.replace(/\//g, ".") + ".json"),
          JSON.stringify(board, null, 2),
        );
      }
    }

    // ---- screenshots (design reference) ----
    if (ONLY.includes("shots") && SHOTS.includes(locale)) {
      const all = [
        ...Object.entries(STATIC_PAGES).map(([key, src]) => ({
          key,
          url: BASE + src,
        })),
        ...Object.entries(BOARDS_BY_LOCALE[locale]).map(([key, src]) => ({
          key,
          url: BASE + src,
        })),
      ];
      await runPool(browser, all, async (page, t) => {
        await gotoReady(page, t.url);
        await scrollThrough(page);
        const dir = path.join(DESIGN_DIR, locale);
        await fs.mkdir(dir, { recursive: true });
        await page.screenshot({
          path: path.join(dir, t.key.replace(/\//g, ".") + ".jpg"),
          fullPage: true,
          type: "jpeg",
          quality: 72,
        });
        console.log(`  shot ${locale}/${t.key}`);
        // mobile variant for a representative subset
        if (
          ["home", "company/about", "news", "products/eco-wave"].includes(t.key)
        ) {
          const mp = await page.context().newPage();
          await mp.setViewportSize({ width: 390, height: 844 });
          await gotoReady(mp, t.url);
          await scrollThrough(mp);
          await mp.screenshot({
            path: path.join(dir, t.key.replace(/\//g, ".") + ".m390.jpg"),
            fullPage: true,
            type: "jpeg",
            quality: 72,
          });
          await mp.close();
          console.log(`  shot ${locale}/${t.key} @390`);
        }
      });
    }
  }

  await browser.close();

  // ---- assets ----
  if (ONLY.includes("assets")) {
    // harvest from already-saved content JSON (crawl may have run in earlier processes)
    async function harvestDir(dir) {
      for (const f of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) await harvestDir(p);
        else if (f.name.endsWith(".json") && !f.name.includes("manifest")) {
          harvestAssets(JSON.parse(await fs.readFile(p, "utf8")));
        }
      }
    }
    await harvestDir(CONTENT_DIR);
    await downloadAssets();
    let files = 0;
    async function walk(dir) {
      for (const f of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) await walk(p);
        else if (f.name.endsWith(".json") && !f.name.includes("manifest")) {
          const j = JSON.parse(await fs.readFile(p, "utf8"));
          await fs.writeFile(p, JSON.stringify(rewriteAssets(j), null, 2));
          files++;
        }
      }
    }
    await walk(CONTENT_DIR);
    console.log(`rewrote asset URLs in ${files} content files`);
  }
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 700;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1400) setTimeout(step, 50);
        else {
          window.scrollTo(0, 0);
          res();
        }
      };
      step();
    });
  });
  await page.waitForTimeout(300);
}

/** run tasks sequentially on fresh contexts, return collected results */
async function runPoolOnce(browser, tasks, worker) {
  const results = [];
  for (const t of tasks) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "ko-KR",
    });
    const page = await ctx.newPage();
    try {
      results.push(await worker(page, t));
    } catch (e) {
      console.error(
        "  once-task failed: " + (t.url || t.key || "?") + " :: " + e.message,
      );
      results.push(null);
    }
    await ctx.close();
  }
  return results;
}

crawl()
  .then(() => {
    console.log("crawl complete");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
