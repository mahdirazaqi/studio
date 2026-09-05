import { businessRuleError } from "@/server/errors/app-error";
import type { Actor } from "@/server/authz";
import { departmentExists } from "@/features/departments/repository/department-repository";

/**
 * Mirrors `features/files/use-cases/upload-file.ts`'s helper of the same
 * shape: only ADMIN may target a department other than their own
 * (docs/domain/authorization.md — "Create template: ... ADMIN ✅"), and only
 * when it actually exists. USER/MANAGER's `departmentId` is always their own,
 * regardless of what a request body claims (CLAUDE.md §8 — "never trust a
 * client-supplied departmentId").
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
