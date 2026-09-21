-- CreateTable
CREATE TABLE "board_post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ko',
    "idx" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "thumb" TEXT,
    "isNotice" BOOLEAN NOT NULL DEFAULT false,
    "date" TEXT,
    "views" INTEGER,
    "files" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_post_slug_locale_sortOrder_idx" ON "board_post"("slug", "locale", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "board_post_slug_locale_idx_key" ON "board_post"("slug", "locale", "idx");
