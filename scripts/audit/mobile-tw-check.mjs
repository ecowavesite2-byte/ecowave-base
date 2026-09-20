/** verify Tailwind emits the RC1/RC5 arbitrary-variant classes actually used */
import fs from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const cssPath = "design/audit/mobile-probe/tw-check.css";
const css = `@import "tailwindcss" source(none);
@source "../../../components";
@source "../../../app";
`;
fs.writeFileSync(cssPath, css);

const need = [
  ".min-\\[992px\\]\\:hidden",
  ".min-\\[992px\\]\\:block",
  ".min-\\[992px\\]\\:max-w-none",
  ".min-\\[992px\\]\\:h-\\[var\\(--img-h\\)\\]",
];

const result = await postcss([tailwind({ base: process.cwd(), optimize: false })]).process(css, { from: cssPath });
const out = result.css;
for (const n of need) {
  const ok = out.includes(n);
  console.log(`${ok ? "OK " : "MISSING"} ${n}`);
}
// show the emitted max-width/height declarations for the clamp classes
for (const key of ["max-w-none", "h-\\[var\\(--img-h\\)\\]"]) {
  const i = out.indexOf(key);
  if (i >= 0) console.log(`  ...${out.slice(i - 30, i + 90).replace(/\n/g, " ")}`);
}
console.log("css bytes:", out.length);
