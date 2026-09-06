import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import {
  dependencyError,
  unauthenticatedError,
} from "@/server/errors/app-error";
import { env } from "@/server/env";

/**
 * TELEGRAM WEBHOOK AUTHENTICATION BOUNDARY (docs/integrations/telegram.md
 * "Webhook security", ADR-0035). The sole place Studio reads or compares
 * `TELEGRAM_WEBHOOK_SECRET` — mirrors `@/server/worker-auth`'s identical
 * reasoning and timing-safe comparison technique for the Worker API key, so
 * the same reviewed pattern covers both of Studio's non-session
 * credentials.
 *
 * Telegram sends this value back verbatim on the
 * `X-Telegram-Bot-Api-Secret-Token` header of every webhook request, once
 * configured via the `secret_token` parameter of a `setWebhook` call — it is
 * Telegram's own supported webhook-authentication mechanism (Phase 8 brief
 * §38), not a Studio invention. Do not rely on the webhook URL's obscurity
 * instead.
 */
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Throws `dependency` (503) if Telegram isn't configured at all — an
 * intentionally different failure mode from `unauthenticated` (401), so an
 * operator checking logs can tell "Telegram is disabled here" apart from
 * "someone sent a bad/missing secret." Throws `unauthenticated` for a
 * missing or wrong secret.
 */
export function authenticateTelegramWebhook(request: Request): void {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
    throw dependencyError("The Telegram integration is not configured.");
  }

  const provided = request.headers.get(SECRET_HEADER);
  if (
    !provided ||
    !timingSafeStringEqual(provided, env.TELEGRAM_WEBHOOK_SECRET)
  ) {
    throw unauthenticatedError("Invalid Telegram webhook secret.");
  }
}
