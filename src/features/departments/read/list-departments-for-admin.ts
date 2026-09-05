import { authorize, type Actor } from "@/server/authz";
import {
  listDepartments,
  type DepartmentOption,
} from "@/features/departments/repository/department-repository";

/**
 * The only consumer today: the file-upload form's department picker, shown
 * to ADMIN only (docs/domain/authorization.md — "Upload file: ... Into own
 * department (ADMIN: any)"). Authorizes before querying — see
 * docs/security/security.md §12.
 */
export async function listDepartmentsForAdmin(
  actor: Actor,
): Promise<DepartmentOption[]> {
  authorize(actor, "department:view_all");
  return listDepartments();
}
