import { z } from "zod";
import type { Update } from "telegraf/types";

import { defineRouteHandler } from "@/server/api";
import { authenticateTelegramWebhook } from "@/server/telegram-webhook-auth";
import { getRegisteredTelegramBot } from "@/features/telegram/bot/register";

/**
 * The Telegram webhook (docs/integrations/telegram.md "Transport", ADR-0035
 * — webhook was chosen over long-polling: it fits Studio's single Next.js
 * deployable with no extra process, unlike a polling worker, which would be
 * a second deployable needing single-consumer coordination).
 *
 * A thin Route Handler, matching every other external entry point's shape
 * (`docs/architecture/rest-architecture.md`): authenticate (Telegram's own
 * webhook secret token, `@/server/telegram-webhook-auth`) → parse → delegate
 * to the Telegram adapter (`telegramComposer`, wired to the real bot exactly
 * once by `getRegisteredTelegramBot`) → respond. No business logic here —
 * `bot.handleUpdate` dispatches to the composer, which is the only place
 * that calls into the application/use-case layer.
 *
 * The request body is accepted as a loosely-typed JSON object rather than a
 * full `Update` Zod schema — Telegram's Update shape is large, versioned,
 * and evolves on Telegram's own schedule; every field access inside the
 * composer is already optional-chained/narrowed rather than assumed
 * present, so a stricter schema here would only reject updates Telegram
 * itself considers valid without adding a real safety property. The
 * authentication step above is what actually keeps this endpoint from
 * accepting arbitrary input in the first place.
 *
 * Always resolves `204` — Telegram only needs any `2xx` to consider the
 * update delivered; the actual reply (if any) is sent back to the user as a
 * separate outbound Bot API call from within the composer, not as this
 * response's body.
 */
export const POST = defineRouteHandler({
  name: "telegram.webhook",
  authenticate: authenticateTelegramWebhook,
  body: z.record(z.string(), z.unknown()),
  handler: async ({ body }) => {
    const bot = getRegisteredTelegramBot();
    // `authenticateTelegramWebhook` already threw `dependency` if Telegram
    // isn't configured, so this should be unreachable in practice — kept as
    // a defensive no-op rather than a second thrown error.
    if (!bot) return null;

    await bot.handleUpdate(body as unknown as Update);
    return null;
  },
});
