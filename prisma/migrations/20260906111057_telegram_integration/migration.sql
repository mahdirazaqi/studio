-- CreateEnum
CREATE TYPE "TelegramWizardFlow" AS ENUM ('SINGLE_TRACK', 'ALBUM');

-- CreateEnum
CREATE TYPE "TelegramWizardStep" AS ENUM ('PICK_TEMPLATE', 'ASK_DELIVERY', 'ASK_TRACK_COUNT', 'COLLECT_ASSETS', 'CONFIRM', 'CREATING', 'COMPLETED');

-- CreateTable
CREATE TABLE "telegram_wizard_states" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flow" "TelegramWizardFlow" NOT NULL,
    "step" "TelegramWizardStep" NOT NULL,
    "payload" JSONB NOT NULL,
    "lastUpdateId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_wizard_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_wizard_states_telegramUserId_key" ON "telegram_wizard_states"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_wizard_states_userId_key" ON "telegram_wizard_states"("userId");

-- AddForeignKey
ALTER TABLE "telegram_wizard_states" ADD CONSTRAINT "telegram_wizard_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

