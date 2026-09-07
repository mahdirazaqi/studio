import { businessRuleError } from "@/server/errors/app-error";
import type { Actor } from "@/server/authz";
import { departmentExists } from "@/features/departments/repository/department-repository";

/**
 * Mirrors `features/templates/use-cases/resolve-target-department.ts` and its
 * sibling in `files` — each feature keeps its own copy rather than
 * importing another feature's use-case module
 * (docs/architecture/project-structure.md §3).
 */
export async function resolveTargetDepartment(
  actor: Actor,
  requestedDepartmentId: string | undefined,
): Promise<string> {
  if (actor.role !== "ADMIN" || !requestedDepartmentId) {
    return actor.departmentId;
  }
  if (!(await departmentExists(requestedDepartmentId))) {
    throw businessRuleError("The selected department does not exist.");
  }
  return requestedDepartmentId;
}
