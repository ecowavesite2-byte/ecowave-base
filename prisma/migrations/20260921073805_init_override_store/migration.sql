-- CreateTable
CREATE TABLE "page_content" (
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ko',
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_content_pkey" PRIMARY KEY ("key","locale")
);

-- CreateTable
CREATE TABLE "site_setting" (
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'string',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_setting_pkey" PRIMARY KEY ("key")
);
