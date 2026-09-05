import "server-only";

import { db } from "@/server/db";

/**
 * Departments has no management feature yet (Phase 3 left it at a placeholder
 * page) — these two reads exist only because ADMIN's "upload into any
 * department" capability (docs/domain/authorization.md) needs somewhere to
 * pick a department from and something to validate the choice against. This
 * is not the Departments CRUD surface; that's a later phase.
 */

export interface DepartmentOption {
  id: string;
  name: string;
}

export async function listDepartments(): Promise<DepartmentOption[]> {
  return db.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function departmentExists(departmentId: string): Promise<boolean> {
  const department = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  return department !== null;
}
