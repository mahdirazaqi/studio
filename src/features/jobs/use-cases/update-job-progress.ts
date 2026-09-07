import { assertWorkerDepartmentAccess } from "@/server/worker-auth";
import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import { parseInput } from "@/server/validation";
import { isTerminalState } from "@/features/jobs/domain/job-state-machine";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import {
  findJobState,
  setProgress,
} from "@/features/jobs/repository/job-repository";
import {
  updateJobProgressSchema,
  type UpdateJobProgressInput,
} from "@/features/jobs/schemas/update-progress.schema";

/**
 * Worker-facing — no `Actor` (see `claim-next-job.ts`'s doc comment for why).
 * Validates its own input (`0..100`) rather than trusting a caller to have
 * done so already — this *is* the server-side boundary until Phase 7 puts a
 * Route Handler in front of it, at which point that handler validates again
 * via the same schema (redundant, not wasted: docs/architecture/rest-architecture.md
 * expects Route Handlers to validate their own input too).
 *
 * **Department-scoped (ADR-0040)** — see `transition-job-for-worker.ts`'s
 * doc comment for why a plain pre-check is race-free here.
 */
export async function updateJobProgress(
  input: UpdateJobProgressInput,
  allowedDepartmentIds: readonly string[],
): Promise<SafeJobDetail> {
  const parsed = parseInput(updateJobProgressSchema, input);

  const current = await findJobState(parsed.jobId);
  if (!current) throw notFoundError();
  assertWorkerDepartmentAccess(allowedDepartmentIds, current.departmentId);
  if (isTerminalState(current.state)) {
    throw businessRuleError(
      `A job in state ${current.state} can no longer accept progress updates.`,
    );
  }

  const updated = await setProgress(parsed.jobId, parsed.progress);
  if (!updated) {
    throw businessRuleError(
      "This job reached a terminal state before the progress update could be applied.",
    );
  }
  return updated;
}
