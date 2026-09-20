import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// promoteDraft() calls revalidateFor(), which lazily imports next/cache; stub it
// so the suite runs in a plain Node environment.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const REPO = process.cwd();

let root: string;
let originalRoot: string | undefined;

/** Reload `drafts.ts` (and its module graph) against a fresh temp CONTENT_ROOT. */
async function loadDrafts() {
  vi.resetModules();
  process.env.CONTENT_ROOT = root;
  return import("../drafts");
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const publishedPage = {
  key: "home",
  sourceUrl: "/",
  title: "Home",
  sections: [],
};

beforeEach(() => {
  originalRoot = process.env.CONTENT_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ecowave-drafts-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (originalRoot === undefined) delete process.env.CONTENT_ROOT;
  else process.env.CONTENT_ROOT = originalRoot;
});

describe("draftPath", () => {
  it("maps drafts to .draft.json siblings for pages, boards and site", async () => {
    const { draftPath } = await loadDrafts();
    const posix = (value: string) => value.split(path.sep).join("/");

    expect(posix(draftPath("ko", "page", "company.ceo"))).toMatch(
      /\/ko\/pages\/company\.ceo\.draft\.json$/,
    );
    expect(posix(draftPath("en", "board", "news"))).toMatch(/\/en\/boards\/news\.draft\.json$/);
    expect(posix(draftPath("ko", "site", ""))).toMatch(/\/ko\/site\.draft\.json$/);
  });
});

describe("writeDraft / promoteDraft / discardDraft", () => {
  it("writes, promotes and discards a page draft without touching the published file", async () => {
    const drafts = await loadDrafts();
    const write = await import("../write");

    const publishedFile = path.join(root, "ko", "pages", "home.json");
    writeJson(publishedFile, publishedPage);

    const draftContent = { ...publishedPage, title: "Draft home" };
    const draftHash = await drafts.writeDraft(
      "ko",
      "page",
      "home",
      draftContent,
      write.hashOfFile(publishedFile),
    );
    expect(draftHash).toMatch(/^[0-9a-f]{64}$/);

    const draftFile = drafts.draftPath("ko", "page", "home");
    expect(fs.existsSync(draftFile)).toBe(true);

    const read = drafts.readDraft("ko", "page", "home");
    expect(read?.content).toMatchObject({ title: "Draft home" });
    expect(read?.hash).toBe(draftHash);

    // public read path is untouched while the draft exists
    expect((JSON.parse(fs.readFileSync(publishedFile, "utf8")) as { title: string }).title).toBe(
      "Home",
    );

    const promoted = await drafts.promoteDraft("ko", "page", "home");
    expect(promoted?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((JSON.parse(fs.readFileSync(publishedFile, "utf8")) as { title: string }).title).toBe(
      "Draft home",
    );
    expect(fs.existsSync(draftFile)).toBe(false);

    writeJson(draftFile, { ...publishedPage, title: "Second draft" });
    expect(await drafts.discardDraft("ko", "page", "home")).toBe(true);
    expect(fs.existsSync(draftFile)).toBe(false);
    expect(await drafts.discardDraft("ko", "page", "home")).toBe(false);
  });

  it("rejects a stale draft save (hash mismatch)", async () => {
    const drafts = await loadDrafts();
    const write = await import("../write");

    const publishedFile = path.join(root, "ko", "pages", "home.json");
    writeJson(publishedFile, publishedPage);
    const publishedHash = write.hashOfFile(publishedFile);

    // first draft differs from the published bytes, so the published hash is stale
    await drafts.writeDraft(
      "ko",
      "page",
      "home",
      { ...publishedPage, title: "Draft home" },
      publishedHash,
    );
    await expect(
      drafts.writeDraft("ko", "page", "home", publishedPage, publishedHash),
    ).rejects.toMatchObject({ name: "HashMismatchError" });
  });

  it("supports board drafts and rejects invalid draft content", async () => {
    const drafts = await loadDrafts();
    const write = await import("../write");

    const publishedFile = path.join(root, "ko", "boards", "news.json");
    const board = { name: "뉴스", count: 0, listCls: "", posts: [] };
    writeJson(publishedFile, board);

    await expect(
      drafts.writeDraft("ko", "board", "news", { name: "x" }, write.hashOfFile(publishedFile)),
    ).rejects.toMatchObject({ name: "DraftValidationError" });

    const hash = await drafts.writeDraft("ko", "board", "news", board, write.hashOfFile(publishedFile));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(root, "ko", "boards", "news.draft.json"))).toBe(true);
  });
});

describe("gitignore", () => {
  it("ignores draft files", () => {
    const gitignore = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");
    expect(gitignore).toContain("content/**/*.draft.json");
  });
});
