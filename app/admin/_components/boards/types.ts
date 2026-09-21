import type { BoardPost } from "@/lib/types";

/** Client-safe mirrors of the `/api/admin/boards` payloads. */

export type BoardLocale = "ko" | "en";

export interface BoardSummary {
  slug: string;
  label: string;
  count: number;
  materialized: boolean;
  hasEnglish: boolean;
}

export interface BoardListResponse {
  locale: BoardLocale;
  dbConfigured: boolean;
  boards: BoardSummary[];
}

export interface BoardDetail {
  slug: string;
  label: string;
  name: string;
  materialized: boolean;
  posts: BoardPost[];
  count: number;
  defaultCount: number;
  isProduct: boolean;
  dbConfigured: boolean;
}
