/**
 * Builds site.footer = { logo, lines, copyright } from the footer section
 * captured in content/{locale}/pages/home.json (footer section id is stable).
 */
import fs from "node:fs/promises";

const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";

function collectWidgets(rows, out = []) {
  for (const r of rows) {
    if (r.kind === "widget") out.push(r);
    if (r.cols) for (const c of r.cols) collectWidgets(c.children, out);
  }
  return out;
}

for (const locale of ["ko", "en"]) {
  const p = `content/${locale}/site.json`;
  const site = JSON.parse(await fs.readFile(p, "utf8"));
  const page = JSON.parse(
    await fs.readFile(`content/${locale}/pages/home.json`, "utf8"),
  );
  const sec = page.sections[page.sections.length - 1]; // footer is the last section on every page
  if (!sec) throw new Error("no sections in home.json");
  const widgets = collectWidgets(sec.rows);
  const logoWidget = widgets.find(
    (w) =>
      w.type === "image" || (w.type === "text" && /<img/.test(w.html || "")),
  );
  const logoMatch = (logoWidget?.html || "").match(/src="([^"]+)"/);
  const infoWidget = widgets.find(
    (w) => w.type === "text" && /Copyright/.test(w.html || ""),
  );
  const texts = (infoWidget?.html || "")
    .split(/<\/p>/)
    .map((t) =>
      t
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const copyright = texts.find((t) => /Copyright/i.test(t)) || "";
  const lines = texts.filter((t) => !/Copyright/i.test(t));
  site.footer = {
    logo: logoMatch ? logoMatch[1] : null,
    lines,
    copyright,
  };
  await fs.writeFile(p, JSON.stringify(site, null, 2));
  console.log(locale, JSON.stringify(site.footer, null, 1));
}
