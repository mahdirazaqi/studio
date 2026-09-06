import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const createDepartmentRepo = vi.fn();

vi.mock("@/features/departments/repository/department-repository", () => ({
  createDepartment: (...args: unknown[]) => createDepartmentRepo(...args),
}));

const { createDepartment } = await import("./create-department");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
  role: "ADMIN",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  createDepartmentRepo.mockResolvedValue({ id: "dept-b", name: "Marketing" });
});

describe("createDepartment", () => {
  it("rejects a non-ADMIN", async () => {
    await expect(
      createDepartment(actor({ role: "MANAGER" }), "Marketing"),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(createDepartmentRepo).not.toHaveBeenCalled();
  });

  it("allows ADMIN to create a department", async () => {
    const result = await createDepartment(actor(), "Marketing");
    expect(createDepartmentRepo).toHaveBeenCalledWith("Marketing");
    expect(result.name).toBe("Marketing");
  });
});
