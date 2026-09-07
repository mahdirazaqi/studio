-- CreateEnum
CREATE TYPE "WorkerApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- DropForeignKey
ALTER TABLE "youtube_targets" DROP CONSTRAINT "youtube_targets_departmentId_fkey";

-- DropIndex
DROP INDEX "youtube_targets_departmentId_idx";

-- DropIndex
DROP INDEX "youtube_targets_departmentId_youtubeChannelId_key";

-- AlterTable
ALTER TABLE "youtube_targets" DROP COLUMN "departmentId";

-- CreateTable
CREATE TABLE "worker_api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "status" "WorkerApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DepartmentToYouTubeTarget" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DepartmentToYouTubeTarget_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DepartmentToWorkerApiKey" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DepartmentToWorkerApiKey_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_api_keys_keyHash_key" ON "worker_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "_DepartmentToYouTubeTarget_B_index" ON "_DepartmentToYouTubeTarget"("B");

-- CreateIndex
CREATE INDEX "_DepartmentToWorkerApiKey_B_index" ON "_DepartmentToWorkerApiKey"("B");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_targets_youtubeChannelId_key" ON "youtube_targets"("youtubeChannelId");

-- AddForeignKey
ALTER TABLE "worker_api_keys" ADD CONSTRAINT "worker_api_keys_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DepartmentToYouTubeTarget" ADD CONSTRAINT "_DepartmentToYouTubeTarget_A_fkey" FOREIGN KEY ("A") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DepartmentToYouTubeTarget" ADD CONSTRAINT "_DepartmentToYouTubeTarget_B_fkey" FOREIGN KEY ("B") REFERENCES "youtube_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DepartmentToWorkerApiKey" ADD CONSTRAINT "_DepartmentToWorkerApiKey_A_fkey" FOREIGN KEY ("A") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DepartmentToWorkerApiKey" ADD CONSTRAINT "_DepartmentToWorkerApiKey_B_fkey" FOREIGN KEY ("B") REFERENCES "worker_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

