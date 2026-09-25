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
const LINES_KEY = "home#s20250811004ea868d7376/w202508116077d50475951/html";
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
  });

  /* ----------------------------------------------- B) plain-text `lines` apply */
  const linesWrite = await put(LINES_KEY, "ko", `${LINE_MARK}-ONE\n${LINE_MARK}-TWO`);
  const linesHtml = await pageText("/");
  const linesApplied =
    linesWrite.status === 200 && linesHtml.includes(`${LINE_MARK}-ONE`) && linesHtml.includes(`${LINE_MARK}-TWO`);
  // styling must survive: the injected text stays inside the authored 48px span
  const stylePreserved = new RegExp(`font-size: 48px[^>]*>[^<]*${LINE_MARK}-ONE`).test(linesHtml.replace(/<strong>/g, ""));
  await revert(LINES_KEY);
  const linesReverted = !(await pageText("/")).includes(LINE_MARK);

  section("linesApply", {
    writeOk: linesWrite.status === 200,
    linesApplied,
    stylePreserved,
    linesReverted,
  });

  /* ---------------------------------------------------- C) `slides` list apply */
  const slidesPayload = JSON.stringify([
    { bg: "/images/thumbnail/20250811/50e595a379834.jpg", html: "slide one" },
    { bg: "/images/thumbnail/20250811/b8cb7e0cebd15.jpg", html: "slide two" },
    { bg: "/images/thumbnail/20250811/50e595a379834.jpg", html: `slide three ${SLIDE_MARK}` },
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

  /* ------------------------------------------------- D) shared image href apply */
  const linkDef = defs.find((d) => d.field === "href" && d.label.ko.startsWith("이미지"));
  const linkWrite = linkDef ? await put(linkDef.key, "ko", LINK_MARK) : { status: 0 };
  const linkKo = linkDef ? (await pageText("/")).includes(LINK_MARK) : false;
  const linkEn = linkDef ? (await pageText("/en")).includes(LINK_MARK) : false;
  if (linkDef) await revert(linkDef.key);
  const linkReverted = linkDef ? !(await pageText("/")).includes(LINK_MARK) : false;

  section("linkApply", {
    linkDefFound: Boolean(linkDef),
    writeOk: linkWrite.status === 200,
    appliedKo: linkKo,
    appliedEn: linkEn,
    reverted: linkReverted,
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
  if (heroHeaderFound) {
    await heroHeader.click();
    await page.waitForTimeout(800);
    const addBtn = page.locator("button", { hasText: /슬라이드 추가|Add slide/ }).first();
    slidesEditorShown = (await addBtn.count()) > 0;
    const before = await page.locator("textarea").count();
    if (slidesEditorShown) {
      await addBtn.click();
      await page.waitForTimeout(400);
      addSlideGrewList = (await page.locator("textarea").count()) > before;
    }
  }

  // lines accordion → inline plain-text save lands on the public page
  const visionHeader = page.locator("button[aria-expanded]", { hasText: "건강하고 깨끗한 물" }).first();
  let linesUiSaveApplied = false;
  let linesUiSaveReverted = null;
  if ((await visionHeader.count()) > 0) {
    await visionHeader.click();
    await page.waitForTimeout(800);
    const field = page.locator('div:has(textarea):has-text("w202508116077d50475951")').last();
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
    await revert(LINES_KEY);
    linesUiSaveReverted = !(await pageText("/")).includes(`${LINE_MARK}-UI`);
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
    linesUiSaveApplied,
    linesUiSaveReverted,
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
