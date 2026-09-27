import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeUser } from "@/features/users/domain/user";
import type { UpdateUserProfileInput } from "@/features/users/schemas/update-user-profile.schema";

const findUserInScope = vi.fn();
const updateUserProfileRepo = vi.fn();

vi.mock("@/features/users/repository/user-repository", () => ({
  findUserInScope: (...args: unknown[]) => findUserInScope(...args),
  updateUserProfile: (...args: unknown[]) => updateUserProfileRepo(...args),
}));

const { updateUserProfile } = await import("./update-user-profile");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
  role: "USER",
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
  phone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const input = (
  overrides: Partial<UpdateUserProfileInput> = {},
): UpdateUserProfileInput => ({
  fullName: "New Name",
  phone: "",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  updateUserProfileRepo.mockImplementation(async (userId: string, data) => ({
    ...target({ id: userId }),
    ...data,
  }));
});

describe("updateUserProfile", () => {
  describe("self-edit", () => {
    it("a plain USER can update their own name/phone — no authorize() call, no department/role check", async () => {
      const me = actor({ role: "USER", userId: "actor-1" });
      const result = await updateUserProfile(
        me,
        "actor-1",
        input({ fullName: "My New Name", phone: "+98 912 345 6789" }),
      );

      expect(findUserInScope).not.toHaveBeenCalled();
      expect(updateUserProfileRepo).toHaveBeenCalledWith("actor-1", {
        fullName: "My New Name",
        phone: "15551234567",
      });
      expect(result.fullName).toBe("My New Name");
    });

    it("normalizes the phone number the same way Telegram linking does", async () => {
      await updateUserProfile(
        actor({ userId: "actor-1" }),
        "actor-1",
        input({ phone: "+98 (912) 123-4567" }),
      );
      expect(updateUserProfileRepo).toHaveBeenCalledWith(
        "actor-1",
        expect.objectContaining({ phone: "989121234567" }),
      );
    });

    it("an empty phone string clears the phone number (null)", async () => {
      await updateUserProfile(
        actor({ userId: "actor-1" }),
        "actor-1",
        input({ phone: "" }),
      );
      expect(updateUserProfileRepo).toHaveBeenCalledWith(
        "actor-1",
        expect.objectContaining({ phone: null }),
      );
    });
  });

  describe("editing another user", () => {
    it("throws not_found for a target out of scope (cross-department, no existence leak)", async () => {
      findUserInScope.mockResolvedValue(null);
      await expect(
        updateUserProfile(actor({ role: "ADMIN" }), "user-2", input()),
      ).rejects.toMatchObject({ kind: "not_found" });
      expect(updateUserProfileRepo).not.toHaveBeenCalled();
    });

    it("a plain USER cannot edit another user's profile", async () => {
      findUserInScope.mockResolvedValue(target());
      await expect(
        updateUserProfile(actor({ role: "USER" }), "user-2", input()),
      ).rejects.toMatchObject({ kind: "forbidden" });
      expect(updateUserProfileRepo).not.toHaveBeenCalled();
    });

    it("a MANAGER can edit a USER's profile in their own department", async () => {
      findUserInScope.mockResolvedValue(target({ role: "USER" }));
      const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
      await updateUserProfile(manager, "user-2", input({ fullName: "Edited" }));
      expect(updateUserProfileRepo).toHaveBeenCalledWith(
        "user-2",
        expect.objectContaining({ fullName: "Edited" }),
      );
    });

    it("a MANAGER cannot edit a peer MANAGER's profile", async () => {
      findUserInScope.mockResolvedValue(target({ role: "MANAGER" }));
      const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
      await expect(
        updateUserProfile(manager, "user-2", input()),
      ).rejects.toMatchObject({ kind: "forbidden" });
    });

    it("a MANAGER cannot edit a user in another department", async () => {
      findUserInScope.mockResolvedValue(
        target({ role: "USER", departmentId: "dept-b" }),
      );
      const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
      await expect(
        updateUserProfile(manager, "user-2", input()),
      ).rejects.toMatchObject({ kind: "forbidden" });
    });

    it("ADMIN can edit anyone's profile, any department, any role", async () => {
      findUserInScope.mockResolvedValue(
        target({ role: "MANAGER", departmentId: "dept-b" }),
      );
      await updateUserProfile(
        actor({ role: "ADMIN" }),
        "user-2",
        input({ fullName: "Edited by Admin" }),
      );
      expect(updateUserProfileRepo).toHaveBeenCalledWith(
        "user-2",
        expect.objectContaining({ fullName: "Edited by Admin" }),
      );
    });

    it("never forwards role/department/status — the input type has no such fields to leak", async () => {
      findUserInScope.mockResolvedValue(target({ role: "USER" }));
      const manager = actor({ role: "MANAGER", departmentId: "dept-a" });
      await updateUserProfile(manager, "user-2", input());
      const [, data] = updateUserProfileRepo.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(data).not.toHaveProperty("role");
      expect(data).not.toHaveProperty("departmentId");
      expect(data).not.toHaveProperty("status");
    });
  });
});
