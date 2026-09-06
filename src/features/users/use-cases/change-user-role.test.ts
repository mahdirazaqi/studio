import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeUser } from "@/features/users/domain/user";

const findUserInScope = vi.fn();
const setUserRoleRepo = vi.fn();

vi.mock("@/features/users/repository/user-repository", () => ({
  findUserInScope: (...args: unknown[]) => findUserInScope(...args),
  setUserRole: (...args: unknown[]) => setUserRoleRepo(...args),
}));

const { changeUserRole } = await import("./change-user-role");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
  role: "ADMIN",
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

describe("changeUserRole", () => {
  it("throws not_found for a target out of scope", async () => {
    findUserInScope.mockResolvedValue(null);
    await expect(
      changeUserRole(actor(), "user-2", "MANAGER"),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("nobody may change their own role, not even ADMIN (structural self-lockout guard)", async () => {
    findUserInScope.mockResolvedValue(target({ id: "actor-1", role: "ADMIN" }));
    await expect(
      changeUserRole(actor(), "actor-1", "USER"),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(setUserRoleRepo).not.toHaveBeenCalled();
  });

  it("a MANAGER cannot change anyone's role (ADMIN-only, conservative default)", async () => {
    findUserInScope.mockResolvedValue(target());
    await expect(
      changeUserRole(actor({ role: "MANAGER" }), "user-2", "MANAGER"),
    ).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("ADMIN can promote a USER to MANAGER", async () => {
    findUserInScope.mockResolvedValue(target());
    const result = await changeUserRole(actor(), "user-2", "MANAGER");
    expect(setUserRoleRepo).toHaveBeenCalledWith("user-2", "MANAGER");
    expect(result.role).toBe("MANAGER");
  });

  it("is idempotent — setting the same role is a no-op write", async () => {
    findUserInScope.mockResolvedValue(target({ role: "MANAGER" }));
    await changeUserRole(actor(), "user-2", "MANAGER");
    expect(setUserRoleRepo).not.toHaveBeenCalled();
  });
});
