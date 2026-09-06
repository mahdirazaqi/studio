import "server-only";

import { Telegraf } from "telegraf";

import { env } from "@/server/env";
import { logger } from "@/server/logger";

/**
 * The single Telegraf instance for the whole process (Phase 8 brief §40 —
 * avoid `new Telegraf(...)` running on every request/module evaluation).
 * Mirrors `@/server/db`'s `globalThis`-cached singleton pattern to survive
 * Next.js dev-mode module reloads without leaking a second client.
 *
 * This module owns **only** the raw outbound client — no handler
 * registration. `features/telegram/bot/register.ts` is the one place that
 * attaches Studio's handlers to the instance this returns, exactly once,
 * keeping the same separation `@/server/adapters/storage` has from the
 * `features/files` code that uses it.
 *
 * Returns `null` when `TELEGRAM_BOT_TOKEN` is unset — the Telegram bot is an
 * **optional** deployment feature (unlike the Worker API's required
 * `WORKER_API_KEY`): Studio runs fully without it, and every call site here
 * must treat `null` as "Telegram is disabled," never as an error to surface
 * to a user.
 */
const globalForTelegram = globalThis as unknown as {
  telegramBot: Telegraf | undefined;
};

let warnedMissingToken = false;

export function getTelegramBot(): Telegraf | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    if (!warnedMissingToken) {
      logger.warn(
        "TELEGRAM_BOT_TOKEN is not set — the Telegram bot is disabled.",
      );
      warnedMissingToken = true;
    }
    return null;
  }

  if (!globalForTelegram.telegramBot) {
    globalForTelegram.telegramBot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
  }
  return globalForTelegram.telegramBot;
}
