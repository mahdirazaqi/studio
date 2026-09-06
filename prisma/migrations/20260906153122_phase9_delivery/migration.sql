-- CreateEnum
CREATE TYPE "YouTubeTargetStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "DeliveryProvider" AS ENUM ('TELEGRAM', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "screenshotFileId" TEXT,
ADD COLUMN     "thumbnailFileId" TEXT,
ADD COLUMN     "videoFileId" TEXT;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "youtubeTargetId" TEXT;

-- CreateTable
CREATE TABLE "youtube_targets" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "encryptedAccessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "status" "YouTubeTargetStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastErrorReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "provider" "DeliveryProvider" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "providerRef" TEXT,
    "failureReason" TEXT,
    "triggeredByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "youtube_targets_departmentId_idx" ON "youtube_targets"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_targets_departmentId_youtubeChannelId_key" ON "youtube_targets"("departmentId", "youtubeChannelId");

-- CreateIndex
CREATE INDEX "delivery_attempts_jobId_provider_idx" ON "delivery_attempts"("jobId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_jobId_provider_attemptNumber_key" ON "delivery_attempts"("jobId", "provider", "attemptNumber");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_youtubeTargetId_fkey" FOREIGN KEY ("youtubeTargetId") REFERENCES "youtube_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_videoFileId_fkey" FOREIGN KEY ("videoFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_screenshotFileId_fkey" FOREIGN KEY ("screenshotFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_thumbnailFileId_fkey" FOREIGN KEY ("thumbnailFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_targets" ADD CONSTRAINT "youtube_targets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_targets" ADD CONSTRAINT "youtube_targets_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

