-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('QUEUED', 'CLAIMED', 'RENDERING', 'RENDERED', 'DELIVERING', 'UPLOADED', 'ERROR', 'CANCELED');

-- CreateEnum
CREATE TYPE "JobAssetKind" AS ENUM ('DATA', 'IMAGE', 'AUDIO', 'VIDEO', 'SCRIPT');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER,
    "durationSeconds" INTEGER,
    "deliverToYouTube" BOOLEAN NOT NULL DEFAULT false,
    "retryOfJobId" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "retriedByUserId" TEXT,
    "retryReason" TEXT,
    "canceledByUserId" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "errorReason" TEXT,
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "renderedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_assets" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "slotKey" TEXT,
    "kind" "JobAssetKind" NOT NULL,
    "composition" TEXT,
    "layer" TEXT,
    "textValue" TEXT,
    "fileId" TEXT,
    "fileOriginalName" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileWidth" INTEGER,
    "fileHeight" INTEGER,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_state_createdAt_idx" ON "jobs"("state", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_departmentId_state_createdAt_idx" ON "jobs"("departmentId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_departmentId_createdAt_idx" ON "jobs"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_templateId_idx" ON "jobs"("templateId");

-- CreateIndex
CREATE INDEX "jobs_retryOfJobId_idx" ON "jobs"("retryOfJobId");

-- CreateIndex
CREATE INDEX "job_assets_fileId_idx" ON "job_assets"("fileId");

-- CreateIndex
CREATE INDEX "job_assets_jobId_idx" ON "job_assets"("jobId");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_retryOfJobId_fkey" FOREIGN KEY ("retryOfJobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_retriedByUserId_fkey" FOREIGN KEY ("retriedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assets" ADD CONSTRAINT "job_assets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assets" ADD CONSTRAINT "job_assets_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
