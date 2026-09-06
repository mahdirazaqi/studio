import type { Prisma } from "@prisma/client";

import type { Actor } from "@/server/authz";
import { AppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { createJob } from "@/features/jobs/use-cases/create-job";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import {
  advanceWizardState,
  deleteWizardState,
} from "@/features/telegram/repository/telegram-repository";
import type { WizardPayload } from "@/features/telegram/schemas/wizard-payload.schema";

export type ConfirmWizardResult =
  | { outcome: "cancelled" }
  | { outcome: "already_processing" }
  | {
      outcome: "completed";
      createdJobs: SafeJobDetail[];
      totalRequested: number;
      failureMessage: string | null;
    };

/**
 * The final confirmation tap (Phase 8 brief §50–52). Two independent
 * concerns, both required by the brief:
 *
 * 1. **Duplicate-confirmation protection** (§51/§52): the `CONFIRM` →
 *    `CREATING` step change is one atomic conditional update
 *    (`advanceWizardState`, the same primitive `job-repository.ts`'s
 *    `transitionJobRow` uses for `Job.state`, ADR-0029/ADR-0037). Only the
 *    caller that wins this race actually calls `createJob`; a second,
 *    near-simultaneous tap (a genuine double-click or a duplicate Telegram
 *    webhook delivery) finds the row no longer in `CONFIRM` and returns
 *    `"already_processing"` — it never creates a second batch of Jobs.
 * 2. **Partial-failure reporting** (§26): Jobs are created **sequentially**,
 *    each through the unmodified `createJob` use case (Phase 6) — same
 *    validation, same historical snapshot, same upload-quota enforcement as
 *    the dashboard. On the first failure the loop stops (matches legacy's
 *    actual behavior — an unhandled exception mid-loop aborted every
 *    remaining `addJob` call) and the result names exactly how many
 *    succeeded before it, never claiming full success when it wasn't.
 *
 * The wizard row is deleted once this resolves, win or partial-fail — there
 * is no partial-resume design (Phase 8 brief §26 "do not implement a huge
 * distributed transaction system"); a failure past this point means
 * starting the conversation over from the menu.
 */
export async function confirmWizard(
  actor: Actor,
  telegramUserId: string,
  updateId: number,
  payload: WizardPayload,
  confirmed: boolean,
): Promise<ConfirmWizardResult> {
  if (!confirmed) {
    await deleteWizardState(telegramUserId);
    return { outcome: "cancelled" };
  }

  const claimed = await advanceWizardState(
    telegramUserId,
    ["CONFIRM"],
    "CREATING",
    payload as unknown as Prisma.InputJsonValue,
    updateId,
  );
  if (!claimed) return { outcome: "already_processing" };

  const createdJobs: SafeJobDetail[] = [];
  let failureMessage: string | null = null;

  for (const assets of payload.tracks) {
    try {
      const job = await createJob(actor, {
        templateId: payload.templateId,
        deliverToYouTube: payload.deliverToYouTube,
        assets,
      });
      createdJobs.push(job);
    } catch (error) {
      failureMessage = AppError.isAppError(error)
        ? error.message
        : "An unexpected error occurred.";
      logger.error("Telegram-initiated job creation failed mid-batch", {
        telegramUserId,
        createdSoFar: createdJobs.length,
        totalRequested: payload.tracks.length,
        cause: error,
      });
      break;
    }
  }

  await deleteWizardState(telegramUserId);

  return {
    outcome: "completed",
    createdJobs,
    totalRequested: payload.tracks.length,
    failureMessage,
  };
}
