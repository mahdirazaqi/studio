import { businessRuleError, notFoundError } from "@/server/errors/app-error";
import { parseInput } from "@/server/validation";
import { isTerminalState } from "@/features/jobs/domain/job-state-machine";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import {
  findJobState,
  setDuration,
} from "@/features/jobs/repository/job-repository";
import {
  updateJobDurationSchema,
  type UpdateJobDurationInput,
} from "@/features/jobs/schemas/update-duration.schema";

/** See `update-job-progress.ts`'s doc comment — same reasoning applies. */
export async function updateJobDuration(
  input: UpdateJobDurationInput,
): Promise<SafeJobDetail> {
  const parsed = parseInput(updateJobDurationSchema, input);

  const current = await findJobState(parsed.jobId);
  if (!current) throw notFoundError();
  if (isTerminalState(current.state)) {
    throw businessRuleError(
      `A job in state ${current.state} can no longer accept duration updates.`,
    );
  }

  const updated = await setDuration(parsed.jobId, parsed.durationSeconds);
  if (!updated) {
    throw businessRuleError(
      "This job reached a terminal state before the duration update could be applied.",
    );
  }
  return updated;
}
