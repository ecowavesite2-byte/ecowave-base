import fs from "node:fs";

function walk(rows, out) {
  rows.forEach((r) => {
    if (r.kind === "widget") out.push(r);
    if (r.kind === "row") r.cols.forEach((c) => walk(c.children, out));
  });
}

function extract(loc) {
  const p = JSON.parse(fs.readFileSync(`content/${loc}/pages/rnd.facilities.json`, "utf8"));
  const sec = p.sections.find((s) => JSON.stringify(s.rows).includes("tab-menu"));
  const ws = [];
  walk(sec.rows, ws);
  const codes = ws.filter((x) => x.type === "code" && (x.html || "").length > 30);
  const menuHtml = codes.find((x) => /tab-menu/.test(x.html)).html;
  const bodyHtml = codes.find((x) => /tab-content/.test(x.html)).html;
  const names = [...menuHtml.matchAll(/openTab\('([^']+)'\)[^>]*>([^<]+)</g)].map((m) => ({ id: m[1], name: m[2].trim() }));
  const tabs = names.map((t) => {
    const pane = bodyHtml.split(`id="${t.id}"`)[1].split(/id="tab\d"/)[0];
    const imgs = [...pane.matchAll(/background-image:\s*url\(([^)]+)\)/g)].map((m) => m[1]);
    return { id: t.id, name: t.name, images: [...new Set(imgs)] };
  });
  fs.writeFileSync(`content/${loc}/facilities-tabs.json`, JSON.stringify(tabs, null, 2) + "\n");
  console.log(loc, tabs.map((t) => `${t.id}:${t.name}:${t.images.length}`).join(" | "));
}

extract("ko");
extract("en");
