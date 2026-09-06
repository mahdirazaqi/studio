import { authorize, type Actor } from "@/server/authz";
import { notFoundError } from "@/server/errors/app-error";
import type { SafeDepartment } from "@/features/departments/domain/department";
import {
  findDepartmentById,
  renameDepartment as renameDepartmentRepo,
} from "@/features/departments/repository/department-repository";

/** Rename a Department — ADMIN-only, same capability as creation. */
export async function renameDepartment(
  actor: Actor,
  departmentId: string,
  name: string,
): Promise<SafeDepartment> {
  authorize(actor, "department:manage");

  const existing = await findDepartmentById(departmentId);
  if (!existing) throw notFoundError();

  if (existing.name === name) return existing;
  return renameDepartmentRepo(departmentId, name);
}
