import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const createUserRepo = vi.fn();
const hashPassword = vi.fn();
const departmentExists = vi.fn();

vi.mock("@/features/users/repository/user-repository", () => ({
  createUser: (...args: unknown[]) => createUserRepo(...args),
}));
vi.mock("@/server/auth/password", () => ({
  hashPassword: (...args: unknown[]) => hashPassword(...args),
}));
vi.mock("@/features/departments/repository/department-repository", () => ({
  departmentExists: (...args: unknown[]) => departmentExists(...args),
}));

const { createUser } = await import("./create-user");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "actor-1",
  role: "MANAGER",
  departmentId: "dept-a",
  ...overrides,
});

const input = (overrides = {}) => ({
  email: "new@example.com",
  fullName: "New Person",
  password: "a-real-password",
  role: "USER" as const,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  hashPassword.mockResolvedValue("hashed");
  createUserRepo.mockResolvedValue({ id: "user-2", fullName: "New Person" });
  departmentExists.mockResolvedValue(true);
});

describe("createUser", () => {
  it("rejects a plain USER (user:manage floor)", async () => {
    await expect(
      createUser(actor({ role: "USER" }), input()),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(createUserRepo).not.toHaveBeenCalled();
  });

  it("a MANAGER creates into their own department, always as USER", async () => {
    await createUser(actor(), input({ role: "USER" }));
    expect(createUserRepo).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-a", role: "USER" }),
    );
  });

  it("a MANAGER cannot create another MANAGER (OD-05 conservative default)", async () => {
    await expect(
      createUser(actor(), input({ role: "MANAGER" })),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(createUserRepo).not.toHaveBeenCalled();
  });

  it("a MANAGER's departmentId claim is ignored — always their own", async () => {
    await createUser(actor(), input({ departmentId: "dept-b" }));
    expect(createUserRepo).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-a" }),
    );
  });

  it("ADMIN may create any role in any (existing) department", async () => {
    await createUser(
      actor({ role: "ADMIN" }),
      input({ role: "ADMIN", departmentId: "dept-b" }),
    );
    expect(createUserRepo).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-b", role: "ADMIN" }),
    );
  });

  it("ADMIN targeting a nonexistent department is rejected", async () => {
    departmentExists.mockResolvedValue(false);
    await expect(
      createUser(actor({ role: "ADMIN" }), input({ departmentId: "dept-x" })),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(createUserRepo).not.toHaveBeenCalled();
  });

  it("hashes the password before storing — never stores it plain", async () => {
    await createUser(
      actor({ role: "ADMIN" }),
      input({ password: "plain-text" }),
    );
    expect(hashPassword).toHaveBeenCalledWith("plain-text");
    expect(createUserRepo).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: "hashed" }),
    );
    const call = createUserRepo.mock.calls[0]?.[0];
    expect(call).not.toHaveProperty("password");
  });
});
