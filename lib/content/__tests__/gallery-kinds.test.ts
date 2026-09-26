import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPrismaMock } = vi.hoisted(() => ({ getPrismaMock: vi.fn() }));

vi.mock("../db", () => ({
  getPrisma: getPrismaMock,
  isDbConfigured: vi.fn(() => false),
  loadOverrides: vi.fn(async () => ({})),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import type { PageContent, WidgetNode } from "../../types";
import { CONTENT_DEFS, DEFAULT_VALUES } from "../registry";
import { applyPageOverrides } from "../merge";
import { sectionWidgets } from "../pair";
import { getPage } from "../read";
import { saveContent } from "../save";
import { parseAboutCard, parseGalleryWidget } from "../../../scripts/gen-content-registry.mjs";

/**
 * WS-B — structured `gallery` + `aboutCards` core (company.about).
 *
 * Generator parse/emit, merge appliers (replace/add/reorder/max + byte-parity),
 * and the save validators.
 */

const ABOUT_PAGE = "company.about";
const BLOCK5 = "s20250918c5a18b62c8acd";
const actor = "admin@example.com";

const aboutPage = (): PageContent => getPage("ko", ABOUT_PAGE);

function sectionOf(page: PageContent, sectionId: string) {
  return page.sections.find((section) => section.id === sectionId)!;
}

function galleryDefFor(sectionId: string) {
  return CONTENT_DEFS.find(
    (def) => def.pageKey === ABOUT_PAGE && def.sectionId === sectionId && def.kind === "gallery",
  )!;
}

function galleryWidgetOf(page: PageContent, sectionId: string): WidgetNode {
  return sectionWidgets(sectionOf(page, sectionId)).find((w) => w.type === "gallery2")!;
}

function cardWidgetsOf(page: PageContent): WidgetNode[] {
  const texts = sectionWidgets(sectionOf(page, BLOCK5)).filter(
    (w) => w.type === "text" && typeof w.html === "string" && w.html.trim().length > 0,
  );
  return texts.slice(1);
}

/** `{ id, type, layout, orgs }` for every gallery2 widget on the page. */
function gallerySignature(page: PageContent) {
  const out: Array<{ id: string; type: string; layout?: string; orgs: Array<string | null> }> = [];
  for (const section of page.sections) {
    for (const widget of sectionWidgets(section)) {
      if (widget.type !== "gallery2") continue;
      out.push({
        id: widget.id,
        type: widget.type,
        layout: widget.layout,
        orgs: (widget.items ?? []).map((item) => item.org),
      });
    }
  }
  return out;
}

const GALLERY_SECTIONS = [
  "s202508119a2e8fe21b47a",
  "s20250918c54b2950e2f1a",
  "s20250918ab81858502f9e",
  "s20250918ffd77075d76ea",
];

beforeEach(() => {
  vi.clearAllMocks();
  getPrismaMock.mockReturnValue(null);
});

describe("generator parsing (real KO company.about)", () => {
  it("parses the 4 configured galleries with the expected item counts", () => {
    const page = aboutPage();
    const expected = [7, 5, 21, 6];
    GALLERY_SECTIONS.forEach((sectionId, index) => {
      const def = galleryDefFor(sectionId);
      const widget = galleryWidgetOf(page, sectionId);
      const items = parseGalleryWidget(widget, def.gallery!);
      expect(items, sectionId).toHaveLength(expected[index]);
      expect(items.every((item) => item.image.length > 0)).toBe(true);
      // Fields not in the config are normalized to "".
      if (!def.gallery!.fields.includes("title")) {
        expect(items.every((item) => item.title === "")).toBe(true);
      }
      if (!def.gallery!.fields.includes("desc")) {
        expect(items.every((item) => item.desc === "")).toBe(true);
      }
    });
  });

  it("parses block 5 into 6 cards (title + desc + embedded image)", () => {
    const page = aboutPage();
    const cards = cardWidgetsOf(page).map((widget) => parseAboutCard(widget.html));
    expect(cards).toHaveLength(6);
    expect(cards.every((card) => card.image.length > 0)).toBe(true);
    expect(cards.every((card) => card.title.length > 0)).toBe(true);
    expect(cards[0].title).toBe("정수기");

    const def = CONTENT_DEFS.find((candidate) => candidate.kind === "aboutCards")!;
    const baseline = JSON.parse(DEFAULT_VALUES[def.key].ko!) as unknown[];
    expect(baseline).toHaveLength(6);
  });
});

describe("gallery merge applier", () => {
  it("re-applying the default payload is a no-op (gallery signature unchanged)", () => {
    const page = aboutPage();
    for (const sectionId of GALLERY_SECTIONS) {
      const def = galleryDefFor(sectionId);
      const out = applyPageOverrides(
        page,
        { [def.key]: DEFAULT_VALUES[def.key].ko! },
        "ko",
        { galleryConfigs: { [def.key]: def.gallery! } },
      );
      expect(gallerySignature(out)).toEqual(gallerySignature(page));
    }
  });

  it("adds an item (marker in the image) beyond the authored list", () => {
    const marker = "__GAL_ADD__";
    const page = aboutPage();
    const sectionId = "s202508119a2e8fe21b47a"; // no max
    const def = galleryDefFor(sectionId);
    const items = JSON.parse(DEFAULT_VALUES[def.key].ko!) as Array<{
      image: string;
      title: string;
      desc: string;
    }>;
    const payload = JSON.stringify([
      ...items,
      { image: `/${marker}.png`, title: marker, desc: "" },
    ]);

    const out = applyPageOverrides(page, { [def.key]: payload }, "ko", {
      galleryConfigs: { [def.key]: def.gallery! },
    });
    const widget = galleryWidgetOf(out, sectionId);
    expect(widget.items).toHaveLength(items.length + 1);
    expect(widget.items![items.length].org).toContain(marker);
    expect(widget.items![items.length].thumb).toContain(marker);
  });

  it("reorders items", () => {
    const page = aboutPage();
    const sectionId = "s20250918ab81858502f9e"; // 21 image-only items
    const def = galleryDefFor(sectionId);
    const items = JSON.parse(DEFAULT_VALUES[def.key].ko!) as Array<{ image: string }>;
    const reversed = [...items].reverse();
    const out = applyPageOverrides(
      page,
      { [def.key]: JSON.stringify(reversed) },
      "ko",
      { galleryConfigs: { [def.key]: def.gallery! } },
    );
    expect(galleryWidgetOf(out, sectionId).items!.map((item) => item.org)).toEqual(
      reversed.map((item) => item.image),
    );
  });

  it("truncates to maxItems at merge time (direct-DB bypass defense)", () => {
    const page = aboutPage();
    const sectionId = "s20250918c54b2950e2f1a"; // maxItems 5
    const def = galleryDefFor(sectionId);
    const base = JSON.parse(DEFAULT_VALUES[def.key].ko!) as Array<{ image: string }>;
    const six = [...base, { image: "/x.png", title: "", desc: "" }];
    const out = applyPageOverrides(
      page,
      { [def.key]: JSON.stringify(six) },
      "ko",
      { galleryConfigs: { [def.key]: def.gallery! } },
    );
    expect(galleryWidgetOf(out, sectionId).items).toHaveLength(5);
  });

  it("no-ops on malformed payloads", () => {
    const page = aboutPage();
    const def = galleryDefFor("s202508119a2e8fe21b47a");
    for (const value of ["not json", "[]", "{}", "[{}]", '[{"image":""}]', '[{"image":1}]']) {
      const out = applyPageOverrides(page, { [def.key]: value }, "ko", {
        galleryConfigs: { [def.key]: def.gallery! },
      });
      expect(JSON.stringify(out), value).toBe(JSON.stringify(page));
    }
  });
});

describe("aboutCards merge applier", () => {
  const def = () => CONTENT_DEFS.find((candidate) => candidate.kind === "aboutCards")!;

  it("re-applying the default payload preserves the card content", () => {
    const page = aboutPage();
    const baseline = DEFAULT_VALUES[def().key].ko!;
    const out = applyPageOverrides(page, { [def().key]: baseline }, "ko");
    const before = cardWidgetsOf(page).map((w) => parseAboutCard(w.html));
    const after = cardWidgetsOf(out).map((w) => parseAboutCard(w.html));
    expect(after).toEqual(before);
  });

  it("adds a card with suffixed widget ids", () => {
    const marker = "__CARD_ADD__";
    const page = aboutPage();
    const items = JSON.parse(DEFAULT_VALUES[def().key].ko!) as Array<{
      image: string;
      title: string;
      desc: string;
    }>;
    const payload = JSON.stringify([
      ...items,
      { image: `/${marker}.png`, title: marker, desc: marker },
    ]);

    const out = applyPageOverrides(page, { [def().key]: payload }, "ko");
    const cards = cardWidgetsOf(out);
    expect(cards).toHaveLength(7);
    expect(cards[6].html).toContain(marker);
    expect(cards[6].id).toMatch(/__card6$/);
  });

  it("removes trailing cards", () => {
    const page = aboutPage();
    const items = JSON.parse(DEFAULT_VALUES[def().key].ko!) as unknown[];
    const out = applyPageOverrides(page, { [def().key]: JSON.stringify(items.slice(0, 3)) }, "ko");
    expect(cardWidgetsOf(out)).toHaveLength(3);
  });

  it("no-ops on malformed payloads", () => {
    const page = aboutPage();
    for (const value of ["not json", "[]", "{}", "[{}]", '[{"image":""}]']) {
      const out = applyPageOverrides(page, { [def().key]: value }, "ko");
      expect(JSON.stringify(out), value).toBe(JSON.stringify(page));
    }
  });
});

describe("gallery/aboutCards save validation", () => {
  it("rejects a gallery payload over the block maxItems (6 on a max-5 block)", async () => {
    const def = galleryDefFor("s20250918c54b2950e2f1a"); // maxItems 5
    const items = Array.from({ length: 6 }, (_, i) => ({
      image: `/images/${i}.png`,
      title: "",
      desc: "",
    }));
    const result = await saveContent({
      key: def.key,
      locale: "ko",
      value: JSON.stringify(items),
      actor,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Invalid gallery payload");
  });

  it("rejects malformed/empty gallery payloads", async () => {
    const def = galleryDefFor("s202508119a2e8fe21b47a");
    const bad = [
      "[]",
      "{}",
      "not json",
      "[{}]",
      '[{"image":"","title":"","desc":""}]',
      '[{"image":"javascript:alert(1)","title":"","desc":""}]',
      '[{"image":"/x.png","title":1,"desc":""}]',
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, value).toBe(false);
      expect(result.message).toContain("Invalid gallery payload");
    }
  });

  it("accepts a well-formed gallery payload (then reports the missing DB)", async () => {
    const def = galleryDefFor("s20250918c54b2950e2f1a");
    const value = JSON.stringify([
      { image: "/images/a.png", title: "", desc: "" },
      { image: "/images/b.png", title: "", desc: "" },
    ]);
    const result = await saveContent({ key: def.key, locale: "ko", value, actor });
    expect(result).toEqual({ ok: false, message: expect.stringContaining("Database is not configured") });
  });

  it("accepts a well-formed aboutCards payload (then reports the missing DB)", async () => {
    const cardsDef = CONTENT_DEFS.find((candidate) => candidate.kind === "aboutCards")!;
    const value = JSON.stringify([{ image: "/images/a.png", title: "t", desc: "d" }]);
    const result = await saveContent({ key: cardsDef.key, locale: "ko", value, actor });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Database is not configured");
  });
});
