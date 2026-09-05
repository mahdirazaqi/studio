-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TemplateAssetKind" AS ENUM ('DATA', 'IMAGE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "TemplateImageRatio" AS ENUM ('PORTRAIT_9_16', 'LANDSCAPE_16_9', 'SQUARE', 'ANY');

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "composition" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "scriptRef" TEXT NOT NULL,
    "outputPattern" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_assets" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "TemplateAssetKind" NOT NULL,
    "composition" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "imageRatio" "TemplateImageRatio",
    "defaultFileId" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_departmentId_deletedAt_status_idx" ON "templates"("departmentId", "deletedAt", "status");

-- Name uniqueness is scoped to "per Department, among non-deleted rows"
-- (ADR-0027, resolves OD-09) — not expressible as a plain `@@unique` in
-- schema.prisma, which has no filtered/partial-index syntax, so it is added
-- here by hand. A soft-deleted Template's name never blocks a new Template
-- (or a later one) from reusing it; two *active* Templates in the same
-- Department can never share a name. A violation of this index still
-- surfaces through Prisma as an ordinary P2002 error — Prisma detects unique
-- violations by parsing Postgres's SQLSTATE 23505, not by having this index
-- declared in its own schema model.
CREATE UNIQUE INDEX "templates_departmentId_name_active_key" ON "templates"("departmentId", "name") WHERE "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "template_assets_defaultFileId_idx" ON "template_assets"("defaultFileId");

-- CreateIndex
CREATE UNIQUE INDEX "template_assets_templateId_key_key" ON "template_assets"("templateId", "key");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_assets" ADD CONSTRAINT "template_assets_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_assets" ADD CONSTRAINT "template_assets_defaultFileId_fkey" FOREIGN KEY ("defaultFileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
