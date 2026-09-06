import { authorize, type Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import type { SafeJobDetail } from "@/features/jobs/domain/job";
import { findJobInScope } from "@/features/jobs/repository/job-repository";

/**
 * Load one Job for the detail view. `findJobInScope` already returns `null`
 * for both "doesn't exist" and "exists in another department"
 * (docs/architecture/authorization.md's 403-vs-404 guidance) — mirrors
 * `features/templates/use-cases/get-template.ts`. No state filter: a Job
 * remains viewable in every state, forever (it is a permanent record).
 */
export async function getJob(
  actor: Actor,
  jobId: string,
): Promise<SafeJobDetail> {
  authorize(actor, "job:manage");
  const job = await findJobInScope(actor, jobId);
  if (!job) throw notFoundError();
  return job;
}
