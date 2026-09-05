import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/server/auth/password";

const findUserCredentialByEmail = vi.fn();
const createSession = vi.fn();

vi.mock("@/features/users/repository/user-repository", () => ({
  findUserCredentialByEmail: (...args: unknown[]) =>
    findUserCredentialByEmail(...args),
}));

vi.mock("@/server/auth/session", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
}));

// Imported after the mocks so `signIn` picks up the mocked modules.
const { signIn } = await import("./sign-in");

const ACTIVE_USER = {
  id: "user_1",
  email: "operator@example.com",
  fullName: "Operator One",
  role: "USER" as const,
  status: "ACTIVE" as const,
  departmentId: "dept_1",
};

describe("signIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSession.mockResolvedValue({
      token: "issued-token",
      expiresAt: new Date("2099-01-01"),
    });
  });

  it("issues a session for an active user with the correct password", async () => {
    const passwordHash = await hashPassword("correct-password");
    findUserCredentialByEmail.mockResolvedValue({
      ...ACTIVE_USER,
      passwordHash,
    });

    const result = await signIn({
      email: ACTIVE_USER.email,
      password: "correct-password",
    });

    expect(result.token).toBe("issued-token");
    expect(createSession).toHaveBeenCalledWith(ACTIVE_USER.id);
  });

  it("rejects an unknown email with a generic error", async () => {
    findUserCredentialByEmail.mockResolvedValue(null);

    await expect(
      signIn({ email: "nobody@example.com", password: "anything" }),
    ).rejects.toMatchObject({ kind: "unauthenticated" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects the wrong password with the same generic error", async () => {
    const passwordHash = await hashPassword("correct-password");
    findUserCredentialByEmail.mockResolvedValue({
      ...ACTIVE_USER,
      passwordHash,
    });

    await expect(
      signIn({ email: ACTIVE_USER.email, password: "wrong-password" }),
    ).rejects.toMatchObject({ kind: "unauthenticated" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a disabled user even with the correct password, with the same generic error", async () => {
    const passwordHash = await hashPassword("correct-password");
    findUserCredentialByEmail.mockResolvedValue({
      ...ACTIVE_USER,
      status: "DISABLED",
      passwordHash,
    });

    await expect(
      signIn({ email: ACTIVE_USER.email, password: "correct-password" }),
    ).rejects.toMatchObject({ kind: "unauthenticated" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("gives the unknown-email and wrong-password failures the identical message", async () => {
    findUserCredentialByEmail.mockResolvedValueOnce(null);
    const unknownEmailError: unknown = await signIn({
      email: "nobody@example.com",
      password: "anything",
    }).catch((error: unknown) => error);

    const passwordHash = await hashPassword("correct-password");
    findUserCredentialByEmail.mockResolvedValueOnce({
      ...ACTIVE_USER,
      passwordHash,
    });
    const wrongPasswordError: unknown = await signIn({
      email: ACTIVE_USER.email,
      password: "wrong-password",
    }).catch((error: unknown) => error);

    expect((unknownEmailError as Error).message).toBe(
      (wrongPasswordError as Error).message,
    );
  });
});
