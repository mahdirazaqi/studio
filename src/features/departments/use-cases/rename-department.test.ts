import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const findDepartmentById = vi.fn();
const renameDepartmentRepo = vi.fn();

vi.mock("@/features/departments/repository/department-repository", () => ({
  findDepartmentById: (...args: unknown[]) => findDepartmentById(...args),
  renameDepartment: (...args: unknown[]) => renameDepartmentRepo(...args),
}));

const { renameDepartment } = await import("./rename-department");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
  role: "ADMIN",
  departmentId: "dept-a",
  ...overrides,
});

const department = (overrides = {}) => ({
  id: "dept-a",
  name: "Old Name",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("renameDepartment", () => {
  it("rejects a non-ADMIN", async () => {
    await expect(
      renameDepartment(actor({ role: "MANAGER" }), "dept-a", "New Name"),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(findDepartmentById).not.toHaveBeenCalled();
  });

  it("throws not_found for an unknown department", async () => {
    findDepartmentById.mockResolvedValue(null);
    await expect(
      renameDepartment(actor(), "dept-x", "New Name"),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("renames an existing department", async () => {
    findDepartmentById.mockResolvedValue(department());
    renameDepartmentRepo.mockResolvedValue(department({ name: "New Name" }));
    const result = await renameDepartment(actor(), "dept-a", "New Name");
    expect(renameDepartmentRepo).toHaveBeenCalledWith("dept-a", "New Name");
    expect(result.name).toBe("New Name");
  });

  it("is idempotent — renaming to the same name is a no-op write", async () => {
    findDepartmentById.mockResolvedValue(department({ name: "Same" }));
    await renameDepartment(actor(), "dept-a", "Same");
    expect(renameDepartmentRepo).not.toHaveBeenCalled();
  });
});
