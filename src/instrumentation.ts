/**
 * Next.js's own documented server-startup hook (stable since Next.js 15, no
 * `experimental.instrumentationHook` flag needed) — `register()` runs once
 * when a new server instance boots, in both `next dev` and `next start`,
 * never per-request and never during `next build`'s compile step.
 *
 * Studio's only use of it so far: registering the Telegram webhook with
 * Telegram automatically instead of requiring a manual, one-time
 * `curl .../setWebhook` call — see
 * `registerTelegramWebhookOnStartup`'s doc comment
 * (`@/server/adapters/telegram/register-webhook`) for exactly what it does
 * and why it can never fail startup itself.
 *
 * Guarded to the Node.js runtime only — this project's `middleware.ts`
 * (ADR-0043) makes Next.js bundle `instrumentation.ts` for the Edge runtime
 * too, not just Node.js. `registerTelegramWebhookOnStartup` itself is
 * deliberately Edge-safe (plain `fetch`, no Node builtins — see its own doc
 * comment for why), but this guard is kept anyway: it costs nothing, and it
 * means a future addition to this file that *isn't* Edge-safe (e.g. Prisma)
 * doesn't silently break the Edge bundle the way importing `telegraf` here
 * once did.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerTelegramWebhookOnStartup } =
    await import("@/server/adapters/telegram/register-webhook");
  await registerTelegramWebhookOnStartup();
}
