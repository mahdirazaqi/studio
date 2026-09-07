import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const findWorkerApiKeyById = vi.fn();
const setWorkerApiKeyDepartments = vi.fn();
const departmentsExist = vi.fn();

vi.mock("@/features/worker-keys/repository/worker-api-key-repository", () => ({
  findWorkerApiKeyById: (...args: unknown[]) => findWorkerApiKeyById(...args),
  setWorkerApiKeyDepartments: (...args: unknown[]) =>
    setWorkerApiKeyDepartments(...args),
}));
vi.mock("@/features/departments/repository/department-repository", () => ({
  departmentsExist: (...args: unknown[]) => departmentsExist(...args),
}));

const { updateWorkerApiKeyDepartments } =
  await import("./update-worker-api-key-departments");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "admin-1",
  role: "ADMIN",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  departmentsExist.mockResolvedValue(true);
  findWorkerApiKeyById.mockResolvedValue({
    id: "key-1",
    departmentIds: ["dept-a"],
  });
  setWorkerApiKeyDepartments.mockResolvedValue({
    id: "key-1",
    departmentIds: ["dept-a", "dept-b"],
  });
});

describe("updateWorkerApiKeyDepartments", () => {
  it("rejects a non-ADMIN", async () => {
    await expect(
      updateWorkerApiKeyDepartments(actor({ role: "MANAGER" }), "key-1", [
        "dept-a",
      ]),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(setWorkerApiKeyDepartments).not.toHaveBeenCalled();
  });

  it("throws not_found for a nonexistent key", async () => {
    findWorkerApiKeyById.mockResolvedValue(null);
    await expect(
      updateWorkerApiKeyDepartments(actor(), "missing", ["dept-a"]),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("rejects a departmentIds set containing a nonexistent department", async () => {
    departmentsExist.mockResolvedValue(false);
    await expect(
      updateWorkerApiKeyDepartments(actor(), "key-1", ["dept-bogus"]),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(setWorkerApiKeyDepartments).not.toHaveBeenCalled();
  });

  it("replaces the department set wholesale", async () => {
    const result = await updateWorkerApiKeyDepartments(actor(), "key-1", [
      "dept-a",
      "dept-b",
    ]);
    expect(setWorkerApiKeyDepartments).toHaveBeenCalledWith("key-1", [
      "dept-a",
      "dept-b",
    ]);
    expect(result.departmentIds).toEqual(["dept-a", "dept-b"]);
  });
});
