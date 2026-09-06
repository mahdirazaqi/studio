import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeUser } from "@/features/users/domain/user";

const findUserInScope = vi.fn();
const setUserStatusRepo = vi.fn();

vi.mock("@/features/users/repository/user-repository", () => ({
  findUserInScope: (...args: unknown[]) => findUserInScope(...args),
  setUserStatus: (...args: unknown[]) => setUserStatusRepo(...args),
}));

const { disableUser, enableUser } = await import("./set-user-active-status");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
  role: "MANAGER",
  departmentId: "dept-a",
  ...overrides,
});

const target = (overrides: Partial<SafeUser> = {}): SafeUser => ({
  id: "user-2",
  email: "u2@example.com",
  fullName: "User Two",
  role: "USER",
  status: "ACTIVE",
  departmentId: "dept-a",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setUserActiveStatus", () => {
  it("throws not_found for a target out of scope (cross-department, no existence leak)", async () => {
    findUserInScope.mockResolvedValue(null);
    await expect(disableUser(actor(), "user-2")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("nobody may disable themselves, not even ADMIN", async () => {
    findUserInScope.mockResolvedValue(target({ id: "actor-1", role: "ADMIN" }));
    await expect(
      disableUser(actor({ role: "ADMIN" }), "actor-1"),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(setUserStatusRepo).not.toHaveBeenCalled();
  });

  it("a MANAGER cannot disable a peer MANAGER", async () => {
    findUserInScope.mockResolvedValue(target({ role: "MANAGER" }));
    await expect(disableUser(actor(), "user-2")).rejects.toMatchObject({
      kind: "forbidden",
    });
  });

  it("a MANAGER can disable a USER in their own department", async () => {
    findUserInScope.mockResolvedValue(target({ role: "USER" }));
    const result = await disableUser(actor(), "user-2");
    expect(setUserStatusRepo).toHaveBeenCalledWith("user-2", "DISABLED");
    expect(result.status).toBe("DISABLED");
  });

  it("ADMIN can re-enable anyone but themselves", async () => {
    findUserInScope.mockResolvedValue(
      target({ role: "MANAGER", status: "DISABLED" }),
    );
    await enableUser(actor({ role: "ADMIN" }), "user-2");
    expect(setUserStatusRepo).toHaveBeenCalledWith("user-2", "ACTIVE");
  });

  it("is idempotent — disabling an already-disabled user is a no-op write", async () => {
    findUserInScope.mockResolvedValue(target({ status: "DISABLED" }));
    const result = await disableUser(actor(), "user-2");
    expect(setUserStatusRepo).not.toHaveBeenCalled();
    expect(result.status).toBe("DISABLED");
  });
});
