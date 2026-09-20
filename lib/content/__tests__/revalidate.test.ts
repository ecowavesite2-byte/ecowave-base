import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../read", () => ({
  hasEnglishPage: vi.fn(),
  hasEnglishBoard: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { hasEnglishBoard, hasEnglishPage } from "../read";
import { pathsFor, revalidateFor } from "../revalidate";

const hasPage = vi.mocked(hasEnglishPage);
const hasBoard = vi.mocked(hasEnglishBoard);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pathsFor", () => {
  it("invalidates both locales for a ko page whose en file is missing", () => {
    hasPage.mockReturnValue(false);
    expect(pathsFor("page", "ko", "home")).toEqual(["/", "/en"]);
  });

  it("invalidates only the ko route when an en override exists", () => {
    hasPage.mockReturnValue(true);
    expect(pathsFor("page", "ko", "company.ceo")).toEqual(["/company/ceo"]);
  });

  it("invalidates only the en route when editing en", () => {
    hasPage.mockReturnValue(true);
    expect(pathsFor("page", "en", "home")).toEqual(["/en"]);
  });

  it("invalidates a board list plus its detail route", () => {
    hasBoard.mockReturnValue(true);
    expect(pathsFor("board", "ko", "news")).toEqual(["/news", "/news/[id]"]);
  });

  it("maps product board slugs to slash routes", () => {
    hasBoard.mockReturnValue(true);
    expect(pathsFor("board", "ko", "products.eco-wave")).toEqual([
      "/products/eco-wave",
      "/products/eco-wave/[id]",
    ]);
  });

  it("returns the root layout target for site", () => {
    expect(pathsFor("site", "ko", "")).toEqual(["/"]);
  });
});

describe("revalidateFor", () => {
  it("uses the layout type for site", async () => {
    await revalidateFor("site", "ko", "");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("uses the page type for pages", async () => {
    hasPage.mockReturnValue(true);
    await revalidateFor("page", "ko", "home");
    expect(revalidatePath).toHaveBeenCalledWith("/", "page");
  });
});
