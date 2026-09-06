import { AppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";
import { transitionJob } from "@/features/jobs/use-cases/transition-job";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import { substituteTags } from "@/features/delivery/domain/tag-substitution";
import {
  completeDeliveryAttempt,
  createPendingDeliveryAttempt,
} from "@/features/delivery/repository/delivery-repository";
import { sendJobNotification } from "@/features/delivery/infrastructure/telegram/telegram-delivery-adapter";
import { deliverToYoutube } from "@/features/delivery/infrastructure/youtube/youtube-delivery-adapter";
import { readFileBufferForDelivery } from "@/features/files/use-cases/read-file-buffer-for-delivery";
import { findTelegramUserIdForUser } from "@/features/telegram/repository/telegram-repository";

/**
 * The Delivery Orchestrator (docs/integrations/youtube.md "Delivery",
 * docs/integrations/telegram.md "Notifications", ADR-0039). Called
 * **synchronously, awaited** — never fire-and-forget — right after a Job
 * reaches `RENDERED` (`features/delivery/use-cases/accept-job-result.ts`),
 * and again by `retry-job-delivery.ts` for a manual, YouTube-only retry.
 * This is the one place that decides *which* providers apply to a Job and
 * drives its state through `DELIVERING` to its final `UPLOADED`/`ERROR`
 * (Phase 6's state machine, untouched — every write still goes through
 * `transitionJob`).
 *
 * Telegram is a **best-effort notification**, never a `DeliveryAttempt` and
 * never able to block/fail the Job (legacy behavior, kept — see
 * `telegram-delivery-adapter.ts`). YouTube is a **required delivery** when
 * `job.deliverToYouTube` is true: its failure is durable (a `FAILED`
 * `DeliveryAttempt` row) and moves the Job to `ERROR`, exactly matching
 * legacy's `uploadJobToYoutube` catch block, minus the "swallow silently"
 * part — here it also lands in `Job.errorReason`, visible to the operator.
 */
export async function deliverJobResult(
  job: SafeJobDetail,
): Promise<SafeJobDetail> {
  await notify(job.createdByUserId, `"${job.title}" rendered successfully.`);

  if (!job.deliverToYouTube || !job.snapshot.youtubeTarget) {
    // Legacy: no YouTube upload requested (or nothing configured to upload
    // to) means the Job is simply done — `RENDERED -> UPLOADED` is a real
    // edge in the state machine for exactly this case (docs/domain/jobs.md).
    const uploaded = await transitionJob(job.id, "UPLOADED", {
      deliveredAt: new Date(),
      uploadedAt: new Date(),
    });
    await notify(job.createdByUserId, `"${job.title}" uploaded successfully.`);
    return uploaded;
  }

  const delivering = await transitionJob(job.id, "DELIVERING", {
    deliveredAt: new Date(),
  });

  return runYoutubeDelivery(delivering, {
    attemptNumber: 1,
    triggeredByUserId: null,
  });
}

/**
 * Shared by the automatic post-render attempt above and
 * `retry-job-delivery.ts`'s manual retry — the actual "call YouTube, record
 * the outcome, transition the Job" sequence, parameterized only by which
 * attempt number/actor this is. `job` must already reflect the Job's
 * *current* row (its own `snapshot`/`assets`/`videoFileId`/`screenshotFileId`
 * are all that's needed — a retry re-fetches this fresh rather than reusing a
 * stale reference, docs/domain/jobs.md "Retry Idempotency").
 */
export async function runYoutubeDelivery(
  job: SafeJobDetail,
  attempt: { attemptNumber: number; triggeredByUserId: string | null },
): Promise<SafeJobDetail> {
  const target = job.snapshot.youtubeTarget;
  if (!target || !job.videoFileId || !job.screenshotFileId) {
    // Cannot happen via the normal flow (both are guaranteed by the time a
    // Job reaches DELIVERING) — defensive, not a case any test needs to hit
    // through normal use, but never silently proceeds if it somehow does.
    const errored = await transitionJob(job.id, "ERROR", {
      errorReason:
        "This job has no YouTube channel or rendered video to deliver.",
    });
    await notify(job.createdByUserId, `"${job.title}" failed.`);
    return errored;
  }

  const attemptId = await createPendingDeliveryAttempt({
    jobId: job.id,
    provider: "YOUTUBE",
    attemptNumber: attempt.attemptNumber,
    triggeredByUserId: attempt.triggeredByUserId,
  });

  try {
    const [videoBuffer, screenshotBuffer] = await Promise.all([
      readFileBufferForDelivery(job.videoFileId),
      readFileBufferForDelivery(job.screenshotFileId),
    ]);

    const tags = substituteTags(
      job.snapshot.tags,
      job.assets
        .filter((asset) => asset.kind === "DATA")
        .map((asset) => ({ layer: asset.layer, textValue: asset.textValue })),
    );

    const { videoId } = await deliverToYoutube({
      youtubeTargetId: target.id,
      title: job.title,
      description: job.snapshot.description ?? "",
      tags,
      videoBuffer,
      thumbnailBuffer: screenshotBuffer,
    });

    await completeDeliveryAttempt(attemptId, {
      status: "SUCCEEDED",
      providerRef: videoId,
    });

    const uploaded = await transitionJob(job.id, "UPLOADED", {
      uploadedAt: new Date(),
    });
    await notify(job.createdByUserId, `"${job.title}" uploaded successfully.`);
    return uploaded;
  } catch (error) {
    const reason = safeFailureReason(error);
    logger.error("YouTube delivery failed", { jobId: job.id, cause: error });
    await completeDeliveryAttempt(attemptId, {
      status: "FAILED",
      failureReason: reason,
    });
    const errored = await transitionJob(job.id, "ERROR", {
      errorReason: reason,
    });
    await notify(job.createdByUserId, `"${job.title}" failed.`);
    return errored;
  }
}

/** Never a raw stack trace or provider error body (docs/security/security.md)
 * — `AppError`'s own `message` is already written to be safe/human-readable
 * for every `dependencyError`/`validationError` this can throw. */
function safeFailureReason(error: unknown): string {
  return AppError.isAppError(error)
    ? error.message
    : "The YouTube upload failed unexpectedly.";
}

async function notify(userId: string, text: string): Promise<void> {
  const telegramUserId = await findTelegramUserIdForUser(userId);
  if (!telegramUserId) return;
  await sendJobNotification(telegramUserId, text);
}
