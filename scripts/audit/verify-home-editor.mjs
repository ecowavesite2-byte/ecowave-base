/**
 * One-shot runtime verification for the home editor + single-source rendering.
 *
 *   A) registry/API: home defs follow the page document order; hero exposes ONE
 *      `visual/slides` list def (no per-slide scalar defs); plain-text `lines`
 *      defs exist; the footer lives in the `common` group
 *   B) `lines` apply: PUT plain text → `/` renders it with the ORIGINAL styling
 *      (tags/styles preserved) → revert
 *   C) `slides` apply: PUT a 3-slide JSON list → `/` renders 3 slides and the
 *      added slide's copy → revert to the 2 authored slides
 *   D) shared image link apply: ko+en → revert
 *   E) admin UI: distinct section labels, hero label, common tab, the slides
 *      list editor renders and "add slide" adds a card, and an inline `lines`
 *      save lands on the public page
 *
 * Cleans up every override it writes. Prints one JSON report.
 * Usage: node scripts/audit/verify-home-editor.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { sealData } from "iron-session";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: [".env.local"], quiet: true });

const PORT = 3124;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const LINE_MARK = `E2E-LINE-${STAMP}`;
const SLIDE_MARK = `E2E-SLIDE-${STAMP}`;
const LINK_MARK = `https://example.com/e2e-${STAMP}`;
// Home text widgets with >=2 runs are split into `title` (run 0) + `desc`
// (runs 1..n) — the vision heading widget is the canonical case.
const TITLE_KEY = "home#s20250811004ea868d7376/w202508116077d50475951/title";
const DESC_KEY = "home#s20250811004ea868d7376/w202508116077d50475951/desc";
const SLIDES_KEY = "home#s20250811b5ffbb4730f67/visual/slides";

const dev = spawn("npx", ["next", "dev", "--port", String(PORT)], {
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let devLog = "";
dev.stdout.on("data", (d) => (devLog += d));
dev.stderr.on("data", (d) => (devLog += d));
const killDev = () => {
  try { spawnSync("taskkill", ["/pid", String(dev.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
};

async function waitReady() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return true; } catch {}
    await sleep(2500);
  }
  return false;
}

const report = {};
let pass = true;
const section = (name, data) => {
  const ok = Object.values(data).every((v) => v !== false);
  report[name] = { ...data, pass: ok };
  if (!ok) pass = false;
};

/** markup shape of the hero: authored slides render one `.hero-slide` each */
const countHeroSlides = async () => {
  const html = await fetch(`${BASE}/`).then((r) => r.text());
  return { html, count: (html.match(/class="hero-slide/g) ?? []).length };
};

try {
  const ready = await waitReady();
  if (!ready) {
    console.log(JSON.stringify({ devReady: false, devLog: devLog.slice(-1500) }, null, 1));
    killDev();
    process.exit(1);
  }

  const sealed = await sealData(
    { admin: { email: process.env.ADMIN_EMAIL ?? "admin", loggedInAt: Date.now() } },
    { password: process.env.SESSION_SECRET ?? "", ttl: 60 * 60 * 24 * 30 },
  );
  const cookie = `ecowave_admin=${sealed}`;

  const getJson = async (path) => {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  };
  const put = async (key, locale, value) => {
    const res = await fetch(`${BASE}/api/admin/registry`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ key, locale, value }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const revert = (key, locale = "ko") => put(key, locale, "");
  const pageText = async (path) => fetch(`${BASE}${path}`).then((r) => r.text());

  /* --------------------------------------------------- A) registry/API shape */
  const homeKo = await getJson("/api/admin/registry?group=home&locale=ko");
  const commonKo = await getJson("/api/admin/registry?group=common&locale=ko");
  const defs = homeKo.defs ?? [];
  const keys = defs.map((d) => d.key);
  const slidesDef = defs.find((d) => d.kind === "slides");
  const linesDefs = defs.filter((d) => d.kind === "lines");
  const legacyHeroDefs = keys.filter((k) => /visual\[\d+\]/.test(k));

  const homeJson = JSON.parse(fs.readFileSync("content/ko/pages/home.json", "utf8"));
  const sectionOrder = new Map(homeJson.sections.map((s, i) => [s.id, i]));
  const seenSections = [];
  for (const def of defs) {
    if (def.sectionId === "board" || def.sectionId === "nav") continue;
    if (seenSections[seenSections.length - 1] !== def.sectionId) seenSections.push(def.sectionId);
  }
  const expectedOrder = [...seenSections].sort(
    (a, b) => (sectionOrder.get(a) ?? -1) - (sectionOrder.get(b) ?? -1),
  );

  section("registryShape", {
    slidesDefPresent: slidesDef?.key === SLIDES_KEY,
    slidesDefKind: slidesDef?.kind === "slides",
    linesDefsPresent: linesDefs.length > 0,
    legacyHeroScalarDefsGone: legacyHeroDefs.length === 0,
    footerInCommon: (commonKo.defs ?? []).some((d) => d.sectionId === "s20250811f489e3443bdbe"),
    footerNotInHome: !defs.some((d) => d.sectionId === "s20250811f489e3443bdbe"),
    documentOrder: seenSections.every((id, i) => expectedOrder[i] === id),
    // Phase 4 model cleanups
    noCodeDefs: !defs.some((d) => d.kind === "textarea"),
    noHrefDefs: !defs.some((d) => d.field === "href"),
    singleUrlDef: defs.filter((d) => d.kind === "url").length === 1,
    overlayCards: defs.filter((d) => d.kind === "overlay").length === 4,
    cardsDefPresent: defs.some((d) => d.kind === "cards"),
    picksDefPresent: defs.some((d) => d.kind === "picks"),
    backToTopGone: !defs.some((d) => d.sectionId === "s2025091161e916b59099f"),
  });

  /* ----------------------------------------------- B) plain-text `lines` apply */
  const titleWrite = await put(TITLE_KEY, "ko", `${LINE_MARK}-TITLE`);
  const descWrite = await put(DESC_KEY, "ko", `${LINE_MARK}-DESC-1\n${LINE_MARK}-DESC-2`);
  const linesHtml = await pageText("/");
  const linesApplied =
    titleWrite.status === 200 &&
    descWrite.status === 200 &&
    linesHtml.includes(`${LINE_MARK}-TITLE`) &&
    linesHtml.includes(`${LINE_MARK}-DESC-1`) &&
    linesHtml.includes(`${LINE_MARK}-DESC-2`);
  // styling must survive: the injected text stays inside the authored 48px span
  const stylePreserved = new RegExp(`font-size: 48px[^>]*>[^<]*${LINE_MARK}-TITLE`).test(
    linesHtml.replace(/<strong>/g, ""),
  );
  await revert(TITLE_KEY);
  await revert(DESC_KEY);
  const linesReverted = !(await pageText("/")).includes(LINE_MARK);

  section("linesApply", {
    titleWriteOk: titleWrite.status === 200,
    descWriteOk: descWrite.status === 200,
    linesApplied,
    stylePreserved,
    linesReverted,
  });

  /* ---------------------------------------------------- C) `slides` list apply */
  const slidesPayload = JSON.stringify([
    { bg: "/images/thumbnail/20250811/50e595a379834.jpg", title: "slide one", subtitle: "sub one" },
    { bg: "/images/thumbnail/20250811/b8cb7e0cebd15.jpg", title: "slide two", subtitle: "sub two" },
    { bg: "/images/thumbnail/20250811/50e595a379834.jpg", title: `slide three ${SLIDE_MARK}`, subtitle: "" },
  ]);
  const slidesWrite = await put(SLIDES_KEY, "ko", slidesPayload);
  const afterSlides = await countHeroSlides();
  const slidesApplied = slidesWrite.status === 200 && afterSlides.count === 3 && afterSlides.html.includes(SLIDE_MARK);
  await revert(SLIDES_KEY);
  const afterRevert = await countHeroSlides();
  const slidesReverted = afterRevert.count === 2 && !afterRevert.html.includes(SLIDE_MARK);

  section("slidesApply", {
    writeOk: slidesWrite.status === 200,
    slideCount: afterSlides.count,
    slidesApplied,
    revertedSlideCount: afterRevert.count,
    slidesReverted,
  });

  /* ------------------------------------------------- D) structured overrides */
  // Overlay cards (vision): raw alt markup values replace the card label/title.
  const overlayDef = defs.find((d) => d.kind === "overlay");
  const overlayAlt =
    `<div class="img-title"><div class="t-wrap"><div class="top-t"><P>${SLIDE_MARK}-LBL</P></div>` +
    `<h5>${SLIDE_MARK}-TTL</h5></div></div>`;
  const overlayWrite = overlayDef ? await put(overlayDef.key, "ko", overlayAlt) : { status: 0 };
  const overlayHtml = await pageText("/");
  const overlayApplied =
    !!overlayDef && overlayWrite.status === 200 && overlayHtml.includes(`${SLIDE_MARK}-TTL`);
  if (overlayDef) await revert(overlayDef.key);
  const overlayReverted = !(await pageText("/")).includes(`${SLIDE_MARK}-TTL`);

  // Location cards: an N-entry list restructures the rendered card nodes.
  const cardsDef = defs.find((d) => d.kind === "cards");
  const cardsPayload = JSON.stringify([
    { lines: ["CARD ONE"] },
    { lines: ["CARD TWO"] },
    { lines: ["CARD THREE"] },
    { lines: [`CARD FOUR ${SLIDE_MARK}`] },
  ]);
  const cardsWrite = cardsDef ? await put(cardsDef.key, "ko", cardsPayload) : { status: 0 };
  const cardsHtml = await pageText("/");
  const cardsApplied = !!cardsDef && cardsWrite.status === 200 && cardsHtml.includes(`CARD FOUR ${SLIDE_MARK}`);
  if (cardsDef) await revert(cardsDef.key);
  const cardsReverted = !(await pageText("/")).includes(`CARD FOUR ${SLIDE_MARK}`);

  // Ticker picks: board + explicit post ids drive the rendered posts.
  const picksDef = defs.find((d) => d.kind === "picks");
  const newsJson = JSON.parse(fs.readFileSync("content/ko/boards/news.json", "utf8"));
  const firstNews = newsJson.posts?.[0];
  const picksPayload = firstNews
    ? JSON.stringify({ board: "news", idxs: [firstNews.idx] })
    : null;
  const picksWrite = picksDef && picksPayload ? await put(picksDef.key, "ko", picksPayload) : { status: 0 };
  const picksHtml = picksPayload ? await pageText("/") : "";
  const picksApplied = !!firstNews && picksWrite.status === 200 && picksHtml.includes(firstNews.title.slice(0, 12));
  if (picksDef) await revert(picksDef.key);

  // Video file source (F2): a file path renders the native player despite the
  // crawled `w.html` iframe being present.
  const videoDef = defs.find((d) => d.kind === "url");
  const videoWrite = videoDef ? await put(videoDef.key, "ko", "/uploads/e2e-test.mp4") : { status: 0 };
  const videoHtml = videoWrite.status === 200 ? await pageText("/") : "";
  const videoApplied = videoWrite.status === 200 && /<video[^>]*e2e-test\.mp4/.test(videoHtml);
  if (videoDef) await revert(videoDef.key);
  const videoReverted = !(await pageText("/")).includes("e2e-test.mp4");

  section("structuredOverrides", {
    overlayDefFound: Boolean(overlayDef),
    overlayWriteOk: overlayWrite.status === 200,
    overlayApplied,
    overlayReverted,
    cardsDefFound: Boolean(cardsDef),
    cardsWriteOk: cardsWrite.status === 200,
    cardsApplied,
    cardsReverted,
    picksDefFound: Boolean(picksDef),
    picksWriteOk: picksWrite.status === 200,
    picksApplied,
    videoDefFound: Boolean(videoDef),
    videoWriteOk: videoWrite.status === 200,
    videoApplied,
    videoReverted,
  });

  /* ------------------------------------------------------------- E) admin UI */
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.context().addCookies([{ name: "ecowave_admin", value: sealed, url: BASE }]);
  await page.goto(`${BASE}/admin/content?group=home`);
  await page.waitForSelector("button[aria-expanded]", { timeout: 60000 });
  await page.waitForTimeout(1500);

  const ui = await page.evaluate(() => ({
    labels: [...document.querySelectorAll("button[aria-expanded]")].map(
      (h) => h.querySelector("span > span")?.textContent?.trim() ?? "",
    ),
    tabs: [...document.querySelectorAll("nav a")].map((a) => a.textContent.trim()),
  }));
  const labels = ui.labels.filter(Boolean);
  const unique = new Set(labels);

  // hero accordion → slides list editor
  const heroHeader = page.locator("button[aria-expanded]", { hasText: "메인 비주얼" }).first();
  const heroHeaderFound = (await heroHeader.count()) > 0;
  let slidesEditorShown = false;
  let addSlideGrewList = false;
  let slidesPrefilled = false;
  let slidesUiSaveApplied = false;
  let slidesUiSaveReverted = null;
  if (heroHeaderFound) {
    await heroHeader.click();
    await page.waitForTimeout(800);
    const addBtn = page.locator("button", { hasText: /슬라이드 추가|Add slide/ }).first();
    slidesEditorShown = (await addBtn.count()) > 0;
    // F1 regression guard: the authored default must PRE-FILL the big/small text
    const firstTitle = page.locator('[data-testid="slide-title"]').first();
    const firstSubtitle = page.locator('[data-testid="slide-subtitle"]').first();
    if ((await firstTitle.count()) > 0 && (await firstSubtitle.count()) > 0) {
      const titleValue = await firstTitle.inputValue();
      const subtitleValue = await firstSubtitle.inputValue();
      slidesPrefilled = titleValue.trim().length > 0 && subtitleValue.trim().length > 0;

      const before = await page.locator("textarea").count();
      if (slidesEditorShown) {
        await addBtn.click();
        await page.waitForTimeout(400);
        addSlideGrewList = (await page.locator("textarea").count()) > before;
      }

      // UI round-trip: edit the big text, save, assert it lands on `/`
      await firstTitle.fill(`${SLIDE_MARK}-UI`);
      await page.waitForTimeout(300);
      const slidesRow = page.locator('div:has(textarea):has-text("visual/slides")').last();
      await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes("/api/admin/registry") && r.request().method() === "PUT",
          { timeout: 20000 },
        ).catch(() => null),
        slidesRow.locator("button", { hasText: /저장|Save/ }).first().click(),
      ]);
      for (let i = 0; i < 20 && !slidesUiSaveApplied; i++) {
        await page.waitForTimeout(800);
        slidesUiSaveApplied = (await pageText("/")).includes(`${SLIDE_MARK}-UI`);
      }
      await revert(SLIDES_KEY);
      slidesUiSaveReverted = !(await pageText("/")).includes(`${SLIDE_MARK}-UI`);
    }
  }

  // lines accordion → inline plain-text save lands on the public page
  const visionHeader = page.locator("button[aria-expanded]", { hasText: "건강하고 깨끗한 물" }).first();
  let linesUiSaveApplied = false;
  let linesUiSaveReverted = null;
  if ((await visionHeader.count()) > 0) {
    await visionHeader.click();
    await page.waitForTimeout(800);
    // the title card carries the widget id + `/title` in its key line
    const field = page.locator('div:has(textarea):has-text("w202508116077d50475951/title")').last();
    const area = field.locator("textarea").first();
    await area.waitFor({ timeout: 15000 });
    await area.fill(`${LINE_MARK}-UI`);
    await page.waitForTimeout(300);
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/admin/registry") && r.request().method() === "PUT",
        { timeout: 20000 },
      ).catch(() => null),
      field.locator("button", { hasText: /저장|Save/ }).first().click(),
    ]);
    for (let i = 0; i < 20 && !linesUiSaveApplied; i++) {
      await page.waitForTimeout(800);
      linesUiSaveApplied = (await pageText("/")).includes(`${LINE_MARK}-UI`);
    }
    await revert(TITLE_KEY);
    await revert(DESC_KEY);
    linesUiSaveReverted = !(await pageText("/")).includes(`${LINE_MARK}-UI`);
  }

  // structured editors render with their testids (open each accordion in turn)
  const editorPresence = { overlay: false, cards: false, picks: false, videoUpload: false };
  const openAndCheck = async (labelText, testid, key) => {
    const header = page.locator("button[aria-expanded]", { hasText: labelText }).first();
    if ((await header.count()) === 0) return;
    if ((await header.getAttribute("aria-expanded")) !== "true") {
      await header.click();
      await page.waitForTimeout(700);
    }
    editorPresence[key] = (await page.locator(`[data-testid="${testid}"]`).count()) > 0;
  };
  await openAndCheck("건강하고 깨끗한 물", "overlay-field", "overlay");
  await openAndCheck("Headquarters", "cards-editor", "cards");
  await openAndCheck("공지사항 티커", "picks-editor", "picks");
  await openAndCheck("물을 깨끗하게", "video-upload", "videoUpload");

  // notice-ticker preview: bespoke .ticker-notice with the cards on ONE row,
  // and toggling a pick must update the preview live.
  let tickerPreviewShown = false;
  let tickerCardsOnOneRow = false;
  let tickerPreviewUpdates = false;
  {
    const header = page.locator("button[aria-expanded]", { hasText: "공지사항 티커" }).first();
    if ((await header.count()) > 0) {
      if ((await header.getAttribute("aria-expanded")) !== "true") {
        await header.click();
        await page.waitForTimeout(700);
      }
      tickerPreviewShown = (await page.locator("aside .ticker-notice").count()) > 0;
      const rects = await page.evaluate(() => {
        const preview = document.querySelector("aside .ticker-notice");
        if (!preview) return [];
        return [...preview.querySelectorAll("a.group.block")].slice(0, 4).map((el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y) };
        });
      });
      if (rects.length >= 4) {
        tickerCardsOnOneRow =
          new Set(rects.map((r) => r.y)).size === 1 && new Set(rects.map((r) => r.x)).size === rects.length;
      }
      const titlesOf = () =>
        page.evaluate(() =>
          [...document.querySelectorAll("aside .ticker-notice h3")].map((h) => h.textContent.trim()).join("|"),
        );
      const titlesBefore = await titlesOf();
      const firstPost = page.locator('[data-testid="picks-editor"] input[type="checkbox"]').first();
      if ((await firstPost.count()) > 0) {
        await firstPost.click();
        await page.waitForTimeout(700);
        tickerPreviewUpdates = (await titlesOf()) !== titlesBefore;
      }
    }
  }

  section("adminUi", {
    accordionCount: ui.labels.length,
    labelsUnique: labels.length === unique.size,
    labelsIncludeHero: labels.some((l) => l.includes("메인 비주얼")),
    labelsExcludeFooter: !labels.some((l) => l.includes("푸터")),
    commonTabPresent: ui.tabs.some((t) => t === "공통" || /common/i.test(t)),
    heroHeaderFound,
    slidesEditorShown,
    addSlideGrewList,
    slidesPrefilled,
    slidesUiSaveApplied,
    slidesUiSaveReverted,
    linesUiSaveApplied,
    linesUiSaveReverted,
    overlayEditorShown: editorPresence.overlay,
    cardsEditorShown: editorPresence.cards,
    picksEditorShown: editorPresence.picks,
    videoUploadShown: editorPresence.videoUpload,
    tickerPreviewShown,
    tickerCardsOnOneRow,
    tickerPreviewUpdates,
    labelsSample: labels.slice(0, 8),
  });

  await browser.close();
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 900);
  pass = false;
} finally {
  killDev();
  report.devLogTail = pass ? undefined : devLog.slice(-1200);
  console.log(JSON.stringify({ pass, report }, null, 1));
}
process.exit(pass ? 0 : 1);
