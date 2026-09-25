-- CreateTable
CREATE TABLE "inquiry" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ko',
    "company" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productsEtc" TEXT,
    "oem" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "fileName" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inquiry_createdAt_idx" ON "inquiry"("createdAt");
