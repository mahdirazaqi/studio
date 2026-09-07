import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { conflictError } from "@/server/errors/app-error";
import type { SafeDepartment } from "@/features/departments/domain/department";

/**
 * The only module that queries the `Department` table.
 *
 * `listDepartments`/`departmentExists` predate real Department management
 * (Phase 3/4/5/9) — they exist only because ADMIN's "target any department"
 * capability needs somewhere to pick a department from and something to
 * validate the choice against; kept as-is (a name/id pair, not the full
 * `SafeDepartment` shape) since that's all those pickers ever needed.
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

/** Bulk existence check — used wherever a client submits a *set* of
 * Department ids to validate at once (Worker API Key scoping, ADR-0040)
 * rather than one at a time. `true` only if every id in `departmentIds`
 * resolves to a real row — a single bogus id fails the whole check, never
 * silently drops it. */
export async function departmentsExist(
  departmentIds: readonly string[],
): Promise<boolean> {
  if (departmentIds.length === 0) return false;
  const count = await db.department.count({
    where: { id: { in: [...departmentIds] } },
  });
  return count === new Set(departmentIds).size;
}

const SAFE_DEPARTMENT_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DepartmentSelect;

type SafeDepartmentRow = Prisma.DepartmentGetPayload<{
  select: typeof SAFE_DEPARTMENT_SELECT;
}>;

function toSafeDepartment(row: SafeDepartmentRow): SafeDepartment {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Implemented, Phase 10 — the real Departments management surface
 * (docs/domain/departments.md). Every Department (ADMIN's management view). */
export async function listAllDepartments(): Promise<SafeDepartment[]> {
  const rows = await db.department.findMany({
    select: SAFE_DEPARTMENT_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toSafeDepartment);
}

export async function findDepartmentById(
  departmentId: string,
): Promise<SafeDepartment | null> {
  const row = await db.department.findUnique({
    where: { id: departmentId },
    select: SAFE_DEPARTMENT_SELECT,
  });
  return row ? toSafeDepartment(row) : null;
}

const DUPLICATE_NAME_MESSAGE = (name: string) =>
  `A department named "${name}" already exists.`;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createDepartment(name: string): Promise<SafeDepartment> {
  try {
    const row = await db.department.create({
      data: { name },
      select: SAFE_DEPARTMENT_SELECT,
    });
    return toSafeDepartment(row);
  } catch (error) {
    if (isUniqueConstraintError(error))
      throw conflictError(DUPLICATE_NAME_MESSAGE(name));
    throw error;
  }
}

export async function renameDepartment(
  departmentId: string,
  name: string,
): Promise<SafeDepartment> {
  try {
    const row = await db.department.update({
      where: { id: departmentId },
      data: { name },
      select: SAFE_DEPARTMENT_SELECT,
    });
    return toSafeDepartment(row);
  } catch (error) {
    if (isUniqueConstraintError(error))
      throw conflictError(DUPLICATE_NAME_MESSAGE(name));
    throw error;
  }
}
