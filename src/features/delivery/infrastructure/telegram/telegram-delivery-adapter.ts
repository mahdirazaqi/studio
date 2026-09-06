import "server-only";

import { getTelegramBot } from "@/server/adapters/telegram/client";
import { logger } from "@/server/logger";

/**
 * Outbound Job-lifecycle notifications to a linked Telegram user
 * (docs/integrations/telegram.md "Notifications", legacy: `JobService`'s
 * `sendTelegramMessage`, called on `Rendered`/`Uploaded`/`Error`). This is
 * Studio's own **first** trigger point for these — Phase 8 deferred them
 * because nothing yet drove a Job into those states (OD-40); Phase 9's
 * delivery orchestrator is that trigger.
 *
 * **Best-effort, never a delivery failure**: matches legacy exactly (a
 * failed Telegram DM was logged only, never surfaced or retried) — the
 * orchestrator does not create a `DeliveryAttempt` row for this, and a
 * failure here never affects the Job's own state. Telegram is genuinely
 * optional infrastructure (`getTelegramBot()` returns `null` when
 * unconfigured, or the target User simply isn't linked) — both are silent
 * no-ops here, not errors.
 */
export async function sendJobNotification(
  telegramUserId: string,
  text: string,
): Promise<void> {
  const bot = getTelegramBot();
  if (!bot) return;

  try {
    await bot.telegram.sendMessage(telegramUserId, text);
  } catch (error) {
    logger.warn("Best-effort Telegram job notification failed", {
      cause: error,
    });
  }
}
