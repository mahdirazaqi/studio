import { authorize, type Actor } from "@/server/authz";
import {
  businessRuleError,
  conflictError,
  notFoundError,
} from "@/server/errors/app-error";
import {
  CANCELABLE_STATES,
  canCancelFromState,
} from "@/features/jobs/domain/job-state-machine";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import {
  findJobInScope,
  transitionJobRow,
} from "@/features/jobs/repository/job-repository";

/**
 * Cancel a Job (docs/domain/jobs.md "Cancellation"). Allowed only from
 * `QUEUED`/`CLAIMED`/`RENDERING` — matches legacy intent
 * (`$nin: [Rendered, Uploading, Uploaded, Cancel]`), enforced by the state
 * machine rather than a hand-rolled query. Idempotent: canceling an
 * already-canceled Job succeeds without error (Phase 6 brief §21) instead of
 * treating a repeat click as a conflict. Never deletes the Job — cancellation
 * is a state, not a deletion (ADR-0005).
 */
export async function cancelJob(
  actor: Actor,
  jobId: string,
  reason?: string,
): Promise<SafeJobDetail> {
  const job = await findJobInScope(actor, jobId);
  if (!job) throw notFoundError();

  authorize(actor, "job:manage", { departmentId: job.departmentId });

  if (job.state === "CANCELED") return job;
  if (!canCancelFromState(job.state)) {
    throw businessRuleError(`A job in state ${job.state} cannot be canceled.`);
  }

  const updated = await transitionJobRow(jobId, CANCELABLE_STATES, "CANCELED", {
    canceledByUserId: actor.userId,
    canceledAt: new Date(),
    cancelReason: reason,
  });
  if (!updated) {
    throw conflictError(
      "This job's state changed before it could be canceled. Please refresh and try again.",
    );
  }
  return updated;
}
