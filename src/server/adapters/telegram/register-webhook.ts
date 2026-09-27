import "server-only";

import { env } from "@/server/env";
import { logger } from "@/server/logger";

/**
 * Registers Studio's webhook URL with Telegram automatically on server
 * startup — replaces the manual, one-time `curl .../setWebhook` call
 * (docs/integrations/telegram.md "Local development / setup") with a
 * self-registering one, invoked from `src/instrumentation.ts`'s `register()`
 * hook (Next.js's own documented startup mechanism).
 *
 * **Deliberately a plain `fetch` against Telegram's raw Bot API, not the
 * shared `telegraf` client (`@/server/adapters/telegram/client`).**
 * `instrumentation.ts` is bundled for the Edge runtime as well as Node.js
 * whenever a project has `middleware.ts` (this one does, ADR-0043) — even
 * behind a `process.env.NEXT_RUNTIME === "nodejs"` guard and a dynamic
 * `import()`, webpack still traces the imported module graph for the Edge
 * bundle. `telegraf` transitively pulls in Node-only builtins (`fs`,
 * `https`) that don't exist there, breaking the build outright. `setWebhook`
 * is a single, stateless HTTP call — it needs no Telegraf instance, so
 * `fetch` (Edge- and Node-safe either way) sidesteps the whole problem
 * rather than trying to work around it.
 *
 * A pure convenience — never required. It does nothing, quietly, unless all
 * three of these are set:
 *
 * - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` — the same two
 *   variables `authenticateTelegramWebhook` (`@/server/telegram-webhook-auth`)
 *   already requires on every incoming webhook request.
 * - `APP_URL` — Studio's own absolute public base URL. Already declared in
 *   `@/server/env` ("used for building absolute links ... and for CORS/
 *   webhook configuration later") but unused until now — this is that
 *   "later."
 *
 * **Never throws.** A network failure here (no internet at boot, Telegram
 * unreachable, or `APP_URL` pointing at an address Telegram's servers can't
 * actually reach yet — e.g. a bare `localhost`/LAN address with no public
 * tunnel in front of it) must never crash server startup; it's logged and
 * Studio starts normally regardless, exactly like every other place this
 * codebase treats a Telegram send/configure failure as best-effort
 * (`sendJobNotification`, `docs/integrations/telegram.md`).
 *
 * **Idempotent** — calling `setWebhook` with the same URL/secret Telegram
 * already has on file is a no-op there, so this can safely run on every
 * server start (dev restart included) without needing its own "already
 * registered" guard.
 */
export async function registerTelegramWebhookOnStartup(): Promise<void> {
  if (!env.APP_URL || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    return;
  }

  const webhookUrl = new URL("/api/telegram/webhook", env.APP_URL).toString();
  const setWebhookApiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;

  try {
    const response = await fetch(setWebhookApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      }),
    });
    const data: unknown = await response.json().catch(() => null);
    const ok =
      response.ok &&
      typeof data === "object" &&
      data !== null &&
      "ok" in data &&
      (data as { ok: unknown }).ok === true;

    if (!ok) {
      logger.warn(
        "Failed to register the Telegram webhook on startup — the bot " +
          "will not receive updates until this succeeds (see " +
          'docs/integrations/telegram.md "Local development / setup")',
        { url: webhookUrl, response: data },
      );
      return;
    }

    logger.info("Registered the Telegram webhook", { url: webhookUrl });
  } catch (error) {
    logger.warn(
      "Failed to register the Telegram webhook on startup — the bot will " +
        "not receive updates until this succeeds (see " +
        'docs/integrations/telegram.md "Local development / setup")',
      { url: webhookUrl, cause: error },
    );
  }
}
