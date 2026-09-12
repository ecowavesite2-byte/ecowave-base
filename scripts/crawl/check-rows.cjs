const p = require("../../content/ko/pages/company.about.json");
p.sections.forEach((s) => {
  const rows = [];
  (function ws(list) {
    if (!Array.isArray(list)) return;
    list.forEach((r) => {
      if (r.kind === "row") rows.push({ h: r.h, g: r.grid, hasGallery: /gallery2/.test(JSON.stringify(r)) });
    });
  })(s.rows);
  console.log(s.id.slice(0, 16), JSON.stringify(rows).slice(0, 240));
});
