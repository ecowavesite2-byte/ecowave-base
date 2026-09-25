import type { Locale } from "./i18n";

/** UI chrome strings (page content lives in content/{locale}) */
export type UIStrings = {
  board: {
    list: string;
    views: string;
    notice: string;
    prev: string;
    next: string;
    noPosts: string;
    noResults: string;
    all: string;
  };
  common: { search: string; home: string };
  lang: { ko: string; en: string };
};

const dict: Record<Locale, UIStrings> = {
  ko: {
    board: {
      list: "목록",
      views: "조회수",
      notice: "공지",
      prev: "이전글",
      next: "다음글",
      noPosts: "등록된 글이 없습니다.",
      noResults: "검색 결과가 없습니다.",
      all: "전체",
    },
    common: {
      search: "검색",
      home: "홈",
    },
    lang: { ko: "한국어", en: "English" },
  },
  en: {
    board: {
      list: "List",
      views: "Views",
      notice: "Notice",
      prev: "Prev",
      next: "Next",
      noPosts: "No posts.",
      noResults: "No results found.",
      all: "All",
    },
    common: {
      search: "Search",
      home: "Home",
    },
    lang: { ko: "한국어", en: "English" },
  },
};

export function ui(locale: Locale): UIStrings {
  return dict[locale];
}
