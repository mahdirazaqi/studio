import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const listAllDepartments = vi.fn();
const findDepartmentById = vi.fn();

vi.mock("@/features/departments/repository/department-repository", () => ({
  listAllDepartments: (...args: unknown[]) => listAllDepartments(...args),
  findDepartmentById: (...args: unknown[]) => findDepartmentById(...args),
}));

const { listDepartmentsForManagement } =
  await import("./list-departments-for-management");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDepartmentsForManagement", () => {
  it("returns every department for ADMIN", async () => {
    listAllDepartments.mockResolvedValue([
      { id: "dept-a", name: "A" },
      { id: "dept-b", name: "B" },
    ]);
    const result = await listDepartmentsForManagement(actor({ role: "ADMIN" }));
    expect(result).toHaveLength(2);
    expect(findDepartmentById).not.toHaveBeenCalled();
  });

  it("returns only the actor's own department for USER/MANAGER", async () => {
    findDepartmentById.mockResolvedValue({ id: "dept-a", name: "A" });
    const result = await listDepartmentsForManagement(actor());
    expect(result).toEqual([{ id: "dept-a", name: "A" }]);
    expect(findDepartmentById).toHaveBeenCalledWith("dept-a");
    expect(listAllDepartments).not.toHaveBeenCalled();
  });
});
