/**
 * One-shot runtime verification for the admin-dashboard restructure (IA).
 *
 *   A) sidebar / IA (`/admin`, authenticated): the Content group links include
 *      뉴스·공지사항 → `/admin/content?group=boards`, 사이트 내비게이션 →
 *      `group=site`, 푸터 → `group=common`; there is NO 게시판/Boards group and
 *      NO 사이트 설정 link (nor any `/admin/settings` or `/admin/boards` href)
 *      anywhere in the sidebar.
 *   B) legacy redirects (followed, authenticated): `/admin/settings` →
 *      `…/admin/content?group=site`; `/admin/boards` → `group=boards`;
 *      `/admin/boards/news` → `group=boards`;
 *      `/admin/boards/products.eco-wave` → `group=products`.
 *   C) News & Notices tab (`group=boards`): the News|Notices segmented control
 *      exists; switching to Notices swaps the embedded board editor (news →
 *      notices slug, both board-name inputs render in turn). The embedded editor
 *      shows a board-name field, a posts table / empty state and an add-post
 *      button. The date control is a native `type=date` picker. Edit is ENABLED
 *      on the news board whether it shows crawled defaults OR a materialized
 *      override set; the board's materialization state is recorded only as
 *      informational `newsBaseline` metadata and NEVER affects pass/fail.
 *      Clicking Edit opens the two-pane editor + preview, the preview shows the
 *      draft title (and updates live when a marker is typed into the title), and
 *      cancelling writes nothing (verified against `/api/admin/boards`). Clicking add-post
 *      renders the PostForm with a title, a content textarea AND the thumbnail
 *      upload control (URL input + image-upload label + image file input) — the
 *      form is never saved. Also asserts the board-name input does not run under
 *      its 저장 button, and (when the form opens) the thumbnail URL input does not
 *      run under its upload control — `input.right <= control.left` (+1px
 *      tolerance) at 1440px.
 *      REQUIRES DATABASE_URL (the embedded editor reads `/api/admin/boards`);
 *      a missing DB is reported as a blocker and fails the run.
 *   D) Site navigation (`group=site`): ≥5 nav-item headings and 38 text inputs
 *      (19 defs × KO/EN) render, and NO preview pane (the `<aside>` the other
 *      tabs show) exists on this tab.
 *   E) Footer (`group=common`): opening the section renders a preview pane whose
 *      `[data-footer]` carries the injected sitemap links and the copyright text
 *      (the real public footer markup, not a placeholder).
 *   F) Public footer sanity (`/`, ko): `[data-footer]` renders with sitemap
 *      child links and the copyright — guards the shared-module refactor.
 *   G) News board round-trip (authenticated API): GET the resolved news board,
 *      PREPEND a marker clone of an existing post via PUT `{action:"replace"}`,
 *      assert the marker title renders on `/news` (ko), then restore the exact
 *      baseline (the original posts, or `[]` when the board had no overrides)
 *      and assert the marker is gone and the effective post list matches.
 *
 * Uses dev port 3133 (siblings use 3123/3131/3132; 4517 is the standing server)
 * so it cannot clash. Guaranteed cleanup: the dev server is killed and the board
 * is restored in a finally path. Writes a machine-readable report to
 * design/audit/admin-ia/report.json plus screenshots (`design/` is gitignored).
 * Non-zero exit on any failure or blocker.
 *
 * NOTE: `ThumbnailField.tsx` carries NO `data-testid`; the thumbnail control is
 * detected structurally (placeholder `/images/…` URL input + "이미지 업로드"
 * upload label + image file input) and the absence of a testid is recorded.
 *
 * Hydration hardening: every click that opens a client-rendered surface (the
 * boards sub-tab, the edit dialog + its cancel, the add-post form, the footer
 * accordion) retries up to 3× (15s each) before a final 90s wait, so a `next
 * dev` click swallowed before React hydrates cannot false-fail the audit while a
 * genuine regression still fails loudly.
 *
 * Usage: node scripts/audit/verify-admin-ia.mjs [--port=3133]
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { sealData } from "iron-session";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: [".env.local"], quiet: true });

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};
const PORT = Number(getArg("port", "3133"));
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const OUT = path.resolve("design", "audit", "admin-ia");

const MARK_TITLE = `E2E-ADMINIA-NEWS-${STAMP}`;
const MARK_IDX = `e2e-adminia-${STAMP}`;
/** Marker typed into the edit dialog's title to prove the preview is live. */
const EDIT_MARK = `E2E-EDIT-PREVIEW-${STAMP}`;

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

const report = { base: BASE, port: PORT, out: path.relative(process.cwd(), OUT) };
let pass = true;
const blockers = [];
const section = (name, data) => {
  const ok = Object.values(data).every((v) => v !== false);
  report[name] = { ...data, pass: ok };
  if (!ok) pass = false;
};
const shot = async (page, name) => {
  try {
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    report.screenshots = { ...(report.screenshots ?? {}), [name]: true };
  } catch (e) {
    report.screenshots = { ...(report.screenshots ?? {}), [name]: String(e).slice(0, 120) };
  }
};

/**
 * Dev-mode hydration guard for flaky clicks.
 *
 * In `next dev` the SSR HTML renders before React attaches handlers, so a click
 * dispatched too early is silently swallowed (the button is visible but inert).
 * Retry the click a bounded number of times, each followed by a short wait for
 * the target; stop as soon as it appears. After the loop a final generous wait
 * runs so a genuine app regression still fails loudly (throws) instead of
 * passing silently.
 *
 *   click     – closure dispatching one click (re-resolved on every attempt).
 *   waitReady – `({ timeout }) => Promise` resolving once the target is present.
 *   isReady   – optional `() => Promise<boolean>`; when true on a retry, skip the
 *               re-click (avoids toggling an accordion closed after a swallowed
 *               wait).
 *
 * Section semantics are unchanged: callers that previously threw on a genuine
 * failure still do (the final wait throws); callers that contained the failure
 * still catch it.
 */
const HYDRATION_ATTEMPTS = 3;
const HYDRATION_ATTEMPT_MS = 15000;
const HYDRATION_FINAL_MS = 90000;
const clickWithRetry = async (
  click,
  waitReady,
  { attempts = HYDRATION_ATTEMPTS, attemptTimeout = HYDRATION_ATTEMPT_MS, isReady } = {},
) => {
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0 && isReady) {
      try { if (await isReady()) return true; } catch {}
    }
    await click();
    try {
      await waitReady({ timeout: attemptTimeout });
      return true;
    } catch {}
  }
  await waitReady({ timeout: HYDRATION_FINAL_MS });
  return true;
};

let browser;
let boardDirty = false;
let restoreBoard = async () => {};

try {
  if (!(await waitReady())) {
    report.devReady = false;
    report.devLog = devLog.slice(-1500);
    pass = false;
    killDev();
    console.log(JSON.stringify({ pass, report }, null, 1));
    process.exit(1);
  }

  const dbConfigured = Boolean(process.env.DATABASE_URL);
  if (!dbConfigured) {
    blockers.push(
      "DATABASE_URL is not configured; the embedded board editor and the news round-trip were not run",
    );
  }

  const sealed = await sealData(
    { admin: { email: process.env.ADMIN_EMAIL ?? "admin", loggedInAt: Date.now() } },
    { password: process.env.SESSION_SECRET ?? "", ttl: 60 * 60 * 24 * 30 },
  );
  const cookie = `ecowave_admin=${sealed}`;

  const fetchHtml = async (p) => {
    const res = await fetch(`${BASE}${p}`, { headers: { "Cache-Control": "no-cache" } });
    return await res.text();
  };
  const getBoardDetail = async () => {
    const res = await fetch(`${BASE}/api/admin/boards?locale=ko&slug=news`, {
      headers: { Cookie: cookie },
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };
  const putBoard = async (body) => {
    const res = await fetch(`${BASE}/api/admin/boards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok && json.ok === true, body: json };
  };

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "ecowave_admin", value: sealed, url: BASE }]);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  fs.mkdirSync(OUT, { recursive: true });

  /* --------------------------------------------------- A) sidebar / IA */

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('nav[aria-label="에코웨이브 관리자"] a');
  const sidebar = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="에코웨이브 관리자"]');
    const links = [...nav.querySelectorAll("a")].map((a) => ({
      text: (a.textContent || "").trim(),
      href: a.getAttribute("href") || "",
    }));
    const groupLabels = [...nav.querySelectorAll("p")].map((p) => (p.textContent || "").trim());
    return { links, groupLabels };
  });
  const hasLink = (href, text) =>
    sidebar.links.some((l) => l.href === href && l.text === text);
  section("sidebar", {
    linkCount: sidebar.links.length,
    boardsContentLink: hasLink("/admin/content?group=boards", "뉴스·공지사항"),
    siteContentLink: hasLink("/admin/content?group=site", "사이트 내비게이션"),
    commonContentLink: hasLink("/admin/content?group=common", "푸터"),
    noQueryLessContentLink: !sidebar.links.some((l) => l.href === "/admin/content"),
    noBoardsGroupLabel: !sidebar.groupLabels.some((t) => t === "게시판"),
    noBoardsLinkText: !sidebar.links.some((l) => l.text === "게시판"),
    noSettingsLinkText: !sidebar.links.some((l) => l.text === "사이트 설정"),
    noSettingsHref: !sidebar.links.some((l) => l.href.includes("/admin/settings")),
    noBoardsHref: !sidebar.links.some((l) => l.href.includes("/admin/boards")),
    links: sidebar.links,
    groupLabels: sidebar.groupLabels,
  });
  await shot(page, "sidebar");

  /* ------------------------------------------------------ B) redirects */

  const REDIRECTS = [
    ["/admin/settings", "group=site"],
    ["/admin/boards", "group=boards"],
    ["/admin/boards/news", "group=boards"],
    ["/admin/boards/products.eco-wave", "group=products"],
  ];
  const redirectChecks = {};
  for (const [from, expect] of REDIRECTS) {
    try {
      const res = await fetch(`${BASE}${from}`, {
        redirect: "follow",
        headers: { Cookie: cookie, "Cache-Control": "no-cache" },
      });
      await res.text().catch(() => "");
      redirectChecks[from] = {
        status: res.status,
        finalUrl: res.url,
        ok: res.status === 200 && res.url.includes(`/admin/content?${expect}`),
      };
    } catch (e) {
      redirectChecks[from] = { status: 0, finalUrl: null, ok: false, error: String(e).slice(0, 160) };
    }
  }
  section("redirects", {
    ...Object.fromEntries(
      Object.entries(redirectChecks).flatMap(([from, v]) => [
        [`${from}:status`, v.status === 200],
        [`${from}:final`, v.ok],
      ]),
    ),
    redirectChecks,
  });

  /* ------------------------------------------- C) News & Notices tab */

  await page.goto(`${BASE}/admin/content?group=boards`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('div.mt-6.rounded-lg input[type="text"]');

  const readSlug = () =>
    page.evaluate(() => {
      const vals = [...document.querySelectorAll("span.font-mono")].map((s) =>
        (s.textContent || "").trim(),
      );
      return vals.find((v) => v === "news" || v === "notices") ?? null;
    });

  /**
   * Bounding-box guard for the layout defect this section regressed: the
   * board-name TextInput is `w-full`, so it must be wrapped in a `min-w-0
   * flex-1` container with a `shrink-0` save button, otherwise the input runs
   * into / under the button. Asserts input.right <= button.left (+1px).
   */
  const measureBoardNameRow = () =>
    page.evaluate(() => {
      const card = document.querySelector("div.mt-6.rounded-lg");
      if (!card) return null;
      const input = card.querySelector('input[type="text"]');
      const button = [...card.querySelectorAll("button")].find(
        (b) => (b.textContent || "").trim() === "저장",
      );
      if (!input || !button) return null;
      const ir = input.getBoundingClientRect();
      const br = button.getBoundingClientRect();
      return {
        inputRight: Math.round(ir.right),
        buttonLeft: Math.round(br.left),
        gap: Math.round(br.left - ir.right),
        inputWidth: Math.round(ir.width),
      };
    });

  /** Same guard for the post form's thumbnail URL input vs its upload control. */
  const measureThumbnailRow = () =>
    page.evaluate(() => {
      const input = document.querySelector('input[placeholder^="/images/"]');
      if (!input) return null;
      // `closest(".flex")` matches the row (`flex items-start gap-2`); the inner
      // wrapper is `min-w-0 flex-1` (a different class token), so it is skipped.
      const row = input.closest(".flex");
      const label = row ? row.querySelector("label") : null;
      if (!row || !label) return null;
      const ir = input.getBoundingClientRect();
      const lr = label.getBoundingClientRect();
      return {
        inputRight: Math.round(ir.right),
        controlLeft: Math.round(lr.left),
        gap: Math.round(lr.left - ir.right),
        inputWidth: Math.round(ir.width),
      };
    });

  const segNews = page.getByRole("button", { name: "뉴스", exact: true });
  const segNotices = page.getByRole("button", { name: "공지사항", exact: true });
  const segNewsCount = await segNews.count();
  const segNoticesCount = await segNotices.count();

  const nameInput = page.locator('div.mt-6.rounded-lg input[type="text"]').first();
  const nameCountNews = await nameInput.count();
  const nameNews = nameCountNews > 0 ? await nameInput.inputValue().catch(() => null) : null;
  const slugNews = await readSlug();
  const boardNameBoxNews = nameCountNews > 0 ? await measureBoardNameRow() : null;

  const tableCount = await page.locator("table").count();
  const emptyStateCount = await page.getByText("게시물이 없습니다.").count();
  const addPostBtn = page.getByRole("button", { name: "게시물 추가", exact: true });
  const addPostCount = await addPostBtn.count();

  // --- Edit is enabled on the news board + live preview ---
  // Edit must be usable whether the board shows the crawled defaults or a
  // materialized override set (it writes the whole list via `replace`). The
  // materialization state below is INFORMATIONAL ONLY: it is reported nested
  // under `newsBaseline` and never as a top-level section flag, so a seeded
  // board can never false-fail this audit.
  const newsWasNonMaterialized = await page.evaluate(() =>
    document.body.innerText.includes("크롤링 기본값"),
  );
  const editButtons = page.getByRole("button", { name: "수정", exact: true });
  const editButtonCount = await editButtons.count();
  const editEnabled = editButtonCount > 0 ? await editButtons.first().isEnabled() : false;

  const newsDetailBefore = dbConfigured ? await getBoardDetail() : { body: {} };
  const newsFirst = Array.isArray(newsDetailBefore.body.posts) ? newsDetailBefore.body.posts[0] : null;
  const newsFirstTitle = newsFirst?.title || "";
  const newsFirstIdx = newsFirst?.idx || "";

  let editDialogOpened = false;
  let editPreviewShowsTitle = false;
  let editPreviewLiveUpdate = false;
  let editCancelClosed = false;
  let editCancelNoWrite = false;
  if (dbConfigured && editButtonCount > 0) {
    await clickWithRetry(
      () => editButtons.first().click(),
      (o) => page.waitForSelector('[data-testid="post-edit-dialog"]', o),
      {
        isReady: async () =>
          (await page.locator('[data-testid="post-edit-dialog"]').count()) > 0,
      },
    )
      .then(() => { editDialogOpened = true; })
      .catch(() => { editDialogOpened = false; });

    if (editDialogOpened) {
      const previewText = await page
        .locator('[data-testid="post-edit-preview"]')
        .innerText()
        .catch(() => "");
      editPreviewShowsTitle = newsFirstTitle
        ? previewText.includes(newsFirstTitle)
        : previewText.includes(newsFirstIdx);

      // Type a marker into the title; the preview must update from the draft.
      await page
        .locator('[data-testid="post-edit-dialog"] [data-testid="post-form-title"] input')
        .fill(EDIT_MARK)
        .catch(() => {});
      try {
        await page.waitForFunction(
          (m) =>
            (document.querySelector('[data-testid="post-edit-preview"]')?.textContent || "").includes(
              m,
            ),
          EDIT_MARK,
          { timeout: 10000 },
        );
        editPreviewLiveUpdate = true;
      } catch {
        editPreviewLiveUpdate = false;
      }

      // Cancel WITHOUT saving; the board must be unchanged.
      await clickWithRetry(
        () =>
          page
            .locator('[data-testid="post-edit-dialog"] [data-testid="post-form-cancel"]')
            .click(),
        (o) =>
          page.waitForSelector('[data-testid="post-edit-dialog"]', {
            ...o,
            state: "detached",
          }),
        {
          isReady: async () =>
            (await page.locator('[data-testid="post-edit-dialog"]').count()) === 0,
        },
      )
        .then(() => { editCancelClosed = true; })
        .catch(() => {});
    }

    const newsDetailAfter = await getBoardDetail();
    const beforeIdx = JSON.stringify((newsDetailBefore.body.posts || []).map((p) => p.idx));
    const afterIdx = JSON.stringify((newsDetailAfter.body.posts || []).map((p) => p.idx));
    editCancelNoWrite = beforeIdx === afterIdx;
  }

  let nameCountNotices = 0;
  let nameNotices = null;
  let slugNotices = null;
  let boardNameBoxNotices = null;
  if (segNoticesCount > 0) {
    await clickWithRetry(
      () => segNotices.first().click(),
      (o) =>
        page.waitForFunction(
          () =>
            [...document.querySelectorAll("span.font-mono")].some(
              (s) => (s.textContent || "").trim() === "notices",
            ),
          null,
          o,
        ),
      { isReady: async () => (await readSlug()) === "notices" },
    );
    await page.waitForSelector('div.mt-6.rounded-lg input[type="text"]');
    nameCountNotices = await nameInput.count();
    nameNotices = nameCountNotices > 0 ? await nameInput.inputValue().catch(() => null) : null;
    slugNotices = await readSlug();
    boardNameBoxNotices = nameCountNotices > 0 ? await measureBoardNameRow() : null;
  }

  // Open the add-post form (never saved) and inspect the controls.
  let titleInputCount = 0;
  let contentAreaCount = 0;
  let thumbUrlInputCount = 0;
  let thumbUploadLabel = false;
  let thumbLabelText = false;
  let thumbFileInputCount = 0;
  let thumbTestidCount = 0;
  let formOpened = false;
  let thumbnailBox = null;
  let datePickerCount = 0;
  let dateTextInputCount = 0;
  if (addPostCount > 0 && dbConfigured) {
    await clickWithRetry(
      () => addPostBtn.first().click(),
      (o) => page.waitForSelector('[data-testid="post-form-title"]', o),
      {
        isReady: async () =>
          (await page.locator('[data-testid="post-form-title"]').count()) > 0,
      },
    );
    formOpened = true;
    const form = page.locator('form:has([data-testid="post-form-title"])');
    titleInputCount = await form.locator('[data-testid="post-form-title"] input').count();
    contentAreaCount = await form.locator('[data-testid="post-form-content"]').count();
    thumbUrlInputCount = await form.locator('input[placeholder^="/images/"]').count();
    thumbFileInputCount = await form
      .locator('input[type="file"][accept*="image/webp"]')
      .count();
    thumbTestidCount = await form.locator('[data-testid*="thumb"]').count();
    // News/notices now use the product branch's native date picker.
    datePickerCount = await form
      .locator('input[type="date"][data-testid="post-form-date"]')
      .count();
    dateTextInputCount = await form
      .locator('input[type="text"][data-testid="post-form-date"]')
      .count();
    const formText = await form.innerText().catch(() => "");
    thumbUploadLabel = formText.includes("이미지 업로드");
    thumbLabelText = formText.includes("썸네일");
    thumbnailBox = await measureThumbnailRow();
  }

  section("newsNoticesTab", {
    segmentedNews: segNewsCount > 0,
    segmentedNotices: segNoticesCount > 0,
    boardNameFieldNews: nameCountNews > 0,
    boardNameFieldNotices: nameCountNotices > 0,
    slugIsNews: slugNews === "news",
    slugSwitchedToNotices: slugNotices === "notices",
    boardEditorChanged:
      slugNews === "news" && slugNotices === "notices" && nameCountNews > 0 && nameCountNotices > 0,
    postsTableOrEmptyState: tableCount > 0 || emptyStateCount > 0,
    addPostButton: addPostCount > 0,
    // Edit/Delete are no longer gated on materialization; the live edit dialog
    // previews the draft and cancelling writes nothing.
    editButtonPresent: editButtonCount > 0,
    editEnabled,
    editDialogOpened,
    editPreviewShowsTitle,
    editPreviewLiveUpdate,
    editCancelClosed,
    editCancelNoWrite,
    formOpened,
    postFormTitle: titleInputCount > 0,
    postFormContent: contentAreaCount > 0,
    thumbnailUrlInput: thumbUrlInputCount > 0,
    thumbnailUploadLabel: thumbUploadLabel,
    thumbnailLabelText: thumbLabelText,
    thumbnailFileInput: thumbFileInputCount > 0,
    thumbnailTestIdAbsent: thumbTestidCount === 0,
    datePickerTypeDate: datePickerCount === 1,
    dateIsPickerNotText: datePickerCount === 1 && dateTextInputCount === 0,
    datePickerCount,
    dateTextInputCount,
    // Layout regression guards: full-width inputs must not run under their
    // sibling button/upload control (input.right <= control.left + 1px).
    boardNameInputNoOverlap:
      (boardNameBoxNews ? boardNameBoxNews.gap >= -1 : true) &&
      (boardNameBoxNotices ? boardNameBoxNotices.gap >= -1 : true),
    boardNameBoxes: { news: boardNameBoxNews, notices: boardNameBoxNotices },
    ...(thumbnailBox
      ? { thumbnailInputNoOverlap: thumbnailBox.gap >= -1, thumbnailBox }
      : {}),
    values: { nameNews, nameNotices, slugNews, slugNotices },
    // Informational only: `section()` inspects TOP-LEVEL values, so a nested
    // object can never flip this section to fail (a seeded/materialized news
    // board would otherwise false-fail on `wasNonMaterialized: false`).
    newsBaseline: { wasNonMaterialized: newsWasNonMaterialized },
  });
  await shot(page, "news-notices");

  /* --------------------------------------------- D) Site navigation */

  await page.goto(`${BASE}/admin/content?group=site`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("div.space-y-5 section");
  const siteNav = await page.evaluate(() => {
    const wrap = document.querySelector("div.space-y-5");
    const sections = wrap ? [...wrap.querySelectorAll(":scope > section")] : [];
    const headings = sections.map((s) => (s.querySelector("h2")?.textContent || "").trim());
    // Informational: first nav card width vs its KO/EN input widths (a 2-col
    // grid should make each input ~half the card; much less means unused space).
    let layout = null;
    const list = sections[0] ? sections[0].querySelector("div.mt-2") : null;
    const card = list ? list.firstElementChild : null;
    if (card) {
      const cr = card.getBoundingClientRect();
      const inputs = [...card.querySelectorAll('input[type="text"]')];
      layout = {
        cardWidth: Math.round(cr.width),
        inputWidths: inputs.map((i) => Math.round(i.getBoundingClientRect().width)),
      };
    }
    return {
      sectionCount: sections.length,
      headings,
      inputCount: wrap ? wrap.querySelectorAll('input[type="text"]').length : -1,
      asideCount: document.querySelectorAll("aside").length,
      previewTitlePresent: document.body.innerText.includes("미리보기"),
      layout,
    };
  });
  section("siteNavigationTab", {
    navHeadingsAtLeast5: siteNav.sectionCount >= 5,
    navHeadingCount: siteNav.sectionCount,
    textInputs38: siteNav.inputCount === 38,
    textInputCount: siteNav.inputCount,
    noPreviewPane: siteNav.asideCount === 0,
    previewAsideCount: siteNav.asideCount,
    noPreviewTitle: siteNav.previewTitlePresent === false,
    headings: siteNav.headings,
    layout: siteNav.layout,
  });
  await shot(page, "site-nav");

  /* ------------------------------------------------------ E) Footer */

  await page.goto(`${BASE}/admin/content?group=common`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button[aria-expanded]");
  await clickWithRetry(
    () => page.locator("button[aria-expanded]").first().click(),
    (o) => page.waitForSelector("aside [data-footer]", { ...o, state: "attached" }),
    {
      isReady: async () =>
        (await page.locator("aside [data-footer]").count()) > 0,
    },
  );
  const footerPreview = await page.evaluate(() => {
    const footer = document.querySelector("aside [data-footer]");
    const text = footer ? (footer.textContent || "").replace(/\s+/g, " ") : "";
    return {
      found: Boolean(footer),
      linkCount: footer ? footer.querySelectorAll("a").length : -1,
      hasCopyright: /ECOWAVE|All Rights Reserved/.test(text),
      asideCount: document.querySelectorAll("aside").length,
      text: text.slice(0, 240),
    };
  });
  section("footerPreview", {
    previewPaneShown: footerPreview.asideCount >= 1,
    footerElement: footerPreview.found,
    sitemapLinks: footerPreview.linkCount >= 5,
    linkCount: footerPreview.linkCount,
    copyright: footerPreview.hasCopyright,
    text: footerPreview.text,
  });
  await shot(page, "footer");

  /* -------------------------------------------- F) public footer sanity */

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-footer]");
  const publicFooter = await page.evaluate(() => {
    const footer = document.querySelector("[data-footer]");
    const text = footer ? (footer.textContent || "").replace(/\s+/g, " ") : "";
    return {
      found: Boolean(footer),
      linkCount: footer ? footer.querySelectorAll("a").length : -1,
      hasCopyright: /ECOWAVE|All Rights Reserved/.test(text),
    };
  });
  section("publicFooter", {
    footerElement: publicFooter.found,
    sitemapLinks: publicFooter.linkCount >= 5,
    linkCount: publicFooter.linkCount,
    copyright: publicFooter.hasCopyright,
  });

  /* ------------------------------------------------ G) news round-trip */

  if (dbConfigured) {
    const original = await getBoardDetail();
    const origPosts = Array.isArray(original.body.posts) ? original.body.posts : [];
    const wasMaterialized = original.body.materialized === true;

    let writeOk = false;
    let markerRendered = false;
    let baselineValid = origPosts.length > 0;

    if (baselineValid) {
      const marker = { ...origPosts[0], idx: MARK_IDX, title: MARK_TITLE };
      const write = await putBoard({
        action: "replace",
        slug: "news",
        locale: "ko",
        posts: [marker, ...origPosts],
      });
      writeOk = write.ok;
      if (writeOk) boardDirty = true;
      if (writeOk) {
        const html = await fetchHtml(`/news?e2e=adminia-on-${STAMP}`);
        markerRendered = html.includes(MARK_TITLE);
      }

      restoreBoard = async () => {
        if (!boardDirty) return;
        const result = await putBoard({
          action: "replace",
          slug: "news",
          locale: "ko",
          posts: wasMaterialized ? origPosts : [],
        });
        if (result.ok) boardDirty = false;
      };
      await restoreBoard();

      const finalHtml = await fetchHtml(`/news?e2e=adminia-off-${STAMP}`);
      const residueGone = !finalHtml.includes(MARK_TITLE);
      const after = await getBoardDetail();
      const afterIdx = Array.isArray(after.body.posts)
        ? after.body.posts.map((p) => p.idx)
        : null;
      const effectiveRestored =
        afterIdx !== null &&
        JSON.stringify(afterIdx) === JSON.stringify(origPosts.map((p) => p.idx));

      section("newsBoardRoundTrip", {
        baselineValid,
        originalCount: origPosts.length,
        baseline: wasMaterialized ? "overrides" : "defaults",
        writeOk,
        markerRendered,
        residueGone,
        effectiveRestored,
        baselineStillAfter: after.body.materialized === (wasMaterialized ? true : false),
        passBothDirections: writeOk && markerRendered && residueGone && effectiveRestored,
      });
    } else {
      section("newsBoardRoundTrip", {
        baselineValid: false,
        originalCount: origPosts.length,
        note: "no resolved posts to clone; round-trip skipped",
      });
    }
  } else {
    report.newsBoardRoundTrip = { skipped: true, reason: "DATABASE_URL missing", pass: false };
  }
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 1200);
  pass = false;
} finally {
  try {
    if (boardDirty) await restoreBoard();
  } catch {}
  try {
    if (browser) await browser.close();
  } catch {}
  killDev();
  if (blockers.length > 0) {
    report.blockers = blockers;
    pass = false;
  }
  report.pass = pass;
  report.devLogTail = pass ? undefined : devLog.slice(-1200);
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  } catch (e) {
    report.reportWriteError = String(e).slice(0, 200);
  }
  const failures = Object.entries(report)
    .filter(([, v]) => v && typeof v === "object" && v.pass === false)
    .map(([k]) => k);
  const lines = [
    `${pass ? "PASS" : "FAIL"}  admin-ia  (${BASE})`,
    `sections: ${Object.keys(report).filter((k) => report[k]?.pass !== undefined).join(", ")}`,
    failures.length ? `failed: ${failures.join(", ")}` : "failed: none",
    blockers.length ? `blockers: ${blockers.join(" | ")}` : "blockers: none",
  ];
  console.log(lines.join("\n"));
  console.log(JSON.stringify({ pass, blockers, failures }, null, 1));
}
process.exit(pass ? 0 : 1);
