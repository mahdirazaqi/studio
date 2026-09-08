import { assertWorkerDepartmentAccess } from "@/server/worker-auth";
import { notFoundError, validationError } from "@/server/errors/app-error";
import { mapWorkerState } from "@/features/jobs/domain/legacy-state-mapping";
import { transitionJob } from "@/features/jobs/use-cases/transition-job";
import {
  findJobById,
  findJobState,
} from "@/features/jobs/repository/job-repository";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import type { WorkerTransitionInput } from "@/features/jobs/schemas/worker-transition.schema";

/**
 * The Worker-facing adapter over `transitionJob` (Phase 6) — maps the
 * Worker's legacy-int-or-name `state` value and requires `errorReason` when
 * (and only when) the target is `ERROR`. This is input *mapping*, not a
 * reimplementation of any state-machine rule: the actual transition
 * legality is still decided entirely by `transitionJob`/`isValidTransition`
 * (Phase 6 brief §4 — never duplicate that here).
 *
 * **Department-scoped (ADR-0040)**: `Job.departmentId` is immutable once
 * created (copied from the Template at Job-creation time, never re-derived
 * — see `docs/domain/templates.md` "Department transfer"), so a plain
 * pre-check against `allowedDepartmentIds` is race-free here — unlike the
 * claim query, there is no "which Job" selection for a concurrent Template
 * transfer to race against.
 */
export async function transitionJobForWorker(
  jobId: string,
  input: WorkerTransitionInput,
  allowedDepartmentIds: readonly string[],
): Promise<SafeJobDetail> {
  const current = await findJobState(jobId);
  if (!current) throw notFoundError();
  assertWorkerDepartmentAccess(allowedDepartmentIds, current.departmentId);

  const targetState = mapWorkerState(input.state);
  if (!targetState) {
    throw validationError(
      `Unknown state "${input.state}". Use a Studio state name (e.g. "RENDERING") or a legacy integer (0-9).`,
      { fieldErrors: { state: ["Unrecognized state value."] } },
    );
  }

  if (targetState === "ERROR" && !input.errorReason) {
    throw validationError("An errorReason is required when reporting ERROR.", {
      fieldErrors: { errorReason: ["Required when state is ERROR."] },
    });
  }

  // Idempotent no-op — revised, ADR-0043. The actual Worker
  // (`navaak-ae-renderer/renderer/renderer.go`'s `next()`) reports THREE
  // distinct legacy per-stage codes in sequence while a Job is actively
  // rendering — Downloading(2), Started(3), InProgress(4) — and
  // `mapWorkerState` maps all three onto the same Studio `RENDERING`
  // bucket (`legacy-state-mapping.ts`). Only the first of the three is a
  // real `CLAIMED -> RENDERING` transition; the other two are same-state
  // reports. `isValidTransition`/`transitionJob`'s state machine
  // deliberately forbids a self-loop for every *other* caller (tested,
  // `job-state-machine.test.ts`) — that invariant is untouched. This is the
  // one Worker-facing boundary that treats "already in the reported state"
  // as success rather than a `business_rule` error, matching the existing
  // idempotent-no-op convention used elsewhere (Template enable/disable,
  // Template transfer, `acceptJobResult`'s duplicate-result handling).
  if (targetState === current.state) {
    const job = await findJobById(jobId);
    if (!job) throw notFoundError();
    return job;
  }

  return transitionJob(
    jobId,
    targetState,
    targetState === "ERROR" ? { errorReason: input.errorReason } : {},
  );
}
