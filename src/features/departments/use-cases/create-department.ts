import { authorize, type Actor } from "@/server/authz";
import type { SafeDepartment } from "@/features/departments/domain/department";
import { createDepartment as createDepartmentRepo } from "@/features/departments/repository/department-repository";

/**
 * Create a Department — ADMIN-only (docs/domain/authorization.md "Create /
 * rename department"). No deletion path exists and none is added here
 * (OD-07 stays open, docs/domain/departments.md "Department deletion") —
 * this phase only wires the two operations the matrix already resolved.
 */
export async function createDepartment(
  actor: Actor,
  name: string,
): Promise<SafeDepartment> {
  authorize(actor, "department:manage");
  return createDepartmentRepo(name);
}
