import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const listWorkerApiKeysRepo = vi.fn();

vi.mock("@/features/worker-keys/repository/worker-api-key-repository", () => ({
  listWorkerApiKeys: () => listWorkerApiKeysRepo(),
}));

const { listWorkerApiKeys } = await import("./list-worker-api-keys");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "admin-1",
  role: "ADMIN",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  listWorkerApiKeysRepo.mockResolvedValue([{ id: "key-1" }]);
});

describe("listWorkerApiKeys", () => {
  it("rejects a non-ADMIN", async () => {
    await expect(
      listWorkerApiKeys(actor({ role: "MANAGER" })),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(listWorkerApiKeysRepo).not.toHaveBeenCalled();
  });

  it("returns every key for ADMIN", async () => {
    await expect(listWorkerApiKeys(actor())).resolves.toEqual([
      { id: "key-1" },
    ]);
  });
});
