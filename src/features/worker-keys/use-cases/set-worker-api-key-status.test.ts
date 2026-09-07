import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const findWorkerApiKeyById = vi.fn();
const setWorkerApiKeyStatus = vi.fn();

vi.mock("@/features/worker-keys/repository/worker-api-key-repository", () => ({
  findWorkerApiKeyById: (...args: unknown[]) => findWorkerApiKeyById(...args),
  setWorkerApiKeyStatus: (...args: unknown[]) => setWorkerApiKeyStatus(...args),
}));

const { revokeWorkerApiKey, reactivateWorkerApiKey } =
  await import("./set-worker-api-key-status");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "admin-1",
  role: "ADMIN",
  departmentId: "dept-a",
  ...overrides,
});

const key = (overrides: Record<string, unknown> = {}) => ({
  id: "key-1",
  name: "Worker A",
  status: "ACTIVE",
  departmentIds: ["dept-a"],
  createdByUserId: "admin-1",
  createdByName: "Admin",
  lastUsedAt: null,
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("revokeWorkerApiKey / reactivateWorkerApiKey", () => {
  it("rejects a non-ADMIN", async () => {
    findWorkerApiKeyById.mockResolvedValue(key());
    await expect(
      revokeWorkerApiKey(actor({ role: "MANAGER" }), "key-1"),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(setWorkerApiKeyStatus).not.toHaveBeenCalled();
  });

  it("throws not_found for a nonexistent key", async () => {
    findWorkerApiKeyById.mockResolvedValue(null);
    await expect(revokeWorkerApiKey(actor(), "missing")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("revokes an active key", async () => {
    findWorkerApiKeyById.mockResolvedValue(key({ status: "ACTIVE" }));
    const result = await revokeWorkerApiKey(actor(), "key-1");
    expect(setWorkerApiKeyStatus).toHaveBeenCalledWith("key-1", "REVOKED");
    expect(result.status).toBe("REVOKED");
  });

  it("is idempotent — revoking an already-revoked key is a no-op write", async () => {
    findWorkerApiKeyById.mockResolvedValue(key({ status: "REVOKED" }));
    const result = await revokeWorkerApiKey(actor(), "key-1");
    expect(setWorkerApiKeyStatus).not.toHaveBeenCalled();
    expect(result.status).toBe("REVOKED");
  });

  it("reactivates a revoked key", async () => {
    findWorkerApiKeyById.mockResolvedValue(key({ status: "REVOKED" }));
    const result = await reactivateWorkerApiKey(actor(), "key-1");
    expect(setWorkerApiKeyStatus).toHaveBeenCalledWith("key-1", "ACTIVE");
    expect(result.status).toBe("ACTIVE");
  });
});
