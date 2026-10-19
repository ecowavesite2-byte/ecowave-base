/**
 * Client feedback round 6 probe:
 *  1) home text alignment parity KO vs EN (esp. the 3-block solutions section)
 *  2) home image hover scale / clipping in the 3-block solutions section
 * Usage: node scripts/audit/client-feedback-probe.mjs [port]
 */
import { chromium } from "playwright-core";

const PORT = process.argv[2] || "4517";
const BASE = `http://127.0.0.1:${PORT}`;

const browser = await chromium.launch();
const out = {};
for (const locale of ["ko", "en"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(locale === "ko" ? BASE : `${BASE}/en`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  // force reveal animations done
  await page.evaluate(async () => {
    const s = Math.max(300, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.body.scrollHeight; y += s) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 500));
  });

  out[locale] = await page.evaluate(() => {
    const sections = [...document.querySelectorAll("main section")].filter(
      (s) => !s.parentElement?.closest("section"),
    );
    return sections.map((s, i) => {
      const texts = [...s.querySelectorAll(".rich-text")]
        .map((rt) => {
          const widget = rt.closest("[data-widget-id]");
          const col = rt.closest(".imweb-col");
          const wr = widget ? widget.getBoundingClientRect() : null;
          const cr = col ? col.getBoundingClientRect() : null;
          const hs = [...rt.querySelectorAll("h1,h2,h3,h4,h5,h6,p")].filter(
            (e) => e.textContent.trim() || e.querySelector("img"),
          );
          return {
            id: widget?.getAttribute("data-widget-id") || "",
            text: rt.textContent.replace(/\s+/g, " ").trim().slice(0, 70),
            widgetX: wr && Math.round(wr.x),
            widgetW: wr && Math.round(wr.width),
            colX: cr && Math.round(cr.x),
            colW: cr && Math.round(cr.width),
            rtX: Math.round(rt.getBoundingClientRect().x),
            rtW: Math.round(rt.getBoundingClientRect().width),
            lines: hs.slice(0, 4).map((e) => {
              const r = e.getBoundingClientRect();
              const cs = getComputedStyle(e);
              return {
                tag: e.tagName,
                align: cs.textAlign,
                x: Math.round(r.x),
                w: Math.round(r.width),
                textW: Math.round(
                  (() => {
                    const range = document.createRange();
                    range.selectNodeContents(e);
                    return range.getBoundingClientRect().width;
                  })(),
                ),
                txt: e.textContent.replace(/\s+/g, " ").trim().slice(0, 40),
              };
            }),
          };
        })
        .filter((t) => t.text || t.lines.length);
      const imgs = [...s.querySelectorAll("[data-hover-scale='1'] img")].map(
        (img) => {
          const box = img.closest("[data-hover-scale='1']");
          const br = box.getBoundingClientRect();
          const ir = img.getBoundingClientRect();
          return {
            boxId: box.closest("[data-widget-id]")?.getAttribute("data-widget-id"),
            boxW: Math.round(br.width),
            boxH: Math.round(br.height),
            imgX: Math.round(ir.x),
            imgW: Math.round(ir.width),
            imgH: Math.round(ir.height),
          };
        },
      );
      const heading =
        s.querySelector("h6,h2,h3")?.textContent.replace(/\s+/g, " ").trim().slice(0, 50) || "";
      return { i, heading, texts, imgs };
    });
  });
  await page.close();
}

// hover probe on the 3-block section (s20250911384d83602d212 / s20250811e48a3b857667a)
for (const locale of ["ko", "en"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(locale === "ko" ? BASE : `${BASE}/en`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);
  const sel = locale === "ko" ? "section#s20250811e48a3b857667a" : "section#s20250911384d83602d212";
  // sections may not carry ids; find by heading text
  const handles = await page.evaluateHandle((needle) => {
    const all = [...document.querySelectorAll("main section")];
    return all.find((s) => (s.textContent || "").includes(needle)) || null;
  }, locale === "ko" ? "생활환경 솔루션" : "Living Solution");
  const el = handles.asElement();
  if (!el) {
    out[`hover-${locale}`] = "section not found";
    await page.close();
    continue;
  }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const boxes = await el.evaluate((s) =>
    [...s.querySelectorAll("[data-hover-scale='1']")].map((b) => {
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  out[`hover-${locale}`] = [];
  for (const b of boxes) {
    await page.mouse.move(b.x, b.y);
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const hov = document.querySelector("[data-hover-scale='1']:hover");
      if (!hov) return null;
      const img = hov.querySelector("img");
      const box = hov.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      return {
        transform: getComputedStyle(img).transform,
        boxW: Math.round(box.width),
        imgW: Math.round(ir.width),
        imgX: Math.round(ir.x),
        boxX: Math.round(box.x),
        overflowLeft: Math.round(box.x - ir.x),
        overflowRight: Math.round(ir.x + ir.width - (box.x + box.width)),
      };
    });
    out[`hover-${locale}`].push(m);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);
  }
  await page.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 1));
