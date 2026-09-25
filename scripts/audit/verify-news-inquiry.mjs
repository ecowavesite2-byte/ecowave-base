/**
 * One-shot runtime verification for the /news work + inquiry pipeline:
 *   A) header submenu geometry at 1440 (condensed "..." overflow: the
 *      Newsroom flyout must open to the LEFT, fully on-screen)
 *   B) /news search (keyword filters the grid; empty result shows the hint)
 *   C) inquiry form -> Postgres row -> /admin/inquiries list + detail
 *
 * Prints one JSON report with a `pass` flag per section. Cleans up the E2E
 * test rows afterwards. Usage: node scripts/audit/_news-inquiry-verify.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";
import pg from "pg";
import { sealData } from "iron-session";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: [".env.local"], quiet: true });

const PORT = 3123;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_EMAIL = "e2e-test@example.com";

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
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/news`); if (r.ok) return true; } catch {}
    await sleep(2500);
  }
  return false;
}

const results = {};
let pass = true;
const section = (name, data) => {
  const ok = Object.values(data).every((v) => v !== false);
  results[name] = { ...data, pass: ok };
  if (!ok) pass = false;
};

try {
  const ready = await waitReady();
  if (!ready) {
    console.log(JSON.stringify({ devReady: false, devLog: devLog.slice(-1500) }, null, 1));
    killDev();
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  /* ------------------------------------------------------------------ A) header */
  await page.goto(`${BASE}/news`);
  await page.waitForTimeout(3000);
  await page.hover('button[aria-label="더보기"]');
  await page.waitForTimeout(600);
  const newsroom = page.locator("ul.imweb-dropdown a").filter({ hasText: "뉴스룸" }).first();
  const newsroomCount = await newsroom.count();
  if (newsroomCount > 0) {
    await newsroom.hover();
    await page.waitForTimeout(700);
  }
  const geom1440 = await page.evaluate(() => {
    const moreUl = [...document.querySelectorAll("ul.imweb-dropdown")].find((ul) =>
      ul.innerText.includes("뉴스룸"),
    );
    const subLi = document.querySelector('li[class*="group/sub"]');
    const flyout = subLi ? subLi.querySelector("ul.imweb-dropdown") : null;
    const wrap = flyout ? flyout.parentElement : null;
    const r = (el) => (el ? el.getBoundingClientRect().toJSON() : null);
    return {
      more: r(moreUl),
      flyout: r(flyout),
      flyoutVisibility: wrap ? getComputedStyle(wrap).visibility : null,
      viewport: window.innerWidth,
    };
  });
  section("headerSubmenu1440", {
    moreMenuFound: newsroomCount > 0,
    flyoutRendered: geom1440.flyout !== null,
    flyoutVisible: geom1440.flyoutVisibility === "visible",
    opensLeftOfMoreMenu:
      geom1440.flyout && geom1440.more
        ? geom1440.flyout.right <= geom1440.more.left + 1
        : false,
    onScreen: geom1440.flyout
      ? geom1440.flyout.left >= 0 && geom1440.flyout.right <= geom1440.viewport + 1
      : false,
    geom: geom1440,
  });

  // wide viewport (>=1500): full nav — the Newsroom dropdown must also fit
  await page.setViewportSize({ width: 1680, height: 900 });
  await page.goto(`${BASE}/news`);
  await page.waitForTimeout(2000);
  const fullNewsroom = page
    .locator('nav[aria-label="주 메뉴"]')
    .first()
    .locator("a")
    .filter({ hasText: "뉴스룸" })
    .first();
  const fullCount = await fullNewsroom.count();
  if (fullCount > 0) {
    await fullNewsroom.hover();
    await page.waitForTimeout(600);
  }
  const geom1680 = await page.evaluate(() => {
    const drop = document.querySelector('li.group div.imweb-nav-dropdown, li[class~="group"] div.imweb-nav-dropdown');
    const r = drop ? drop.getBoundingClientRect().toJSON() : null;
    return { drop: r, viewport: window.innerWidth };
  });
  section("headerDropdown1680", {
    dropdownFound: fullCount > 0 && geom1680.drop !== null,
    onScreen: geom1680.drop
      ? geom1680.drop.left >= 0 && geom1680.drop.right <= geom1680.viewport + 1
      : false,
    geom: geom1680,
  });

  /* ------------------------------------------------------------------ B) search */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/news`);
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => {
    const titles = [...document.querySelectorAll('a[href^="/news/"] h3')].map((h) =>
      h.innerText.replace(/\s+/g, " ").trim(),
    );
    const countText = document.querySelector("header em")?.textContent ?? null;
    return { titles, countText, url: location.href };
  });
  const cleanTitle = (before.titles[0] || "").replace(/^공지\s*/, "").trim();
  const term = cleanTitle.slice(0, 4).trim() || "에코";
  await page.fill('input[name="keyword"]', term);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/keyword=/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const after = await page.evaluate((t) => {
    const titles = [...document.querySelectorAll('a[href^="/news/"] h3')].map((h) =>
      h.innerText.replace(/\s+/g, " ").trim(),
    );
    return {
      url: location.href,
      titles,
      inputValue: document.querySelector('input[name="keyword"]')?.value ?? null,
      hasNoResults: document.body.innerText.includes("검색 결과가 없습니다"),
    };
  }, term);
  // no-match term
  await page.fill('input[name="keyword"]', "zzzz-no-such-post-zzzz");
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(2500);
  const empty = await page.evaluate(() => ({
    url: location.href,
    titles: document.querySelectorAll('a[href^="/news/"] h3').length,
    hasNoResults: document.body.innerText.includes("검색 결과가 없습니다"),
  }));
  // restore unfiltered count
  await page.goto(`${BASE}/news`);
  await page.waitForTimeout(2000);
  const restoredCount = await page.evaluate(
    () => document.querySelectorAll('a[href^="/news/"] h3').length,
  );
  section("newsSearch", {
    initialCount: before.titles.length,
    term,
    urlCarriesKeyword: after.url.includes("keyword"),
    inputEchoesTerm: after.inputValue === term,
    filteredHasResults: after.titles.length > 0,
    firstResultMatches:
      after.titles.length > 0 &&
      after.titles[0].toLowerCase().includes(term.toLowerCase()),
    filteredCountLteInitial: after.titles.length <= before.titles.length,
    emptyStateShown: empty.hasNoResults && empty.titles === 0,
    restoredCount,
    restoredOk: restoredCount === before.titles.length,
  });

  /* --------------------------------------------------------------- C) inquiry */
  await page.goto(`${BASE}/notices`);
  await page.waitForTimeout(3000);
  await page.fill("#inq-company", "E2E 테스트 회사");
  await page.fill("#inq-contact", "홍길동");
  await page.fill("#inq-phone", "010-1234-5678");
  await page.fill("#inq-email", TEST_EMAIL);
  await page.fill("#inq-address", "서울시 강남구 테스트로 1");
  await page.locator("input[name='products']").first().check();
  await page.locator("input[name='products']").nth(1).check();
  await page.fill("input[name='products_etc']", "기타 제품");
  await page.locator("input[name='oem']").first().check();
  await page.fill("#inq-body", "E2E 검증용 문의입니다. 저장 및 관리자 노출 확인.");
  await page.setInputFiles("input[type='file']", {
    name: "e2e-test.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("e2e"),
  });
  await page.locator("form input[type='checkbox'][required]").check();
  await page.locator("form:has(#inq-company) button[type='submit']").click();
  await page.waitForTimeout(3500);
  const formState = await page.evaluate(() => ({
    successModal: !!document.querySelector("[role='dialog']"),
    modalText: document.querySelector("[role='dialog']")
      ? document.querySelector("[role='dialog']").innerText.replace(/\s+/g, " ").slice(0, 80)
      : null,
    errorShown: !!document.querySelector("[role='alert']"),
    formReset: (document.querySelector("#inq-company") || {}).value === "",
  }));

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const row = (
    await client.query(
      'SELECT id, company, contact, phone, email, address, products, "productsEtc", oem, message, locale, consent, status, "fileName" FROM inquiry WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1',
      [TEST_EMAIL],
    )
  ).rows[0] ?? null;

  const sealed = await sealData(
    { admin: { email: process.env.ADMIN_EMAIL ?? "admin", loggedInAt: Date.now() } },
    { password: process.env.SESSION_SECRET ?? "", ttl: 60 * 60 * 24 * 30 },
  );
  await page.context().addCookies([
    { name: "ecowave_admin", value: sealed, url: BASE },
  ]);
  await page.goto(`${BASE}/admin/inquiries`);
  await page.waitForTimeout(3500);
  const adminList = await page.evaluate(() => ({
    url: location.pathname,
    text: document.body.innerText.replace(/\s+/g, " ").slice(0, 500),
    rowLinks: [...document.querySelectorAll("a[href*='/admin/inquiries/']")]
      .map((a) => a.getAttribute("href"))
      .slice(0, 5),
  }));
  const detailHref = adminList.rowLinks[0];
  let adminDetail = null;
  if (detailHref) {
    await page.goto(`${BASE}${detailHref}`);
    await page.waitForTimeout(2500);
    adminDetail = await page.evaluate(() => ({
      url: location.pathname,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 900),
    }));
  }

  const rowSaved = row !== null;
  section("inquiryPipeline", {
    formSuccessModal: formState.successModal,
    formNoError: !formState.errorShown,
    formResetAfterSubmit: formState.formReset,
    dbRowSaved: rowSaved,
    dbProducts: row ? JSON.stringify(row.products) : null,
    dbFileName: row?.fileName ?? null,
    dbFileNameOk: row?.fileName === "e2e-test.txt",
    adminListShowsRow:
      adminList.url === "/admin/inquiries" &&
      adminList.text.includes("E2E 테스트 회사") &&
      adminList.text.includes(TEST_EMAIL),
    adminDetailFound: adminDetail !== null,
    adminDetailShowsFields:
      adminDetail !== null &&
      adminDetail.text.includes("홍길동") &&
      adminDetail.text.includes("010-1234-5678") &&
      adminDetail.text.includes("기타 제품") &&
      adminDetail.text.includes("e2e-test.txt") &&
      adminDetail.text.includes("E2E 검증용 문의"),
    adminListText: adminList.text,
    adminDetailText: adminDetail?.text ?? null,
    dbRow: row
      ? {
          company: row.company,
          contact: row.contact,
          phone: row.phone,
          email: row.email,
          products: row.products,
          oem: row.oem,
          fileName: row.fileName,
          locale: row.locale,
          status: row.status,
        }
      : null,
  });

  // cleanup E2E rows (keep the table tidy; evidence is in this report)
  const del = await client.query("DELETE FROM inquiry WHERE email = $1", [TEST_EMAIL]);
  results.cleanup = { deletedRows: del.rowCount };
  await client.end();

  await browser.close();
} catch (e) {
  results.error = String((e && e.stack) || e).slice(0, 900);
  pass = false;
} finally {
  killDev();
  results.devLogTail = pass ? undefined : devLog.slice(-1200);
  console.log(JSON.stringify({ pass, results }, null, 1));
}
process.exit(pass ? 0 : 1);
