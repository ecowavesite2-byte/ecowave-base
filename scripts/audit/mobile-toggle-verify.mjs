/**
 * RC1 static verification (no build): replay the new section-visibility rules
 * against each page's content JSON and compare the resulting mobile-visible
 * section id set with the measured original mobile DOM (orig-pre-m1.json).
 */
import fs from "node:fs";

const MOB = /(^|\s)mobile_section(\s|$)/;
const HIDE = /(^|\s)mobile_hide(\s|$)/;
const HERO = /(^|\s)(_section_first|mobile_section_first)(\s|$)/;
const FOOTER = "s20250811f489e3443bdbe";

const isMobile = (cls) => MOB.test(cls || "");
const hasMenu = (rows) => {
  let found = false;
  (function walk(ns) {
    for (const n of ns) {
      if (found) return;
      if (n.kind === "widget" && n.type === "menu_title") found = true;
      else if (n.kind === "row") n.cols.forEach((c) => walk(c.children));
      else if (n.kind === "col") walk(n.children);
    }
  })(rows);
  return found;
};
const isHero = (cls, rows) => HERO.test(cls || "") || (rows ? hasMenu(rows) : false);

const orig = JSON.parse(fs.readFileSync("design/audit/mobile-probe/orig-pre-m1.json", "utf8"));
const PAGES = {
  home: "content/ko/pages/home.json",
  news: "content/ko/pages/news.json",
  newsroom: "content/ko/pages/news.json", // /26 → /29 (newsroom.json removed by Lane B)
  "rnd.facilities": "content/ko/pages/rnd.facilities.json",
  "company.organization": "content/ko/pages/company.organization.json",
};

// per-page: which content sections does the local component render?
// ContentPage/BoardPageShell/home all keep pc+mobile minus footer, drop the
// first hero of each channel. `bespoke` = no SectionRenderer (products).
const MODE = {
  home: "home",
  news: "board",
  newsroom: "board",
  "rnd.facilities": "content",
  "company.organization": "content",
};

for (const [key, file] of Object.entries(PAGES)) {
  const page = JSON.parse(fs.readFileSync(file, "utf8"));
  const content = page.sections.filter((s) => s.id !== FOOTER);
  const firstPc = content.find((s) => !isMobile(s.cls));
  const firstMob = content.find((s) => isMobile(s.cls));
  const dropped = new Set();
  if (firstPc && isHero(firstPc.cls, firstPc.rows)) dropped.add(firstPc.id);
  if (firstMob && isHero(firstMob.cls, firstMob.rows)) dropped.add(firstMob.id);
  // home rebuilds the visual hero separately
  const localMobile = content.filter(
    (s) =>
      !dropped.has(s.id) &&
      !(MODE[key] === "home" && s.visual) &&
      (isMobile(s.cls) || !HIDE.test(s.cls || "")),
  );

  const o = orig[key]?.sections ?? [];
  // orig visible = !hidden, h>0, drop hero bands + footer
  const origVis = o.filter((s) => s.id && !s.hidden && s.h > 0 && s.id !== FOOTER && !HERO.test(s.cls));
  const localIds = localMobile.map((s) => s.id);
  const origIds = origVis.map((s) => s.id);
  const onlyLocal = localIds.filter((id) => !origIds.includes(id));
  const onlyOrig = origIds.filter((id) => !localIds.includes(id));
  console.log(`\n== ${key} ==  localMobile=${localIds.length} origMobile=${origIds.length}`);
  console.log(`  only-local: ${onlyLocal.join(", ") || "-"}`);
  console.log(`  only-orig : ${onlyOrig.join(", ") || "-"}`);
}
