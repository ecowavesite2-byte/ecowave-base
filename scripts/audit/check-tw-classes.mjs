/**
 * Lane D: verify Tailwind class generation without a Next build.
 * Compiles app/globals.css through @tailwindcss/postcss and asserts every
 * arbitrary utility used by the products board/components is emitted.
 */
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import fs from "node:fs";
import path from "node:path";

const cssPath = path.resolve("app/globals.css");
const css = fs.readFileSync(cssPath, "utf8");
const result = await postcss([tailwind()]).process(css, { from: cssPath });
const out = result.css;

/** [escaped CSS selector, expected emitted declaration value] */
const checks = [
  [".h-\\[37px\\]", "height: 37px"],
  [".h-\\[361px\\]", "height: 361px"],
  [".h-\\[294px\\]", "height: 294px"],
  [".h-\\[65px\\]", "height: 65px"],
  [".h-\\[31px\\]", "height: 31px"],
  [".lg\\:-mt-\\[5px\\]", "margin-top: calc(5px * -1)"],
  [".lg\\:h-\\[181px\\]", "height: 181px"],
  [".lg\\:h-\\[200px\\]", "height: 200px"],
  [".lg\\:mt-\\[58px\\]", "margin-top: 58px"],
  [".lg\\:-mx-5", "margin-inline: calc(var(--spacing) * -5)"],
  [".lg\\:w-1\\/3", "width: calc(1 / 3 * 100%)"],
  [".lg\\:p-5", "padding: calc(var(--spacing) * 5)"],
  [".lg\\:pb-\\[88px\\]", "padding-bottom: 88px"],
  [".lg\\:mb-\\[9px\\]", "margin-bottom: 9px"],
  [".lg\\:pb-\\[117px\\]", "padding-bottom: 117px"],
  [".lg\\:pb-\\[73px\\]", "padding-bottom: 73px"],
  [".min-w-6", "min-width: calc(var(--spacing) * 6)"],
  [".h-6", "height: calc(var(--spacing) * 6)"],
  [".gap-\\[3px\\]", "gap: 3px"],
  [".mr-\\[5px\\]", "margin-right: 5px"],
  [".text-\\[17px\\]", "font-size: 17px"],
  [".text-\\[15px\\]", "font-size: 15px"],
  [".text-\\[22px\\]", "font-size: 22px"],
  [".leading-\\[20px\\]", "line-height: 20px"],
  [".leading-\\[26px\\]", "line-height: 26px"],
  [".mt-\\[3px\\]", "margin-top: 3px"],
  [".bg-accent", "background-color: var(--color-accent)"],
  [".text-\\[\\#090909\\]", "color: #090909"],
  [".border-\\[\\#eee\\]", "border-color: #eee"],
  [".bg-\\[\\#f7f7f7\\]", "background-color: #f7f7f7"],
];

let bad = 0;
for (const [selector, decl] of checks) {
  if (!out.includes(selector) || !out.includes(decl)) {
    console.log(`MISSING ${selector} / ${decl} (sel:${out.includes(selector)} decl:${out.includes(decl)})`);
    bad++;
  }
}

// rgba captions used by the tabs + pagination
for (const v of ["rgba(54,54,54,0.7)", "rgba(54,54,54,0.4)"]) {
  if (!out.includes(v)) {
    console.log("MISSING color", v);
    bad++;
  }
}

// lg: rules must sit inside a min-width media query
const i = out.indexOf(".lg\\:h-\\[181px\\]");
const media = out.slice(0, i).lastIndexOf("@media");
console.log("lg media context:", out.slice(media, media + 42).replace(/\n/g, " "));
console.log(bad === 0 ? "ALL PRODUCTS CLASSES GENERATED" : `classes not generated: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
