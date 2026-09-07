import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const generateWorkerApiKeySecret = vi.fn();
const hashWorkerApiKeySecret = vi.fn();
const createWorkerApiKeyRepo = vi.fn();
const departmentsExist = vi.fn();

vi.mock("@/server/worker-auth", () => ({
  generateWorkerApiKeySecret: () => generateWorkerApiKeySecret(),
  hashWorkerApiKeySecret: (...args: unknown[]) =>
    hashWorkerApiKeySecret(...args),
}));
vi.mock("@/features/worker-keys/repository/worker-api-key-repository", () => ({
  createWorkerApiKey: (...args: unknown[]) => createWorkerApiKeyRepo(...args),
}));
vi.mock("@/features/departments/repository/department-repository", () => ({
  departmentsExist: (...args: unknown[]) => departmentsExist(...args),
}));

const { createWorkerApiKey } = await import("./create-worker-api-key");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "admin-1",
  role: "ADMIN",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  departmentsExist.mockResolvedValue(true);
  generateWorkerApiKeySecret.mockReturnValue("raw-secret");
  hashWorkerApiKeySecret.mockReturnValue("hashed-secret");
  createWorkerApiKeyRepo.mockResolvedValue({
    id: "key-1",
    name: "Worker A",
    status: "ACTIVE",
    departmentIds: ["dept-a"],
    createdByUserId: "admin-1",
    createdByName: "Admin",
    lastUsedAt: null,
    createdAt: new Date(),
  });
});

describe("createWorkerApiKey", () => {
  it("rejects a non-ADMIN (worker_key:manage is ADMIN-only)", async () => {
    await expect(
      createWorkerApiKey(actor({ role: "MANAGER" }), {
        name: "Worker A",
        departmentIds: ["dept-a"],
      }),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(createWorkerApiKeyRepo).not.toHaveBeenCalled();
  });

  it("rejects a departmentIds set containing a nonexistent department", async () => {
    departmentsExist.mockResolvedValue(false);
    await expect(
      createWorkerApiKey(actor(), {
        name: "Worker A",
        departmentIds: ["dept-bogus"],
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(createWorkerApiKeyRepo).not.toHaveBeenCalled();
  });

  it("generates a fresh secret, stores only its hash, and returns the raw secret exactly once", async () => {
    const result = await createWorkerApiKey(actor(), {
      name: "Worker A",
      departmentIds: ["dept-a"],
    });

    expect(hashWorkerApiKeySecret).toHaveBeenCalledWith("raw-secret");
    expect(createWorkerApiKeyRepo).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Worker A",
        keyHash: "hashed-secret",
        departmentIds: ["dept-a"],
        createdByUserId: "admin-1",
      }),
    );
    expect(result.secret).toBe("raw-secret");
    expect(result.key.id).toBe("key-1");
  });
});
