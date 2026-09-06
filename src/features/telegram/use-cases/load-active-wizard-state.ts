import { env } from "@/server/env";
import { logger } from "@/server/logger";
import {
  wizardPayloadSchema,
  type WizardPayload,
} from "@/features/telegram/schemas/wizard-payload.schema";
import {
  deleteWizardState,
  findWizardState,
} from "@/features/telegram/repository/telegram-repository";
import type {
  TelegramWizardFlow,
  TelegramWizardStep,
} from "@/features/telegram/domain/wizard";

export interface ActiveWizardState {
  userId: string;
  flow: TelegramWizardFlow;
  step: TelegramWizardStep;
  payload: WizardPayload;
  lastUpdateId: number | null;
}

/**
 * Load a Telegram user's in-progress conversation, or `null` if there isn't
 * one — folding together the two ways "no active conversation" can arise:
 *
 * - **Expired** (Phase 8 brief §15/§17, resolves OD-35): a row untouched for
 *   longer than `TELEGRAM_WIZARD_TTL_MINUTES` is deleted and treated as
 *   absent. There is no separate sweep process (OD-40's durable-work
 *   mechanism doesn't exist yet) — this lazy check on next read is the
 *   entire expiration mechanism, deliberately (§15 "do not build a
 *   sophisticated distributed session system").
 * - **Corrupted** (§17): a payload that fails `wizardPayloadSchema` (e.g. a
 *   manual DB edit, or a future schema change reading an old row) is logged
 *   and the row is cleared rather than crashing the bot or resuming into an
 *   inconsistent state.
 *
 * Both cases return `null` — the composer's job is only to explain "your
 * session expired, please start again" for the first and behave identically
 * (a fresh Idle state) for the second; it never needs to distinguish them.
 */
export async function loadActiveWizardState(
  telegramUserId: string,
): Promise<ActiveWizardState | null> {
  const row = await findWizardState(telegramUserId);
  if (!row) return null;

  const ttlMs = env.TELEGRAM_WIZARD_TTL_MINUTES * 60 * 1000;
  if (Date.now() - row.updatedAt.getTime() > ttlMs) {
    await deleteWizardState(telegramUserId);
    return null;
  }

  const parsed = wizardPayloadSchema.safeParse(row.payload);
  if (!parsed.success) {
    logger.warn("Discarding a Telegram wizard row with an invalid payload", {
      telegramUserId,
      step: row.step,
    });
    await deleteWizardState(telegramUserId);
    return null;
  }

  return {
    userId: row.userId,
    flow: row.flow,
    step: row.step,
    payload: parsed.data,
    lastUpdateId: row.lastUpdateId,
  };
}
