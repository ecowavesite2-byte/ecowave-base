import fs from "node:fs";
import path from "node:path";
import PageHero from "@/components/ui/PageHero";
import SectionRenderer, { Rows, isPageHeroSection, MOBILE_SECTION } from "@/components/content/SectionRenderer";
import FacilitiesTabs, { type FacilitiesTab } from "@/components/content/FacilitiesTabs";
import { getPageForRender } from "@/lib/content/drafts";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { heroFor, isFooterSection, FOOTER_SECTION_ID } from "@/lib/page-hero";
import type { Node, Section, WidgetNode } from "@/lib/types";

function widgetsInRows(rows: Node[]): WidgetNode[] {
  const out: WidgetNode[] = [];
  const walk = (n: Node) => {
    if (n.kind === "widget") out.push(n);
    else if (n.kind === "row") n.cols.forEach((c) => c.children.forEach(walk));
    else if (n.kind === "col") n.children.forEach(walk);
  };
  rows.forEach(walk);
  return out;
}

function hasCodeMarkup(node: Node, marker: string): boolean {
  return widgetsInRows([node]).some(
    (w) => w.type === "code" && (w.html || "").includes(marker),
  );
}

function isTabSection(section: Section): boolean {
  return widgetsInRows(section.rows).some(
    (w) => w.type === "code" && (w.html || "").includes("tab-menu"),
  );
}

/**
 * The imweb heading text widget is `visibility:hidden` on the live original but
 * still occupies its 88px band. Keep the space, hide the glyphs.
 */
function hideFirstText(rows: Node[]): Node[] {
  let done = false;
  const walk = (nodes: Node[]): Node[] =>
    nodes.map((n) => {
      if (done) return n;
      if (n.kind === "widget") {
        if (n.type !== "text") return n;
        done = true;
        return { ...n, html: `<div style="visibility:hidden">${n.html || ""}</div>` };
      }
      if (n.kind === "row")
        return { ...n, cols: n.cols.map((c) => ({ ...c, children: walk(c.children) })) };
      if (n.kind === "col") return { ...n, children: walk(n.children) };
      return n;
    });
  return walk(rows);
}

function getTabs(locale: Locale): FacilitiesTab[] {
  const enFile = path.join(process.cwd(), "content", "en", "facilities-tabs.json");
  const file =
    locale === "en" && fs.existsSync(enFile)
      ? enFile
      : path.join(process.cwd(), "content", "ko", "facilities-tabs.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as FacilitiesTab[];
  // the extractor captured the CSS url() including its &quot; delimiters
  return raw.map((t) => ({
    ...t,
    images: t.images.map((s) => s.replace(/&quot;/g, "").trim()),
  }));
}

/** tab band: normal rows up to the tab menu, the interactive gallery, then the trailing rows */
function TabSection({
  section,
  tabs,
  locale,
}: {
  section: Section;
  tabs: FacilitiesTab[];
  locale: Locale;
}) {
  const rows = section.rows;
  const menuIdx = rows.findIndex((r) => hasCodeMarkup(r, "tab-menu"));
  const bodyIdx = rows.findIndex((r) => hasCodeMarkup(r, "tab-content"));
  const head = hideFirstText(menuIdx === -1 ? rows : rows.slice(0, menuIdx));
  const tail = bodyIdx === -1 ? [] : rows.slice(bodyIdx + 1);
  return (
    <section className="relative" style={{ backgroundColor: section.bgColor || "#F9F9F9" }}>
      <div className="relative">
        <Rows rows={head} locale={locale} />
        <FacilitiesTabs tabs={tabs} />
        <Rows rows={tail} locale={locale} />
      </div>
    </section>
  );
}

export function generateStaticParams() {
  return [{ locale: "ko" }, { locale: "en" }];
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l: Locale = isLocale(locale) ? locale : defaultLocale;
  const page = await getPageForRender(l, "rnd/facilities");
  const hero = heroFor("/rnd/facilities", l);
  const tabs = getTabs(l);

  // keep both pc and mobile section sets; SectionRenderer resolves visibility per breakpoint.
  // drop only the leading page-title hero band of each channel (rebuilt as <PageHero>)
  const all = page.sections.filter((s) => !isFooterSection(s) && s.id !== FOOTER_SECTION_ID);
  const dropped = new Set<string>();
  const firstPc = all.find((s) => !MOBILE_SECTION.test(s.cls || ""));
  const firstMobile = all.find((s) => MOBILE_SECTION.test(s.cls || ""));
  if (firstPc && isPageHeroSection(firstPc)) dropped.add(firstPc.id);
  if (firstMobile && isPageHeroSection(firstMobile)) dropped.add(firstMobile.id);
  const sections = all.filter((s) => !dropped.has(s.id));
  const tabIdx = sections.findIndex(isTabSection);
  const tabSection = tabIdx === -1 ? null : sections[tabIdx];
  const before = tabIdx === -1 ? sections : sections.slice(0, tabIdx);
  const after = tabIdx === -1 ? [] : sections.slice(tabIdx + 1);

  return (
    <main>
      <PageHero title={hero.title} tabs={hero.tabs} />
      {tabSection ? (
        <>
          <SectionRenderer sections={before} />
          <TabSection section={tabSection} tabs={tabs} locale={l} />
          <SectionRenderer sections={after} />
        </>
      ) : (
        <SectionRenderer sections={sections} />
      )}
    </main>
  );
}
