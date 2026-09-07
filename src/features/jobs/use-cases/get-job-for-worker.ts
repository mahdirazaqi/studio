import { assertWorkerDepartmentAccess } from "@/server/worker-auth";
import { notFoundError } from "@/server/errors/app-error";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import { findJobById } from "@/features/jobs/repository/job-repository";

/**
 * Worker-facing — no `Actor` (see `claim-next-job.ts`'s doc comment).
 * **Department-scoped (ADR-0040, revises OD-30)**: a Worker may read only a
 * Job belonging to one of its `WorkerApiKey`'s `allowedDepartmentIds`,
 * checked via `assertWorkerDepartmentAccess` (404, never 403 — matches
 * every other cross-department access in this codebase). Route-level
 * authentication (`authenticateWorker`) resolves that scope; this is the
 * per-resource check on top of it.
 */
export async function getJobForWorker(
  jobId: string,
  allowedDepartmentIds: readonly string[],
): Promise<SafeJobDetail> {
  const job = await findJobById(jobId);
  if (!job) throw notFoundError();
  assertWorkerDepartmentAccess(allowedDepartmentIds, job.departmentId);
  return job;
}
