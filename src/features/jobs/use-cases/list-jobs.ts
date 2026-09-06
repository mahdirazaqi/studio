import { authorize, type Actor } from "@/server/authz";
import type { SafeJob } from "@/features/jobs/domain/job";
import { listJobs as listJobsRepo } from "@/features/jobs/repository/job-repository";
import type { ListJobsInput } from "@/features/jobs/schemas/list-jobs.schema";
import type { Paginated } from "@/types";

/**
 * The Jobs list — role floor only; the actual department scoping happens
 * inside the repository via `departmentScopeFilter(actor)`, matching
 * `features/templates/use-cases/list-templates.ts`. No status/lifecycle
 * filter beyond what the caller explicitly asks for — a Job never disappears
 * from this list regardless of state (it is a permanent record).
 */
export async function listDepartmentJobs(
  actor: Actor,
  input: ListJobsInput,
): Promise<Paginated<SafeJob>> {
  authorize(actor, "job:manage");
  return listJobsRepo(actor, input);
}
