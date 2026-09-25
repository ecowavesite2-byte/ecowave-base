/**
 * One-shot runtime verification for the home page editor rework:
 *   A) registry/API: home defs follow the page document order; hero/video/code/
 *      image-link defs exist; the footer lives in the `common` group
 *   B) override application: PUT ko/en hero text + a shared image link →
 *      the public `/` and `/en` render them; DELETE (empty PUT) reverts
 *   C) admin UI: `/admin/content?group=home` renders distinct section labels
 *      in document order, the hero card is editable, and an inline save lands
 *      on the public page
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
const MARK = `E2E-HERO-${Date.now()}`;
const LINK_MARK = `https://example.com/e2e-${Date.now()}`;

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

const touched = [];

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
  const putAndTrack = async (key, locale, value) => {
    touched.push({ key, locale });
    return put(key, locale, value);
  };
  const pageHas = async (path, needle) => {
    const res = await fetch(`${BASE}${path}`);
    return (await res.text()).includes(needle);
  };

  /* --------------------------------------------------- A) registry/API shape */
  const homeKo = await getJson("/api/admin/registry?group=home&locale=ko");
  const commonKo = await getJson("/api/admin/registry?group=common&locale=ko");
  const defs = homeKo.defs ?? [];
  const keys = defs.map((d) => d.key);
  const hasKey = (suffix) => keys.some((k) => k.endsWith(suffix));

  // expected section order from the crawl
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
  const orderOk =
    seenSections.length > 0 &&
    seenSections.every((id, i) => expectedOrder[i] === id);

  section("registryShape", {
    homeDefCount: defs.length,
    commonDefCount: (commonKo.defs ?? []).length,
    heroBg: hasKey("visual[0]/bg"),
    heroHtml: hasKey("visual[0]/html"),
    heroMobile: hasKey("visual[1]/html"),
    videoSrc: hasKey("w20250911e68c83742f745/src"),
    codeHtml: keys.some((k) => k.includes("/html") && defs.find((d) => d.key === k)?.label?.ko?.startsWith("코드")),
    imageHref: keys.some((k) => k.endsWith("/href") && defs.find((d) => d.key === k)?.label?.ko?.startsWith("이미지")),
    footerInCommon: (commonKo.defs ?? []).some((d) => d.sectionId === "s20250811f489e3443bdbe"),
    footerNotInHome: !defs.some((d) => d.sectionId === "s20250811f489e3443bdbe"),
    documentOrder: orderOk,
    sectionSequence: seenSections.map((id) => sectionOrder.get(id)),
    expectedSequence: expectedOrder.map((id) => sectionOrder.get(id)),
  });

  /* ------------------------------------------------- B) override application */
  const heroKey = keys.find((k) => k.includes("visual[0]/html"));
  const linkKey = keys.find((k) => k.endsWith("/href") && defs.find((d) => d.key === k)?.label?.ko?.startsWith("이미지"));

  const heroWrite = heroKey ? await putAndTrack(heroKey, "ko", `<p>${MARK}</p>`) : { status: 0 };
  const heroApplied = heroKey ? await pageHas("/", MARK) : false;
  if (heroKey) await put(heroKey, "ko", ""); // revert
  const heroReverted = heroKey ? !(await pageHas("/", MARK)) : false;

  const linkWrite = linkKey ? await putAndTrack(linkKey, "ko", LINK_MARK) : { status: 0 };
  const linkAppliedKo = linkKey ? await pageHas("/", LINK_MARK) : false;
  const linkAppliedEn = linkKey ? await pageHas("/en", LINK_MARK) : false;
  if (linkKey) await put(linkKey, "ko", ""); // revert
  const linkReverted = linkKey ? !(await pageHas("/", LINK_MARK)) : false;

  section("overrideApply", {
    heroKeyFound: Boolean(heroKey),
    heroWriteOk: heroWrite.status === 200,
    heroApplied,
    heroReverted,
    linkKeyFound: Boolean(linkKey),
    linkWriteOk: linkWrite.status === 200,
    linkAppliedKo,
    linkAppliedEn,
    linkReverted,
  });

  /* ------------------------------------------------------------- C) admin UI */
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.context().addCookies([{ name: "ecowave_admin", value: sealed, url: BASE }]);
  await page.goto(`${BASE}/admin/content?group=home`);
  await page.waitForSelector("button[aria-expanded]", { timeout: 60000 });
  await page.waitForTimeout(1500);

  const ui = await page.evaluate(() => {
    const headers = [...document.querySelectorAll("button[aria-expanded]")];
    const labels = headers.map(
      (h) => h.querySelector("span > span")?.textContent?.trim() ?? "",
    );
    const tabs = [...document.querySelectorAll("nav a")].map((a) => a.textContent.trim());
    return { labels, tabs, count: headers.length };
  });
  const labels = ui.labels.filter(Boolean);
  const uniqueLabels = new Set(labels);

  // open the hero card and save an inline edit through the UI
  const heroHeader = page.locator("button[aria-expanded]", { hasText: "메인 비주얼" }).first();
  const heroHeaderFound = (await heroHeader.count()) > 0;
  let uiSaveApplied = false;
  let uiSaveReverted = null;
  if (heroHeaderFound && heroKey) {
    await heroHeader.click();
    await page.waitForTimeout(800);
    // the FieldRow card is the innermost div that carries both the key text and
    // a textarea (the header-row div has no textarea; the body div has no key)
    const card = page.locator('div:has(textarea):has-text("visual[0]/html")').last();
    const textarea = card.locator("textarea").first();
    await textarea.waitFor({ timeout: 15000 });
    await textarea.fill(`<p>${MARK}-UI</p>`);
    await page.waitForTimeout(300);
    const saveBtn = card.locator("button", { hasText: /저장|Save/ }).first();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/admin/registry") && r.request().method() === "PUT",
        { timeout: 20000 },
      ).catch(() => null),
      saveBtn.click(),
    ]);
    // wait for the public page to reflect the edit
    for (let i = 0; i < 20 && !uiSaveApplied; i++) {
      await page.waitForTimeout(1000);
      uiSaveApplied = await pageHas("/", `${MARK}-UI`);
    }
    touched.push({ key: heroKey, locale: "ko" });
    await put(heroKey, "ko", "");
    uiSaveReverted = !(await pageHas("/", MARK + "-UI"));
  }

  // the footer lives in its own `common` tab — it must NOT be in the home list
  await page.goto(`${BASE}/admin/content?group=common`);
  await page.waitForSelector("button[aria-expanded]", { timeout: 60000 });
  await page.waitForTimeout(800);
  const commonLabels = await page.evaluate(() =>
    [...document.querySelectorAll("button[aria-expanded]")]
      .map((h) => h.querySelector("span > span")?.textContent?.trim() ?? "")
      .filter(Boolean),
  );

  section("adminUi", {
    accordionCount: ui.count,
    labelsUnique: labels.length === uniqueLabels.size,
    labelsIncludeHero: labels.some((l) => l.includes("메인 비주얼")),
    labelsExcludeFooter: !labels.some((l) => l.includes("푸터")),
    commonTabPresent: ui.tabs.some((t) => t === "공통" || /common/i.test(t)),
    commonTabShowsFooter: commonLabels.some((l) => l.includes("푸터")),
    heroHeaderFound,
    uiSaveApplied,
    uiSaveReverted,
    labelsSample: labels.slice(0, 10),
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
