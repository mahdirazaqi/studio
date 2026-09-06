import {
  businessRuleError,
  conflictError,
  notFoundError,
} from "@/server/errors/app-error";
import { isValidTransition } from "@/features/jobs/domain/job-state-machine";
import type { JobState, SafeJobDetail } from "@/features/jobs/domain/job";
import {
  findJobState,
  transitionJobRow,
  type TransitionExtraData,
} from "@/features/jobs/repository/job-repository";

/**
 * The one reusable primitive that actually changes `Job.state`
 * (docs/domain/jobs.md "State machine"; Phase 6 brief §47). No `Actor`
 * parameter — this is a system/Worker-level operation (§38: the Worker is
 * never a `User`); `cancelJob` and every future Worker Route Handler (Phase
 * 7) call this *after* doing their own, separate authorization/authentication
 * check, never around it.
 *
 * Two layers of protection, deliberately redundant: the pre-check below gives
 * a specific, friendly error for the common case (someone reads the job,
 * decides on a transition, then calls this) — but the actual correctness
 * guarantee is `transitionJobRow`'s atomic conditional `UPDATE`, which is
 * what makes this safe even when another caller changes the job's state in
 * the gap between the pre-check and the write (docs/domain/jobs.md §45
 * "Cancel vs Worker").
 */
export async function transitionJob(
  jobId: string,
  targetState: JobState,
  extra: TransitionExtraData = {},
): Promise<SafeJobDetail> {
  const current = await findJobState(jobId);
  if (!current) throw notFoundError();

  if (!isValidTransition(current.state, targetState)) {
    throw businessRuleError(
      `A job in state ${current.state} cannot transition to ${targetState}.`,
    );
  }

  const updated = await transitionJobRow(
    jobId,
    [current.state],
    targetState,
    extra,
  );
  if (!updated) {
    throw conflictError(
      "This job's state changed before the update could be applied. Please retry.",
    );
  }
  return updated;
}
