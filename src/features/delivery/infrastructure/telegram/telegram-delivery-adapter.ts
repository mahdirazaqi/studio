import "server-only";

import { getTelegramBot } from "@/server/adapters/telegram/client";
import { logger } from "@/server/logger";

/**
 * Outbound Job-lifecycle notifications to a linked Telegram user
 * (docs/integrations/telegram.md "Notifications", legacy: `JobService`'s
 * `sendTelegramMessage`, called on `Rendered`/`Error`). Currently triggered
 * only by `accept-job-result.ts`, on a successful render — never by anything
 * YouTube-related, since Studio has no delivery step after `RENDERED`
 * (ADR-0041).
 *
 * **Best-effort, never a failure that affects the Job's own state**: matches
 * legacy exactly (a failed Telegram DM was logged only, never surfaced or
 * retried). Telegram is genuinely optional infrastructure (`getTelegramBot()`
 * returns `null` when unconfigured, or the target User simply isn't linked)
 * — both are silent no-ops here, not errors.
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
