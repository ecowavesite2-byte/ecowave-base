const p = require("E:/Projects/ecowave/content/ko/pages/company.about.json");
const out = [];
p.sections.forEach((s) => {
  let g = null;
  (function ws(list) {
    if (!Array.isArray(list)) return;
    list.forEach((r) => {
      if (r.kind === "widget" && r.type === "gallery2")
        g = { layout: r.layout, listCls: (r.listCls || "").slice(0, 70), n: (r.items || []).length };
      if (r.kind === "row") ws(r.cols.map((c) => ({ kind: "col", ...c })));
      if (r.kind === "col") ws(r.children);
    });
  })(s.rows);
  if (g) out.push(s.id.slice(0, 16) + " " + JSON.stringify(g));
});
require("fs").writeFileSync("E:/Projects/ecowave/scripts/crawl/gallery-report.txt", out.join("\n") || "NONE");
