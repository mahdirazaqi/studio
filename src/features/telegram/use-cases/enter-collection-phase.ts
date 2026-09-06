import type { Prisma } from "@prisma/client";

import { conflictError } from "@/server/errors/app-error";
import { advanceTrackCursor } from "@/features/telegram/domain/wizard";
import { advanceWizardState } from "@/features/telegram/repository/telegram-repository";
import type { TelegramWizardStep } from "@/features/telegram/domain/wizard";
import type { WizardPayload } from "@/features/telegram/schemas/wizard-payload.schema";

export interface EnterCollectionPhaseResult {
  step: "COLLECT_ASSETS" | "CONFIRM";
  payload: WizardPayload;
}

/**
 * Shared by `set-delivery-choice.ts` (Single Track) and `set-track-count.ts`
 * (Album) — the moment either flow first has everything it needs to start
 * collecting per-track asset values. Opens the first track and immediately
 * resolves straight through to `CONFIRM` for a zero-asset Template
 * (ADR-0027 allows one — every track is trivially "complete" the instant
 * it's opened), rather than waiting for an asset value that will never
 * arrive.
 */
export async function enterCollectionPhase(
  telegramUserId: string,
  fromStep: TelegramWizardStep,
  updateId: number,
  payload: WizardPayload,
): Promise<EnterCollectionPhaseResult> {
  const { tracks, allTracksDone } = advanceTrackCursor(
    payload.tracks,
    payload.slots.length,
    payload.trackCount,
  );
  const step: EnterCollectionPhaseResult["step"] = allTracksDone
    ? "CONFIRM"
    : "COLLECT_ASSETS";
  const nextPayload: WizardPayload = { ...payload, tracks };

  const updated = await advanceWizardState(
    telegramUserId,
    [fromStep],
    step,
    nextPayload as unknown as Prisma.InputJsonValue,
    updateId,
  );
  if (!updated) {
    throw conflictError(
      "This step was already completed. Please continue from the current menu.",
    );
  }

  return { step, payload: nextPayload };
}
