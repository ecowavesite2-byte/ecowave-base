import { describe, expect, it } from "vitest";
import {
  buildUploadName,
  extensionOf,
  MAX_UPLOAD_BYTES,
  slugifyBasename,
  validateUploadName,
} from "../upload-name";

const HASH = "a1b2c3d4";

function file(name: string, type: string, size = 1024) {
  return { name, type, size };
}

describe("extensionOf", () => {
  it("returns the lowercased final extension", () => {
    expect(extensionOf("Photo.PNG")).toBe("png");
    expect(extensionOf("a.b.jpeg")).toBe("jpeg");
    expect(extensionOf("sub/dir/pic.WEBP")).toBe("webp");
  });

  it("returns empty for missing or degenerate extensions", () => {
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
    expect(extensionOf(".hidden")).toBe("");
  });
});

describe("slugifyBasename", () => {
  it("lowercases and collapses unsafe characters", () => {
    expect(slugifyBasename("My Photo (1).PNG")).toBe("my-photo-1");
    expect(slugifyBasename("한국어 이미지.png")).toBe("image");
    expect(slugifyBasename("a___b...c.jpg")).toBe("a-b-c");
  });

  it("strips path prefixes and never returns an empty stem", () => {
    expect(slugifyBasename("sub/dir/Name.png")).toBe("name");
    expect(slugifyBasename("a.___.png")).toBe("a");
    expect(slugifyBasename("---.png")).toBe("image");
  });
});

describe("buildUploadName", () => {
  it("is deterministic for identical inputs", () => {
    expect(buildUploadName("Photo.PNG", HASH)).toBe("photo-a1b2c3d4.png");
    expect(buildUploadName("Photo.PNG", HASH)).toBe(buildUploadName("Photo.PNG", HASH));
  });

  it("sanitizes the hash (no path/url characters survive)", () => {
    expect(buildUploadName("x.png", "../../ETC")).toBe("x-etc.png");
    expect(buildUploadName("x.png", "")).toBe("x-0.png");
  });

  it("changes when the content hash changes", () => {
    expect(buildUploadName("x.png", "aaaa")).not.toBe(buildUploadName("x.png", "bbbb"));
  });
});

describe("validateUploadName", () => {
  it("accepts every allowed MIME/extension pairing", () => {
    const cases: [string, string, string][] = [
      ["a.jpg", "image/jpeg", "jpg"],
      ["a.JPEG", "image/jpeg", "jpeg"],
      ["a.png", "image/png", "png"],
      ["a.webp", "image/webp", "webp"],
      ["a.gif", "image/gif", "gif"],
      ["a.svg", "image/svg+xml", "svg"],
      ["a.pdf", "application/pdf", "pdf"],
    ];
    for (const [name, type, ext] of cases) {
      const result = validateUploadName(file(name, type), HASH);
      expect(result.ok, `${name} ${type}`).toBe(true);
      if (result.ok) {
        expect(result.ext).toBe(ext);
        expect(result.name).toBe(`a-${HASH}.${ext}`);
      }
    }
  });

  it("accepts a PDF attachment", () => {
    const result = validateUploadName(file("report.pdf", "application/pdf"), HASH);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe(`report-${HASH}.pdf`);
  });

  it("rejects path traversal filenames", () => {
    for (const name of ["../evil.png", "a/../b.png", "..\\evil.png", "x..png"]) {
      const result = validateUploadName(file(name, "image/png"), HASH);
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.status).toBe(400);
    }
  });

  it("rejects unsupported and mismatched content types", () => {
    const rejected = [
      file("a.avif", "image/avif"),
      file("a.txt", "text/plain"),
      file("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      file("a.png", "image/jpeg"), // extension/MIME mismatch
      file("a.pdf", "image/png"), // extension/MIME mismatch
      file("a", "image/png"), // no extension
      file("a.png", ""), // missing MIME
    ];
    for (const meta of rejected) {
      const result = validateUploadName(meta, HASH);
      expect(result.ok, meta.name || meta.type).toBe(false);
      if (!result.ok) expect(result.status).toBe(415);
    }
  });

  it("enforces the size cap", () => {
    expect(validateUploadName(file("a.png", "image/png", MAX_UPLOAD_BYTES), HASH).ok).toBe(true);

    const tooBig = validateUploadName(file("a.png", "image/png", MAX_UPLOAD_BYTES + 1), HASH);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) {
      expect(tooBig.status).toBe(413);
      expect(tooBig.message).toContain("8 MB");
    }
  });

  it("rejects empty files", () => {
    const result = validateUploadName(file("a.png", "image/png", 0), HASH);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
