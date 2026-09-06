import { authorize, type Actor } from "@/server/authz";
import type { SafeDepartment } from "@/features/departments/domain/department";
import {
  findDepartmentById,
  listAllDepartments,
} from "@/features/departments/repository/department-repository";

/**
 * The Departments management view (docs/domain/authorization.md — "View own
 * department" ✅ for every role, "List all departments" ADMIN-only).
 *
 * - ADMIN sees every Department.
 * - USER/MANAGER see only their own — not gated by a capability check (there
 *   is nothing to authorize beyond "is this my own department", which
 *   `actor.departmentId` already answers) — matches
 *   `docs/domain/departments.md` "Enforcement pattern" for a read.
 */
export async function listDepartmentsForManagement(
  actor: Actor,
): Promise<SafeDepartment[]> {
  if (actor.role === "ADMIN") {
    authorize(actor, "department:view_all");
    return listAllDepartments();
  }
  const own = await findDepartmentById(actor.departmentId);
  return own ? [own] : [];
}
