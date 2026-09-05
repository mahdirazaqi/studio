-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('GALLERY_ASSET', 'JOB_ARTIFACT');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO');

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "category" "FileCategory" NOT NULL DEFAULT 'GALLERY_ASSET',
    "kind" "FileKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storageKey_key" ON "files"("storageKey");

-- CreateIndex
CREATE INDEX "files_departmentId_category_createdAt_idx" ON "files"("departmentId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "files_departmentId_kind_idx" ON "files"("departmentId", "kind");

-- CreateIndex
CREATE INDEX "files_departmentId_contentHash_idx" ON "files"("departmentId", "contentHash");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
