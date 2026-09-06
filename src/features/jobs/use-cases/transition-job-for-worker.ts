import { validationError } from "@/server/errors/app-error";
import { mapWorkerState } from "@/features/jobs/domain/legacy-state-mapping";
import { transitionJob } from "@/features/jobs/use-cases/transition-job";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import type { WorkerTransitionInput } from "@/features/jobs/schemas/worker-transition.schema";

/**
 * The Worker-facing adapter over `transitionJob` (Phase 6) — maps the
 * Worker's legacy-int-or-name `state` value and requires `errorReason` when
 * (and only when) the target is `ERROR`. This is input *mapping*, not a
 * reimplementation of any state-machine rule: the actual transition
 * legality is still decided entirely by `transitionJob`/`isValidTransition`
 * (Phase 6 brief §4 — never duplicate that here).
 */
export async function transitionJobForWorker(
  jobId: string,
  input: WorkerTransitionInput,
): Promise<SafeJobDetail> {
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

  return transitionJob(
    jobId,
    targetState,
    targetState === "ERROR" ? { errorReason: input.errorReason } : {},
  );
}
