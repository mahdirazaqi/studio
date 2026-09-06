import {
  enterCollectionPhase,
  type EnterCollectionPhaseResult,
} from "@/features/telegram/use-cases/enter-collection-phase";
import type { WizardPayload } from "@/features/telegram/schemas/wizard-payload.schema";

/**
 * Single Track's "deliver to YouTube?" answer (legacy: only asked when the
 * Template had a `_channel` — Studio has no `YouTubeTarget` model yet
 * (OD-36), so this is asked unconditionally for every Single Track job,
 * wired to the same `deliverToYouTube` field the dashboard's own checkbox
 * sets, "Deliver to YouTube when rendering completes"). Album never asks
 * (legacy behavior, kept) — `pickTemplate` already defaults
 * `deliverToYouTube: false` for both flows, so Album simply never reaches
 * this function.
 */
export async function setDeliveryChoice(
  telegramUserId: string,
  updateId: number,
  currentPayload: WizardPayload,
  deliver: boolean,
): Promise<EnterCollectionPhaseResult> {
  return enterCollectionPhase(telegramUserId, "ASK_DELIVERY", updateId, {
    ...currentPayload,
    deliverToYouTube: deliver,
  });
}
