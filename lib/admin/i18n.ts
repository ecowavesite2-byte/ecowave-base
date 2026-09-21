/**
 * Shared ECOWAVE admin UI dictionary (KO / EN).
 *
 * Plain, dependency-free TypeScript: it imports nothing (no next/*, no React,
 * no content registry) so it can be consumed from server components, client
 * islands and tests alike.
 *
 * Shape
 * -----
 *   `AdminLocale`        – "ko" | "en"
 *   `adminDict[locale]`  – the `AdminDict` for that locale
 *   `AdminDict`          – namespaced UI strings:
 *                            shell      – app title, identity line, view-site,
 *                                         sign-out, language toggle, desktop-only notice
 *                            nav        – sidebar group + entry labels
 *                            dashboard  – /admin overview (stat cards, quick links, notes)
 *                            settings   – /admin/settings (form chrome + missing-def note)
 *   `ADMIN_LOCALE_COOKIE` – cookie that persists the chosen admin locale
 *   `defaultAdminLocale`  – used when that cookie is absent
 *   `isAdminLocale(v)`    – runtime narrowing for cookie values
 *   `ADMIN_CONTENT_GROUPS`/`ADMIN_BOARD_ENTRIES` – explicit mapping from the
 *     registry `?group=` ids / board slugs to the sidebar label keys, so the
 *     content + boards routes stay in sync with this file.
 *
 * Parameterised strings are functions (`(n) => string`) so both locales keep
 * their own word order; everything else is a plain string.
 *
 * Admin routes are NOT locale-prefixed (the public `/en` prefix does not apply),
 * so the locale is carried by a cookie and read server-side. See
 * `app/admin/_components/AdminShell.tsx`.
 */

export type AdminLocale = "ko" | "en";

export const ADMIN_LOCALES: readonly AdminLocale[] = ["ko", "en"];

/** Non-httpOnly cookie holding the admin's chosen locale. */
export const ADMIN_LOCALE_COOKIE = "ecowave_admin_locale";

/** The site's primary language is Korean, so the admin defaults to Korean too. */
export const defaultAdminLocale: AdminLocale = "ko";

export function isAdminLocale(value: unknown): value is AdminLocale {
  return value === "ko" || value === "en";
}

/** Content-group ids used by `app/admin/(dashboard)/content/page.tsx` (`?group=`). */
export type AdminContentGroup = "home" | "company" | "rnd" | "products" | "boards" | "site";

export interface AdminDict {
  shell: {
    /** App title shown at the top of every admin page. */
    title: string;
    /** Role word shown before the signed-in email. */
    adminRole: string;
    /** "View site" link label. */
    viewSite: string;
    /** Sign-out button label / busy label. */
    signOut: string;
    signingOut: string;
    /** Accessible label for the KO/EN segmented control. */
    language: string;
    /** Shown instead of the sidebar below the desktop breakpoint. */
    desktopOnly: string;
    desktopOnlyHint: string;
  };
  nav: {
    overview: string;
    contentGroup: string;
    boardsGroup: string;
    managementGroup: string;
    content: Record<AdminContentGroup, string>;
    boards: {
      news: string;
      notices: string;
      ecoWave: string;
      cleanB: string;
      flowell: string;
    };
    settings: string;
  };
  dashboard: {
    contentOverrides: string;
    contentOverridesSub: (count: number, total: number) => string;
    boardPosts: string;
    boardPostsSub: (ko: number, en: number) => string;
    boardsCustomized: string;
    boardsCustomizedSub: (count: number, total: number) => string;
    siteSettings: string;
    siteSettingsSub: (set: number, total: number) => string;
    /** Shown when DATABASE_URL is missing. */
    dbNotice: string;
    quickLinks: string;
    links: { href: string; label: string; desc: string }[];
    notes: string;
    noteLines: string[];
  };
  settings: {
    title: string;
    blurb: string;
    /** Heading above the registry `site` group sections. */
    navHeading: string;
    loading: string;
    loadError: string;
    retry: string;
    empty: string;
    dbNotice: string;
    /** Placeholder for a field whose registry default is empty. */
    emptyPlaceholder: string;
    /** Hint describing default-as-placeholder + empty-to-revert. */
    defaultHint: string;
    save: string;
    saving: string;
    saved: string;
    unsaved: string;
    upToDate: string;
    failed: string;
    /** Honest note about MCell settings that ecowave's registry has no defs for. */
    missingTitle: string;
    missingBody: string;
  };
  /**
   * `/admin/content` — the registry override editor (MCell "pages editor" UX):
   * accordion sections, per-field KO/EN inputs, default-as-placeholder, a scaled
   * live preview and the dynamic `list` editor.
   */
  content: {
    title: string;
    blurb: string;
    loading: string;
    loadError: string;
    retry: string;
    empty: string;
    dbNotice: string;
    /** Page-divider labels keyed by the registry `pageKey`. */
    pageLabels: Record<string, string>;
    /** Kind badge labels keyed by `ContentKind`. */
    kinds: Record<string, string>;
    /** Field counter shown on an accordion header. */
    fieldCount: (count: number) => string;
    save: string;
    saving: string;
    saved: string;
    unsaved: string;
    upToDate: string;
    failed: string;
    ko: string;
    en: string;
    sharedUrlNote: string;
    /** Badge marking a value that comes from the code default (no override yet). */
    defaultBadge: string;
    defaultHint: string;
    urlPlaceholder: string;
    imageUpload: string;
    imageUploading: string;
    imageUploadFailed: string;
    imagePreview: string;
    imageClear: string;
    /** Dynamic `list` editor. */
    listItems: (count: number) => string;
    listEmpty: string;
    listAdd: string;
    listRemove: string;
    listMoveUp: string;
    listMoveDown: string;
    listDefaultNote: string;
    listJsonValue: string;
    /** Scaled live preview. */
    previewTitle: string;
    previewLang: string;
    previewHint: string;
    previewFootnote: string;
    previewUnavailable: string;
    previewUnavailableBoard: string;
    previewUnavailableMobile: string;
    previewUnavailableChrome: string;
    /** Header label for a section whose fields/section carry no descriptive name. */
    unnamedSection: string;
  };
  /**
   * `/admin/boards` + `/admin/boards/<slug>` — the board picker, the per-board
   * editor and the post form. Follows the admin UI locale.
   *
   * NOTE: the board CONTENT locale (Korean/English post columns) is a separate
   * axis, still chosen by the on-screen locale switch; its labels are the
   * `localeKo`/`localeEn` keys below, mirroring `content.ko`/`content.en`.
   */
  boards: {
    title: string;
    pickerBlurb: string;
    backLabel: string;
    viewBoard: string;
    loading: string;
    retry: string;
    dbNotice: string;
    pickerLoadError: string;
    boardLoadError: string;
    actionFailed: string;
    requestFailed: (status: number) => string;
    networkError: string;
    overrides: string;
    defaults: string;
    enInherits: string;
    postCount: (count: number) => string;
    localeKo: string;
    localeEn: string;
    nameLabel: string;
    nameHint: string;
    save: string;
    saving: string;
    saved: string;
    failed: string;
    uploading: string;
    uploadFailed: (status: number) => string;
    unsupportedFile: (name: string, mb: number) => string;
    overridesActive: string;
    crawledDefaults: (count: number) => string;
    seed: string;
    reset: string;
    resetConfirm: string;
    addPost: string;
    defaultsNotice: string;
    newPost: string;
    editPost: (idx: string) => string;
    columns: { title: string; status: string; date: string; views: string; manage: string };
    noPosts: string;
    noTitle: string;
    notice: string;
    normal: string;
    attachments: (count: number) => string;
    removeAttachment: (name: string) => string;
    edit: string;
    delete: string;
    deleteConfirm: (title: string) => string;
    form: {
      title: string;
      category: string;
      date: string;
      dateHint: string;
      thumbnail: string;
      thumbnailHint: string;
      thumbnailPlaceholder: string;
      excerpt: string;
      content: string;
      contentHint: string;
      contentPlaceholder: string;
      insertImage: string;
      insertImageTitle: string;
      insertImageHint: string;
      attachments: string;
      noAttachments: string;
      addFiles: string;
      addFilesTitle: string;
      addFilesHint: string;
      pinnedNotice: string;
      save: string;
      saving: string;
      cancel: string;
    };
  };
}

/** Registry `?group=` ids → sidebar label keys (order = sidebar order). */
export const ADMIN_CONTENT_GROUPS: readonly {
  group: AdminContentGroup;
  key: AdminContentGroup;
}[] = [
  { group: "home", key: "home" },
  { group: "company", key: "company" },
  { group: "rnd", key: "rnd" },
  { group: "products", key: "products" },
  { group: "boards", key: "boards" },
  { group: "site", key: "site" },
];

/** Board slugs (`lib/content/boards.ts`) → sidebar label keys (order = sidebar order). */
export const ADMIN_BOARD_ENTRIES: readonly {
  slug: string;
  key: keyof AdminDict["nav"]["boards"];
}[] = [
  { slug: "news", key: "news" },
  { slug: "notices", key: "notices" },
  { slug: "products.eco-wave", key: "ecoWave" },
  { slug: "products.clean-b", key: "cleanB" },
  { slug: "products.flowell", key: "flowell" },
];

const ko: AdminDict = {
  shell: {
    title: "에코웨이브 관리자",
    adminRole: "관리자",
    viewSite: "사이트 보기",
    signOut: "로그아웃",
    signingOut: "로그아웃 중…",
    language: "관리자 언어",
    desktopOnly: "데스크톱에서 이용해 주세요",
    desktopOnlyHint:
      "관리자 화면은 데스크톱(넓은 화면) 전용입니다. PC에서 접속해 주세요.",
  },
  nav: {
    overview: "현황",
    contentGroup: "콘텐츠",
    boardsGroup: "게시판",
    managementGroup: "관리",
    content: {
      home: "홈",
      company: "회사 소개",
      rnd: "연구개발",
      products: "제품 소개",
      boards: "게시판 콘텐츠",
      site: "사이트 내비게이션",
    },
    boards: {
      news: "뉴스",
      notices: "공지사항",
      ecoWave: "에코웨이브",
      cleanB: "크린비",
      flowell: "플로웰",
    },
    settings: "사이트 설정",
  },
  dashboard: {
    contentOverrides: "페이지 콘텐츠 덮어쓰기",
    contentOverridesSub: (count, total) => `전체 ${total}개 필드 중 ${count}개`,
    boardPosts: "게시물 덮어쓰기",
    boardPostsSub: (koCount, enCount) => `한국어 ${koCount} · 영어 ${enCount}`,
    boardsCustomized: "수정된 게시판",
    boardsCustomizedSub: (count, total) => `전체 ${total}개 중 ${count}개`,
    siteSettings: "사이트 설정값",
    siteSettingsSub: (set, total) => `저장됨 ${set} / ${total}`,
    dbNotice:
      "데이터베이스가 설정되지 않았습니다 (DATABASE_URL 없음). 기본 콘텐츠만 표시되며 저장은 비활성화됩니다.",
    quickLinks: "바로가기",
    links: [
      { href: "/admin/content?group=company", label: "회사 소개", desc: "회사 페이지 문구·이미지" },
      { href: "/admin/content?group=products", label: "제품 소개", desc: "제품 페이지 문구·이미지" },
      { href: "/admin/boards", label: "게시판 관리", desc: "뉴스·공지·제품 게시물" },
      { href: "/admin/settings", label: "사이트 설정", desc: "회사·연락처·소셜 정보" },
    ],
    notes: "안내",
    noteLines: [
      "값을 비우고 저장하면 코드 기본값으로 되돌아갑니다.",
      "게시판은 덮어쓰기 행이 하나라도 있으면 그 목록이 크롤링 기본값을 대체합니다.",
      "관리자 화면은 데스크톱 전용이며 모든 페이지 오버라이드는 한국어·영어로 각각 저장됩니다.",
    ],
  },
  settings: {
    title: "사이트 설정",
    blurb: "사이트 전역에 반영되는 설정값을 관리합니다.",
    navHeading: "내비게이션 라벨",
    loading: "불러오는 중…",
    loadError: "설정을 불러오지 못했습니다.",
    retry: "다시 시도",
    empty: "이 그룹에 편집할 필드가 없습니다.",
    dbNotice:
      "데이터베이스가 설정되지 않았습니다 (DATABASE_URL 없음). 코드 기본값만 표시되며 저장은 비활성화됩니다.",
    emptyPlaceholder: "기본값 없음",
    defaultHint:
      "회색으로 표시된 값은 사이트 기본값입니다. 입력하고 저장하면 덮어쓰기로 저장되고, 비우고 저장하면 기본값으로 되돌아갑니다.",
    save: "저장",
    saving: "저장 중…",
    saved: "저장됨",
    unsaved: "저장되지 않은 변경",
    upToDate: "최신 상태",
    failed: "실패",
    missingTitle: "아직 편집할 수 없는 항목",
    missingBody:
      "회사명·대표자·사업자등록번호·주소·전화/팩스·이메일과 소셜 링크는 콘텐츠 레지스트리에 정의가 없어 이 화면에서 편집할 수 없습니다. 현재는 회사 소개 페이지의 HTML 블록에서 관리됩니다.",
  },
  content: {
    title: "페이지 콘텐츠",
    blurb:
      "페이지의 문구·이미지·링크를 언어별로 관리합니다. 회색으로 표시된 값은 코드 기본값이며, 입력 후 저장하면 덮어쓰기로 저장됩니다.",
    loading: "불러오는 중…",
    loadError: "콘텐츠를 불러오지 못했습니다.",
    retry: "다시 시도",
    empty: "이 그룹에 편집할 필드가 없습니다.",
    dbNotice:
      "데이터베이스가 설정되지 않았습니다 (DATABASE_URL 없음). 코드 기본값만 표시되며 저장은 비활성화됩니다.",
    pageLabels: {
      home: "홈",
      company: "회사 소개",
      "company.about": "회사소개",
      "company.ceo": "CEO 인사말",
      "company.global": "글로벌 네트워크",
      "company.history": "연혁",
      "company.organization": "조직도",
      "company.philosophy": "경영이념",
      rnd: "연구개발",
      "rnd.technology": "기술력",
      "rnd.patents": "특허·인증",
      "rnd.facilities": "설비",
      "products.clean-b": "크린비",
      "products.eco-wave": "에코웨이브",
      "products.flowell": "플로웰",
      news: "뉴스",
      notices: "공지사항",
      support: "고객지원",
      site: "사이트 내비게이션",
    },
    kinds: {
      text: "텍스트",
      textarea: "문단",
      image: "이미지",
      url: "링크",
      list: "목록",
    },
    fieldCount: (count) => `${count}개 필드`,
    save: "저장",
    saving: "저장 중…",
    saved: "저장됨",
    unsaved: "저장되지 않은 변경",
    upToDate: "최신 상태",
    failed: "실패",
    ko: "한국어",
    en: "English",
    sharedUrlNote: "링크는 언어 공통으로 저장됩니다.",
    defaultBadge: "기본값",
    defaultHint:
      "비어 있는 칸은 코드 기본값(회색)이 적용됩니다. 값을 입력하고 저장하면 덮어쓰기로 저장되고, 다시 비우고 저장하면 기본값으로 돌아갑니다.",
    urlPlaceholder: "/경로 또는 https://…",
    imageUpload: "파일 업로드",
    imageUploading: "업로드 중…",
    imageUploadFailed: "업로드 실패",
    imagePreview: "미리보기",
    imageClear: "선택 취소",
    listItems: (count) => `${count}개 항목`,
    listEmpty: "항목이 없습니다. 아래 버튼으로 추가하세요.",
    listAdd: "항목 추가",
    listRemove: "삭제",
    listMoveUp: "위로",
    listMoveDown: "아래로",
    listDefaultNote: "모든 항목을 삭제하면 게시판은 크롤링 기본값으로 돌아갑니다.",
    listJsonValue: "JSON 값",
    previewTitle: "미리보기",
    previewLang: "미리보기 언어",
    previewHint:
      "선택한 섹션을 실제 페이지 컴포넌트로 렌더링합니다. 저장 전 입력값이 즉시 반영되며, 언어 토글은 관리자 UI 언어와 별개로 동작합니다.",
    previewFootnote:
      "미리보기는 실제 공개 페이지와 동일한 컴포넌트를 사용하며, 일부 전용 컴포넌트(홈 비주얼, 게시판 등)는 표시되지 않을 수 있습니다.",
    previewUnavailable: "이 섹션은 미리보기를 지원하지 않습니다.",
    previewUnavailableBoard: "게시판 게시물 목록은 게시판 화면에서 미리보기와 저장이 이루어집니다.",
    previewUnavailableMobile:
      "이 섹션은 모바일 전용(mobile_section)이라 데스크톱 미리보기에는 표시되지 않습니다.",
    previewUnavailableChrome:
      "이 섹션은 사이트 공통 푸터 영역이라 개별 섹션 미리보기에서 제외됩니다.",
    unnamedSection: "이름 없는 섹션",
  },
  boards: {
    title: "게시판",
    pickerBlurb: "게시판 덮어쓰기 · 비어 있으면 크롤링 기본값을 사용합니다",
    backLabel: "게시판",
    viewBoard: "게시판 보기",
    loading: "불러오는 중…",
    retry: "다시 시도",
    dbNotice:
      "데이터베이스가 설정되지 않았습니다 (DATABASE_URL 없음). 크롤링 기본값만 표시되며 저장은 비활성화됩니다.",
    pickerLoadError: "게시판을 불러오지 못했습니다.",
    boardLoadError: "이 게시판을 불러오지 못했습니다.",
    actionFailed: "작업에 실패했습니다.",
    requestFailed: (status) => `요청에 실패했습니다 (HTTP ${status}).`,
    networkError: "네트워크 오류입니다. 연결을 확인한 뒤 다시 시도하세요.",
    overrides: "덮어쓰기",
    defaults: "기본값",
    enInherits: "영어 상속",
    postCount: (count) => `${count}개 게시물`,
    localeKo: "한국어",
    localeEn: "English",
    nameLabel: "게시판 이름",
    nameHint: "비우면 게시판 기본 이름으로 되돌아갑니다",
    save: "저장",
    saving: "저장 중…",
    saved: "저장됨",
    failed: "실패",
    uploading: "업로드 중…",
    uploadFailed: (status) => `업로드 실패 (HTTP ${status}).`,
    unsupportedFile: (name, mb) => `${name}: 지원하지 않는 형식이거나 ${mb}MB를 초과했습니다`,
    overridesActive: "덮어쓰기 사용 중",
    crawledDefaults: (count) => `크롤링 기본값 (${count}개)`,
    seed: "기본값에서 가져오기",
    reset: "기본값으로 초기화",
    resetConfirm:
      "이 게시판을 크롤링 기본값으로 초기화하시겠습니까? 이 언어의 모든 덮어쓰기가 삭제됩니다.",
    addPost: "게시물 추가",
    defaultsNotice:
      "크롤링 기본값을 표시하고 있습니다. 기본값을 가져오거나 게시물을 추가하면 이 게시판을 덮어쓸 수 있습니다.",
    newPost: "새 게시물 (저장되지 않음)",
    editPost: (idx) => `게시물 수정 · ${idx}`,
    columns: {
      title: "제목",
      status: "상태",
      date: "작성일",
      views: "조회",
      manage: "관리",
    },
    noPosts: "게시물이 없습니다.",
    noTitle: "(제목 없음)",
    notice: "공지",
    normal: "일반",
    attachments: (count) => `첨부 ${count}개`,
    removeAttachment: (name) => `${name} 첨부 삭제`,
    edit: "수정",
    delete: "삭제",
    deleteConfirm: (title) => `게시물 “${title}”을(를) 삭제하시겠습니까?`,
    form: {
      title: "제목",
      category: "카테고리",
      date: "작성일",
      dateHint: "자유 입력",
      thumbnail: "썸네일",
      thumbnailHint: "상대 경로(/…) 또는 https URL",
      thumbnailPlaceholder: "/images/…",
      excerpt: "요약",
      content: "본문",
      contentHint: "HTML · 저장 시 정리됨",
      contentPlaceholder: "<p>HTML…</p>",
      insertImage: "이미지 삽입",
      insertImageTitle: "이미지를 업로드해 커서 위치에 삽입합니다",
      insertImageHint: "커서 위치에 <img> 태그를 삽입합니다.",
      attachments: "첨부 파일",
      noAttachments: "첨부 파일이 없습니다.",
      addFiles: "파일 추가",
      addFilesTitle: "이미지 또는 PDF 첨부",
      addFilesHint: "이미지 또는 PDF, 각 8MB 이하.",
      pinnedNotice: "공지로 고정",
      save: "저장",
      saving: "저장 중…",
      cancel: "취소",
    },
  },
};

const en: AdminDict = {
  shell: {
    title: "ECOWAVE Admin",
    adminRole: "Administrator",
    viewSite: "View site",
    signOut: "Sign out",
    signingOut: "Signing out…",
    language: "Admin language",
    desktopOnly: "Please use a desktop screen",
    desktopOnlyHint:
      "The admin dashboard is only available on desktop-sized screens. Please sign in from a PC.",
  },
  nav: {
    overview: "Overview",
    contentGroup: "Content",
    boardsGroup: "Boards",
    managementGroup: "Management",
    content: {
      home: "Home",
      company: "Company",
      rnd: "R&D",
      products: "Products",
      boards: "Board content",
      site: "Site navigation",
    },
    boards: {
      news: "News",
      notices: "Notices",
      ecoWave: "Eco wave",
      cleanB: "Clean B",
      flowell: "Flowell",
    },
    settings: "Site settings",
  },
  dashboard: {
    contentOverrides: "Page content overrides",
    contentOverridesSub: (count, total) => `${count} of ${total} fields`,
    boardPosts: "Post overrides",
    boardPostsSub: (koCount, enCount) => `Korean ${koCount} · English ${enCount}`,
    boardsCustomized: "Customized boards",
    boardsCustomizedSub: (count, total) => `${count} of ${total} boards`,
    siteSettings: "Site setting values",
    siteSettingsSub: (set, total) => `${set} of ${total} set`,
    dbNotice:
      "Database is not configured (DATABASE_URL missing). Showing code defaults — saving is disabled.",
    quickLinks: "Quick links",
    links: [
      { href: "/admin/content?group=company", label: "Company", desc: "Company page copy and media" },
      { href: "/admin/content?group=products", label: "Products", desc: "Product page copy and media" },
      { href: "/admin/boards", label: "Boards", desc: "News, notices and product posts" },
      { href: "/admin/settings", label: "Site settings", desc: "Company, contact and social info" },
    ],
    notes: "Notes",
    noteLines: [
      "Saving an empty value removes the override and reverts to the code default.",
      "A board with any override rows replaces the crawled default list entirely.",
      "The admin is desktop-only; page overrides are stored per language (Korean and English).",
    ],
  },
  settings: {
    title: "Site settings",
    blurb: "Manage the values applied across the whole site.",
    navHeading: "Navigation labels",
    loading: "Loading…",
    loadError: "Could not load settings.",
    retry: "Retry",
    empty: "No editable fields in this group.",
    dbNotice:
      "Database is not configured (DATABASE_URL missing). Showing code defaults — saving is disabled.",
    emptyPlaceholder: "No default",
    defaultHint:
      "Grey text is the site default. Type and save to store an override; clear the field and save to revert to the default.",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    unsaved: "Unsaved changes",
    upToDate: "Up to date",
    failed: "Failed",
    missingTitle: "Not editable yet",
    missingBody:
      "Company name, representative, business number, address, phone/fax, email and social links have no definitions in the content registry, so they cannot be edited here. They currently live in the HTML blocks of the Company pages.",
  },
  content: {
    title: "Page content",
    blurb:
      "Manage page copy, images and links per language. Grey values are code defaults — type a value and save to store an override.",
    loading: "Loading…",
    loadError: "Could not load content.",
    retry: "Retry",
    empty: "No editable fields in this group.",
    dbNotice:
      "Database is not configured (DATABASE_URL missing). Showing code defaults — saving is disabled.",
    pageLabels: {
      home: "Home",
      company: "Company",
      "company.about": "About",
      "company.ceo": "CEO greeting",
      "company.global": "Global network",
      "company.history": "History",
      "company.organization": "Organization",
      "company.philosophy": "Philosophy",
      rnd: "R&D",
      "rnd.technology": "Technology",
      "rnd.patents": "Patents & certifications",
      "rnd.facilities": "Facilities",
      "products.clean-b": "Clean B",
      "products.eco-wave": "Eco wave",
      "products.flowell": "Flowell",
      news: "News",
      notices: "Notices",
      support: "Support",
      site: "Site navigation",
    },
    kinds: {
      text: "Text",
      textarea: "Paragraph",
      image: "Image",
      url: "Link",
      list: "List",
    },
    fieldCount: (count) => `${count} fields`,
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    unsaved: "Unsaved changes",
    upToDate: "Up to date",
    failed: "Failed",
    ko: "Korean",
    en: "English",
    sharedUrlNote: "Links are saved once for both languages.",
    defaultBadge: "Default",
    defaultHint:
      "An empty input falls back to the grey code default. Type and save to store an override; clear it and save to revert to the default.",
    urlPlaceholder: "/path or https://…",
    imageUpload: "Upload file",
    imageUploading: "Uploading…",
    imageUploadFailed: "Upload failed",
    imagePreview: "Preview",
    imageClear: "Clear",
    listItems: (count) => `${count} items`,
    listEmpty: "No items yet. Add one below.",
    listAdd: "Add item",
    listRemove: "Remove",
    listMoveUp: "Move up",
    listMoveDown: "Move down",
    listDefaultNote: "Removing every item restores the crawled board defaults.",
    listJsonValue: "JSON value",
    previewTitle: "Preview",
    previewLang: "Preview language",
    previewHint:
      "Renders the selected section with the real page components. Unsaved input is reflected instantly; the language toggle is independent of the admin UI language.",
    previewFootnote:
      "The preview uses the same components as the public page; some bespoke sections (home visuals, boards) may render empty.",
    previewUnavailable: "This section cannot be previewed.",
    previewUnavailableBoard: "Board post lists are previewed and saved on the Boards screen.",
    previewUnavailableMobile:
      "This section is mobile-only (mobile_section), so it does not render at desktop width.",
    previewUnavailableChrome:
      "This is the shared footer chrome, so it is excluded from the per-section preview.",
    unnamedSection: "Unnamed section",
  },
  boards: {
    title: "Boards",
    pickerBlurb: "Board overrides · empty uses crawled defaults",
    backLabel: "Boards",
    viewBoard: "View board",
    loading: "Loading…",
    retry: "Retry",
    dbNotice:
      "Database is not configured (DATABASE_URL missing). Showing crawled defaults — saving is disabled.",
    pickerLoadError: "Could not load boards.",
    boardLoadError: "Could not load this board.",
    actionFailed: "Action failed.",
    requestFailed: (status) => `Request failed (HTTP ${status}).`,
    networkError: "Network error. Retry when online.",
    overrides: "Overrides",
    defaults: "Defaults",
    enInherits: "EN inherits",
    postCount: (count) => `${count} ${count === 1 ? "post" : "posts"}`,
    localeKo: "Korean",
    localeEn: "English",
    nameLabel: "Board name",
    nameHint: "empty reverts to the board label",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    failed: "Failed",
    uploading: "Uploading…",
    uploadFailed: (status) => `Upload failed (HTTP ${status}).`,
    unsupportedFile: (name, mb) => `${name}: unsupported type or over ${mb} MB`,
    overridesActive: "Overrides active",
    crawledDefaults: (count) => `Crawled defaults (${count})`,
    seed: "Seed from defaults",
    reset: "Reset to defaults",
    resetConfirm:
      "Reset this board to the crawled defaults? All overrides for this locale are removed.",
    addPost: "Add post",
    defaultsNotice: "Showing crawled defaults. Seed (or add a post) to start overriding this board.",
    newPost: "New post (unsaved)",
    editPost: (idx) => `Edit post · ${idx}`,
    columns: {
      title: "Title",
      status: "Status",
      date: "Date",
      views: "Views",
      manage: "Manage",
    },
    noPosts: "No posts.",
    noTitle: "(no title)",
    notice: "Notice",
    normal: "Normal",
    attachments: (count) => `${count} attachment${count === 1 ? "" : "s"}`,
    removeAttachment: (name) => `Remove ${name}`,
    edit: "Edit",
    delete: "Delete",
    deleteConfirm: (title) => `Delete post “${title}”?`,
    form: {
      title: "Title",
      category: "Category",
      date: "Date",
      dateHint: "free text",
      thumbnail: "Thumbnail",
      thumbnailHint: "relative /… path or https URL",
      thumbnailPlaceholder: "/images/…",
      excerpt: "Excerpt",
      content: "Content",
      contentHint: "HTML · sanitized on save",
      contentPlaceholder: "<p>HTML…</p>",
      insertImage: "Insert image",
      insertImageTitle: "Upload an image and insert it at the caret",
      insertImageHint: "Inserts an <img> tag at the cursor.",
      attachments: "Attachments",
      noAttachments: "No attachments.",
      addFiles: "Add files",
      addFilesTitle: "Attach images or PDFs",
      addFilesHint: "Images or PDF, up to 8 MB each.",
      pinnedNotice: "Pinned notice",
      save: "Save",
      saving: "Saving…",
      cancel: "Cancel",
    },
  },
};

export const adminDict: Record<AdminLocale, AdminDict> = { ko, en };
