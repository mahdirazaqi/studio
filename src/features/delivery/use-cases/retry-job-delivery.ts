import { authorize, type Actor } from "@/server/authz";
import {
  businessRuleError,
  conflictError,
  notFoundError,
} from "@/server/errors/app-error";
import {
  findJobInScope,
  transitionJobRow,
} from "@/features/jobs/repository/job-repository";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import { runYoutubeDelivery } from "@/features/delivery/use-cases/deliver-job-result";

/**
 * Manual "retry delivery only" (docs/integrations/youtube.md "Delivery
 * idempotency", resolves OD-13 for YouTube). **Not** `retryJob` — this never
 * re-renders or recreates a Job (docs/domain/jobs.md "Job Retry vs Delivery
 * Retry"); the already-rendered `videoFileId`/`screenshotFileId` are reused
 * exactly as they were.
 *
 * `ERROR -> DELIVERING` is **not** in `job-state-machine.ts`'s general
 * transition graph (`ERROR` is otherwise terminal, and must stay that way for
 * `isTerminalState`'s other callers — Worker progress/duration updates). This
 * calls `transitionJobRow` directly rather than `transitionJob`, exactly the
 * documented escape hatch for "a new state-changing operation whose
 * legality `transitionJob`'s general pre-check doesn't fit" (CLAUDE.md §11,
 * ADR-0029) — the atomic conditional `UPDATE ... WHERE state = 'ERROR'` is
 * still the only thing that actually enforces this, exactly like every other
 * caller of `Job.state`.
 */
export async function retryJobDelivery(
  actor: Actor,
  jobId: string,
): Promise<SafeJobDetail> {
  const job = await findJobInScope(actor, jobId);
  if (!job) throw notFoundError();

  authorize(actor, "job:manage", { departmentId: job.departmentId });

  if (job.state !== "ERROR") {
    throw businessRuleError(
      "Only a job in the ERROR state can have its delivery retried.",
    );
  }
  if (!job.deliverToYouTube || !job.snapshot.youtubeTarget) {
    throw businessRuleError(
      "This job was not configured to deliver to YouTube.",
    );
  }
  if (!job.videoFileId || !job.screenshotFileId) {
    throw businessRuleError(
      "This job has no rendered video to redeliver — the render itself failed, so retry the job instead.",
    );
  }

  const youtubeAttempts = job.deliveryAttempts.filter(
    (attempt) => attempt.provider === "YOUTUBE",
  );
  if (youtubeAttempts.some((attempt) => attempt.status === "SUCCEEDED")) {
    throw businessRuleError(
      "YouTube delivery for this job already succeeded — nothing to retry.",
    );
  }
  const nextAttemptNumber =
    Math.max(0, ...youtubeAttempts.map((attempt) => attempt.attemptNumber)) + 1;

  const delivering = await transitionJobRow(jobId, ["ERROR"], "DELIVERING", {
    deliveredAt: new Date(),
  });
  if (!delivering) {
    throw conflictError(
      "This job's state changed before the retry could start. Please refresh and try again.",
    );
  }

  return runYoutubeDelivery(delivering, {
    attemptNumber: nextAttemptNumber,
    triggeredByUserId: actor.userId,
  });
}
