import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `createSession` / `resolveSession` / `endSession` against a fake `db` — the
 * cookie helpers in this module are thin wrappers around `next/headers` and
 * are exercised by the sign-in/sign-out flow instead.
 */

interface FakeSessionRow {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

const users = new Map([
  [
    "user_1",
    {
      id: "user_1",
      email: "operator@example.com",
      fullName: "Operator One",
      role: "USER",
      status: "ACTIVE" as "ACTIVE" | "DISABLED",
      departmentId: "dept_1",
    },
  ],
]);

let sessions: FakeSessionRow[] = [];
let nextId = 1;

vi.mock("@/server/db", () => ({
  db: {
    session: {
      create: vi.fn(async ({ data }: { data: Omit<FakeSessionRow, "id"> }) => {
        const row: FakeSessionRow = { id: `session_${nextId++}`, ...data };
        sessions.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const row = sessions.find((s) => s.tokenHash === where.tokenHash);
        if (!row) return null;
        const user = users.get(row.userId);
        return user ? { ...row, user: { ...user, department: {} } } : null;
      }),
      delete: vi.fn(
        async ({ where }: { where: { id?: string; tokenHash?: string } }) => {
          const before = sessions.length;
          sessions = sessions.filter(
            (s) =>
              s.id !== where.id &&
              (where.tokenHash === undefined ||
                s.tokenHash !== where.tokenHash),
          );
          if (sessions.length === before) throw new Error("not found");
        },
      ),
    },
  },
}));

const { createSession, resolveSession, endSession } = await import("./session");

beforeEach(() => {
  sessions = [];
  nextId = 1;
});

describe("createSession / resolveSession", () => {
  it("resolves a freshly issued token to its user", async () => {
    const issued = await createSession("user_1");
    const resolved = await resolveSession(issued.token);
    expect(resolved?.id).toBe("user_1");
    expect(resolved?.email).toBe("operator@example.com");
  });

  it("never stores the raw token — only its hash", async () => {
    const issued = await createSession("user_1");
    expect(sessions[0]?.tokenHash).not.toBe(issued.token);
  });

  it("returns null for a token that was never issued", async () => {
    await expect(resolveSession("not-a-real-token")).resolves.toBeNull();
  });

  it("returns null and deletes the row for an expired session", async () => {
    const issued = await createSession("user_1");
    const row = sessions[0];
    if (!row) throw new Error("expected a session row");
    row.expiresAt = new Date(Date.now() - 1000);

    await expect(resolveSession(issued.token)).resolves.toBeNull();
    expect(sessions).toHaveLength(0);
  });

  it("returns null for a disabled user even with a valid session", async () => {
    const issued = await createSession("user_1");
    const user = users.get("user_1");
    if (!user) throw new Error("expected the seeded user");
    user.status = "DISABLED";

    await expect(resolveSession(issued.token)).resolves.toBeNull();
    user.status = "ACTIVE";
  });
});

describe("endSession", () => {
  it("removes the session so the token no longer resolves", async () => {
    const issued = await createSession("user_1");
    await endSession(issued.token);
    await expect(resolveSession(issued.token)).resolves.toBeNull();
  });

  it("is a no-op for a token with no matching session", async () => {
    await expect(endSession("never-issued")).resolves.toBeUndefined();
  });
});
