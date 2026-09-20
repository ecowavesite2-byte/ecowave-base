#!/usr/bin/env node
/**
 * Plain-JS content validator (no TS imports, no build step).
 *
 * Walks content/ (skipping content/.history), parses every JSON file and
 * asserts the structural invariants the admin lane relies on:
 *   (a) pages/*.json    — key/sourceUrl/title/sections[], section id+rows[],
 *                         node kind in {row,col,widget}, row→cols[],
 *                         col→children[], widget→string type
 *   (b) boards/*.json   — name/count/listCls/posts[], post idx+title
 *   (c) site.json       — nav[] + logos[]
 *   (d) every /images/ string resolves to a real file under public/
 *   (e) page file keys are within the PAGE_KEYS allowlist
 *
 * Exit 1 with a readable per-file error list, or exit 0 printing
 * "validated N files".
 */
import fs from "node:fs";
import path from "node:path";

const CONTENT_ROOT =
  process.env.CONTENT_ROOT ?? path.join(process.cwd(), "content");
const PUBLIC_ROOT = path.join(process.cwd(), "public");

const PAGE_KEYS = [
  "home",
  "company",
  "company.ceo",
  "company.about",
  "company.philosophy",
  "company.history",
  "company.organization",
  "company.global",
  "rnd",
  "rnd.technology",
  "rnd.patents",
  "rnd.facilities",
  "news",
  "notices",
  "support",
];

/** @type {string[]} */
const errors = [];

function fail(file, message) {
  errors.push(`${file}: ${message}`);
}

function isObj(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* -------------------------------------------------------------------------- */
/* File discovery                                                              */
/* -------------------------------------------------------------------------- */

function walkJson(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".history") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJson(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(full);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Structural validators                                                       */
/* -------------------------------------------------------------------------- */

function validateNode(node, where, rel) {
  if (!isObj(node)) {
    fail(rel, `${where}: node must be an object`);
    return;
  }
  if (node.kind === "row") {
    if (!Array.isArray(node.cols)) {
      fail(rel, `${where}.cols must be an array`);
      return;
    }
    node.cols.forEach((col, i) => validateNode(col, `${where}.cols[${i}]`, rel));
  } else if (node.kind === "col") {
    if (!Array.isArray(node.children)) {
      fail(rel, `${where}.children must be an array`);
      return;
    }
    node.children.forEach((child, i) =>
      validateNode(child, `${where}.children[${i}]`, rel),
    );
  } else if (node.kind === "widget") {
    if (typeof node.type !== "string") {
      fail(rel, `${where}.type must be a string`);
    }
  } else {
    fail(rel, `${where}.kind must be one of row|col|widget (got ${JSON.stringify(node.kind)})`);
  }
}

function validatePage(data, rel) {
  if (!isObj(data)) {
    fail(rel, "page root must be an object");
    return;
  }
  for (const field of ["key", "sourceUrl", "title"]) {
    if (typeof data[field] !== "string") {
      fail(rel, `${field} must be a string`);
    }
  }
  if (!Array.isArray(data.sections)) {
    fail(rel, "sections must be an array");
    return;
  }
  data.sections.forEach((section, si) => {
    const where = `sections[${si}]`;
    if (!isObj(section)) {
      fail(rel, `${where} must be an object`);
      return;
    }
    if (typeof section.id !== "string") {
      fail(rel, `${where}.id must be a string`);
    }
    if (!Array.isArray(section.rows)) {
      fail(rel, `${where}.rows must be an array`);
      return;
    }
    section.rows.forEach((node, ni) => validateNode(node, `${where}.rows[${ni}]`, rel));
  });
}

function validateBoard(data, rel) {
  if (!isObj(data)) {
    fail(rel, "board root must be an object");
    return;
  }
  for (const field of ["name", "listCls"]) {
    if (typeof data[field] !== "string") {
      fail(rel, `${field} must be a string`);
    }
  }
  if (typeof data.count !== "number") {
    fail(rel, "count must be a number");
  }
  if (!Array.isArray(data.posts)) {
    fail(rel, "posts must be an array");
    return;
  }
  data.posts.forEach((post, pi) => {
    const where = `posts[${pi}]`;
    if (!isObj(post)) {
      fail(rel, `${where} must be an object`);
      return;
    }
    if (typeof post.idx !== "string") {
      fail(rel, `${where}.idx must be a string`);
    }
    if (typeof post.title !== "string") {
      fail(rel, `${where}.title must be a string`);
    }
  });
}

function validateSite(data, rel) {
  if (!isObj(data)) {
    fail(rel, "site root must be an object");
    return;
  }
  if (!Array.isArray(data.nav)) {
    fail(rel, "nav must be an array");
  }
  if (!Array.isArray(data.logos)) {
    fail(rel, "logos must be an array");
  }
}

/* -------------------------------------------------------------------------- */
/* Image reference check                                                       */
/* -------------------------------------------------------------------------- */

const IMAGE_RE = /\/images\/[^\s"'<>()\\]*/g;

function collectImageRefs(value, rel, out) {
  if (typeof value === "string") {
    // decode HTML entities so &quot;/images/...&quot; is discoverable
    const decoded = value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
    const matches = decoded.match(IMAGE_RE);
    if (matches) {
      for (const ref of matches) out.push({ ref, rel });
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectImageRefs(entry, rel, out));
  } else if (isObj(value)) {
    Object.values(value).forEach((entry) => collectImageRefs(entry, rel, out));
  }
}

function validateImageRefs(refs) {
  const publicResolved = path.resolve(PUBLIC_ROOT);
  for (const { ref, rel } of refs) {
    const clean = ref.split(/[?#]/)[0];
    const target = path.resolve(publicResolved, "." + clean);
    if (!(target === publicResolved || target.startsWith(publicResolved + path.sep))) {
      fail(rel, `image reference escapes public/: ${ref}`);
      continue;
    }
    if (!fs.existsSync(target)) {
      fail(rel, `missing image: ${ref}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

function main() {
  const files = [];
  walkJson(CONTENT_ROOT, files);

  for (const file of files) {
    const rel = path.relative(CONTENT_ROOT, file).split(path.sep).join("/");
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      fail(rel, `invalid JSON: ${error instanceof Error ? error.message : error}`);
      continue;
    }

    const parts = rel.split("/");
    if (parts.length === 2 && (parts[0] === "ko" || parts[0] === "en")) {
      if (parts[1] === "site.json") {
        validateSite(data, rel);
      } else if (parts[1] === "facilities-tabs.json") {
        if (!Array.isArray(data)) fail(rel, "facilities-tabs root must be an array");
      }
    } else if (
      parts.length === 3 &&
      (parts[0] === "ko" || parts[0] === "en")
    ) {
      if (parts[1] === "pages") {
        const key = parts[2].replace(/\.json$/, "");
        if (!PAGE_KEYS.includes(key)) {
          fail(rel, `page key "${key}" is not in the PAGE_KEYS allowlist`);
        }
        validatePage(data, rel);
      } else if (parts[1] === "boards") {
        validateBoard(data, rel);
      }
    }

    const refs = [];
    collectImageRefs(data, rel, refs);
    validateImageRefs(refs);
  }

  if (errors.length > 0) {
    console.error(`content validation failed with ${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log(`validated ${files.length} files`);
}

main();
