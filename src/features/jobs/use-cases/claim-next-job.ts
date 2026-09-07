import { claimNextJobRow } from "@/features/jobs/repository/job-repository";
import type { SafeJobDetail } from "@/features/jobs/domain/job";

/**
 * Worker-facing (docs/domain/jobs.md "Worker claim"; Phase 6 brief §20;
 * Department scoping ADR-0040). No `Actor` — a Worker is a distinct,
 * non-`User` principal (§38); claiming pulls from the global queue,
 * restricted to `allowedDepartmentIds` (resolved once, at Worker
 * authentication, from its `WorkerApiKey` — never client-supplied), exactly
 * like legacy's `fetch`, just atomic and now department-scoped.
 */
export async function claimNextJob(
  allowedDepartmentIds: readonly string[],
): Promise<SafeJobDetail | null> {
  return claimNextJobRow(allowedDepartmentIds);
}
