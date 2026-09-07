-- AlterEnum
BEGIN;
CREATE TYPE "JobState_new" AS ENUM ('QUEUED', 'CLAIMED', 'RENDERING', 'RENDERED', 'ERROR', 'CANCELED');
ALTER TABLE "public"."jobs" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "jobs" ALTER COLUMN "state" TYPE "JobState_new" USING ("state"::text::"JobState_new");
ALTER TYPE "JobState" RENAME TO "JobState_old";
ALTER TYPE "JobState_new" RENAME TO "JobState";
DROP TYPE "public"."JobState_old";
ALTER TABLE "jobs" ALTER COLUMN "state" SET DEFAULT 'QUEUED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TelegramWizardStep_new" AS ENUM ('PICK_TEMPLATE', 'ASK_TRACK_COUNT', 'COLLECT_ASSETS', 'CONFIRM', 'CREATING', 'COMPLETED');
ALTER TABLE "telegram_wizard_states" ALTER COLUMN "step" TYPE "TelegramWizardStep_new" USING ("step"::text::"TelegramWizardStep_new");
ALTER TYPE "TelegramWizardStep" RENAME TO "TelegramWizardStep_old";
ALTER TYPE "TelegramWizardStep_new" RENAME TO "TelegramWizardStep";
DROP TYPE "public"."TelegramWizardStep_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "_DepartmentToYouTubeTarget" DROP CONSTRAINT "_DepartmentToYouTubeTarget_A_fkey";

-- DropForeignKey
ALTER TABLE "_DepartmentToYouTubeTarget" DROP CONSTRAINT "_DepartmentToYouTubeTarget_B_fkey";

-- DropForeignKey
ALTER TABLE "delivery_attempts" DROP CONSTRAINT "delivery_attempts_jobId_fkey";

-- DropForeignKey
ALTER TABLE "templates" DROP CONSTRAINT "templates_youtubeTargetId_fkey";

-- DropForeignKey
ALTER TABLE "youtube_targets" DROP CONSTRAINT "youtube_targets_createdByUserId_fkey";

-- AlterTable
ALTER TABLE "jobs" DROP COLUMN "deliverToYouTube",
DROP COLUMN "deliveredAt",
DROP COLUMN "uploadedAt";

-- AlterTable
ALTER TABLE "templates" DROP COLUMN "description",
DROP COLUMN "tags",
DROP COLUMN "youtubeTargetId";

-- DropTable
DROP TABLE "_DepartmentToYouTubeTarget";

-- DropTable
DROP TABLE "delivery_attempts";

-- DropTable
DROP TABLE "youtube_targets";

-- DropEnum
DROP TYPE "DeliveryProvider";

-- DropEnum
DROP TYPE "DeliveryStatus";

-- DropEnum
DROP TYPE "YouTubeTargetStatus";

