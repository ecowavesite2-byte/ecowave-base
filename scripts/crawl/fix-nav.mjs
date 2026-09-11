/**
 * Patches content/{ko,en}/site.json nav with the verified menu structure
 * (captured from the settled header DOM of both source sites — the headless
 * crawl occasionally captures the header mid-initialization).
 * Source URLs are stored as the imweb numeric ids (url field).
 */
import fs from "node:fs/promises";

const NAV = {
  ko: [
    {
      name: "에코웨이브",
      url: "15",
      children: [
        { name: "ceo인사말", url: "16" },
        { name: "회사소개", url: "17" },
        { name: "경영철학", url: "18" },
        { name: "회사연혁", url: "19" },
        { name: "조직도", url: "31" },
        { name: "글로벌지사", url: "20" },
      ],
    },
    {
      name: "연구개발",
      url: "21",
      children: [
        { name: "보유기술", url: "22" },
        { name: "국내외 특허", url: "23" },
        { name: "생산설비", url: "24" },
      ],
    },
    {
      name: "제품소개",
      url: "32",
      children: [
        { name: "에코웨이브(Eco wave)", url: "37" },
        { name: "크린비(clean B)", url: "38" },
        { name: "플로웰(Flowell)", url: "36" },
      ],
    },
    { name: "뉴스룸", url: "26", children: [{ name: "뉴스", url: "29" }] },
    { name: "고객지원", url: "28", children: [{ name: "공지사항", url: "27" }] },
  ],
  en: [
    {
      name: "Ecowave",
      url: "15",
      children: [
        { name: "Ceo greeting", url: "16" },
        { name: "Company introduction", url: "17" },
        { name: "Management philosophy", url: "18" },
        { name: "History", url: "19" },
        { name: "Organization chart", url: "31" },
        { name: "Global branch office", url: "20" },
      ],
    },
    {
      name: "R&D",
      url: "21",
      children: [
        { name: "Retained technology", url: "22" },
        { name: "Patents home & abroad", url: "23" },
        { name: "Production facilities", url: "24" },
      ],
    },
    {
      name: "Product descriptions",
      url: "32",
      children: [
        { name: "Eco wave", url: "36" },
        { name: "clean B", url: "37" },
        { name: "Flowell", url: "38" },
      ],
    },
    { name: "Newsroom", url: "26", children: [{ name: "News", url: "29" }] },
    { name: "Customer Support", url: "28", children: [{ name: "Notic", url: "27" }] },
  ],
};

for (const [locale, nav] of Object.entries(NAV)) {
  const p = `content/${locale}/site.json`;
  const site = JSON.parse(await fs.readFile(p, "utf8"));
  site.nav = nav;
  await fs.writeFile(p, JSON.stringify(site, null, 2));
  console.log(`${locale}: nav fixed (${nav.length} items)`);
}
