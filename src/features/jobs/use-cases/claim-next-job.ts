import { claimNextJobRow } from "@/features/jobs/repository/job-repository";
import type { SafeJobDetail } from "@/features/jobs/domain/job";

/**
 * Worker-facing (docs/domain/jobs.md "Worker claim"; Phase 6 brief §20). No
 * `Actor` — a Worker is a distinct, non-`User` principal (§38) with no
 * Department; claiming pulls from the single global queue, exactly like
 * legacy's `fetch`, just atomic. Not exposed over REST yet — Phase 7's
 * `POST /api/worker/v1/jobs/next` will call this directly after its own
 * Worker-credential authentication.
 */
export async function claimNextJob(): Promise<SafeJobDetail | null> {
  return claimNextJobRow();
}
