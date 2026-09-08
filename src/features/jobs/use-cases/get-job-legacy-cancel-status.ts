import { findJobState } from "@/features/jobs/repository/job-repository";
import { legacyStateInt } from "@/features/jobs/domain/legacy-state-mapping";

export interface LegacyCancelStatus {
  id: string;
  /** A legacy integer state code — see `legacyStateInt`'s doc comment. */
  state: number;
}

/**
 * Backs the unauthenticated legacy cancel-status poll (ADR-0043) — see
 * `middleware.ts` and `src/app/api/internal/legacy-job-status/[jobId]/
 * route.ts` for the full mechanism and why it exists. Deliberately returns
 * only an id and a coarse numeric state, nothing else — the minimum the
 * real Worker's `CanCancel` actually reads.
 */
export async function getJobLegacyCancelStatus(
  jobId: string,
): Promise<LegacyCancelStatus | null> {
  const job = await findJobState(jobId);
  if (!job) return null;
  return { id: jobId, state: legacyStateInt(job.state) };
}
