import { validationError } from "@/server/errors/app-error";
import { MAX_ALBUM_TRACKS } from "@/features/telegram/domain/wizard";
import {
  enterCollectionPhase,
  type EnterCollectionPhaseResult,
} from "@/features/telegram/use-cases/enter-collection-phase";
import type { WizardPayload } from "@/features/telegram/schemas/wizard-payload.schema";

/**
 * Album's "how many tracks?" answer (legacy: `Track Count`, a synthesized
 * first asset in the untyped `assets` array). Studio validates it as a real
 * integer within a sane bound (`MAX_ALBUM_TRACKS`) rather than legacy's
 * `parseInt` with no bound at all.
 */
export async function setTrackCount(
  telegramUserId: string,
  updateId: number,
  currentPayload: WizardPayload,
  rawText: string,
): Promise<EnterCollectionPhaseResult> {
  const trackCount = Number.parseInt(rawText.trim(), 10);
  if (
    !Number.isInteger(trackCount) ||
    trackCount < 1 ||
    trackCount > MAX_ALBUM_TRACKS
  ) {
    throw validationError(
      `Please send a number between 1 and ${MAX_ALBUM_TRACKS}.`,
    );
  }

  return enterCollectionPhase(telegramUserId, "ASK_TRACK_COUNT", updateId, {
    ...currentPayload,
    trackCount,
  });
}
