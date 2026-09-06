import "server-only";

import type { Context, Telegraf } from "telegraf";

import { getTelegramBot } from "@/server/adapters/telegram/client";
import { telegramComposer } from "@/features/telegram/bot/composer";

/**
 * Attaches `telegramComposer` to the singleton bot instance exactly once
 * per process (Phase 8 brief §40) — a second call (e.g. a second webhook
 * request in the same process) reuses the same, already-wired instance
 * rather than calling `bot.use(...)` again, which would otherwise register
 * every handler a second time and reply to each update twice. Mirrors
 * `@/server/db`'s `globalThis`-cached-singleton reasoning, applied to
 * "attach handlers" instead of "construct the client".
 */
const globalForTelegramHandlers = globalThis as unknown as {
  telegramHandlersRegistered: boolean | undefined;
};

export function getRegisteredTelegramBot(): Telegraf<Context> | null {
  const bot = getTelegramBot();
  if (!bot) return null;

  if (!globalForTelegramHandlers.telegramHandlersRegistered) {
    bot.use(telegramComposer);
    globalForTelegramHandlers.telegramHandlersRegistered = true;
  }
  return bot;
}
