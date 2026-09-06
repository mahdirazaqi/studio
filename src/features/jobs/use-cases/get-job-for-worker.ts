import { notFoundError } from "@/server/errors/app-error";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import { findJobById } from "@/features/jobs/repository/job-repository";

/**
 * Worker-facing — no `Actor` (see `claim-next-job.ts`'s doc comment).
 * Deliberately unscoped by Department: Studio's Worker is one shared
 * principal with no per-Worker identity, so there is no narrower boundary to
 * enforce here without pretending a distinction that doesn't exist
 * (docs/integrations/worker-api.md "Worker Job ownership / claim semantics",
 * resolves OD-30). Route-level authentication (`authenticateWorker`) is what
 * gates this — not a per-resource check.
 */
export async function getJobForWorker(jobId: string): Promise<SafeJobDetail> {
  const job = await findJobById(jobId);
  if (!job) throw notFoundError();
  return job;
}
