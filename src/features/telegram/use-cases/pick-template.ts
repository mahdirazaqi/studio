import type { Prisma } from "@prisma/client";

import type { Actor } from "@/server/authz";
import { getTemplateForJobForm } from "@/features/jobs/use-cases/get-template-for-job-form";
import { startWizardState } from "@/features/telegram/repository/telegram-repository";
import { advanceTrackCursor } from "@/features/telegram/domain/wizard";
import type {
  TelegramWizardFlow,
  WizardSlot,
} from "@/features/telegram/domain/wizard";
import type { WizardPayload } from "@/features/telegram/schemas/wizard-payload.schema";

export interface PickTemplateResult {
  templateName: string;
  /** `ASK_TRACK_COUNT` for Album; `COLLECT_ASSETS`/`CONFIRM` for Single
   * Track, which — since it has exactly one track and no longer asks a
   * delivery question (ADR-0041) — opens straight into asset collection. */
  step: "ASK_TRACK_COUNT" | "COLLECT_ASSETS" | "CONFIRM";
  payload: WizardPayload;
}

/**
 * A Template picker button was tapped (Phase 8 brief §18/§19). Reuses
 * `getTemplateForJobForm` **verbatim** — the exact same use case the
 * dashboard's create-Job form calls when a Template is selected there, so
 * "only `ACTIVE`, not soft-deleted, in the actor's own Department (or any
 * Department for ADMIN)" is enforced once, not reimplemented here. This is
 * also the callback-tampering defense Phase 8 brief §19 asks for: a stale or
 * hand-crafted `templateId` in the callback data is re-validated
 * server-side, department-scoped, on every tap — never trusted just because
 * Studio generated the button.
 *
 * Starts a **fresh** wizard row, replacing any prior in-progress
 * conversation for this Telegram user (matches legacy: picking a template is
 * always a deliberate restart).
 *
 * **Revised, ADR-0041**: Single Track no longer asks "deliver to YouTube?"
 * (Studio has no YouTube delivery at all) — with `trackCount` fixed at 1, it
 * opens the first track immediately, using the same cursor logic
 * `enterCollectionPhase` uses for every subsequent step.
 */
export async function pickTemplate(
  actor: Actor,
  telegramUserId: string,
  updateId: number,
  flow: TelegramWizardFlow,
  templateId: string,
): Promise<PickTemplateResult> {
  const template = await getTemplateForJobForm(actor, templateId);

  const slots: WizardSlot[] = template.assets.map((asset) => ({
    key: asset.key,
    kind: asset.kind,
  }));

  const basePayload: WizardPayload = {
    templateId: template.id,
    templateName: template.name,
    trackCount: 1,
    slots,
    tracks: [],
  };

  if (flow === "ALBUM") {
    await startWizardState({
      telegramUserId,
      userId: actor.userId,
      flow,
      step: "ASK_TRACK_COUNT",
      payload: basePayload as unknown as Prisma.InputJsonValue,
      lastUpdateId: updateId,
    });
    return {
      templateName: template.name,
      step: "ASK_TRACK_COUNT",
      payload: basePayload,
    };
  }

  const { tracks, allTracksDone } = advanceTrackCursor(
    basePayload.tracks,
    basePayload.slots.length,
    basePayload.trackCount,
  );
  const step = allTracksDone ? "CONFIRM" : "COLLECT_ASSETS";
  const payload: WizardPayload = { ...basePayload, tracks };

  await startWizardState({
    telegramUserId,
    userId: actor.userId,
    flow,
    step,
    payload: payload as unknown as Prisma.InputJsonValue,
    lastUpdateId: updateId,
  });

  return { templateName: template.name, step, payload };
}
