import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getSessionTokenFromCookies: vi.fn(async () => null),
  resolveSession: vi.fn(async () => null),
}));

const { requireUser } = await import("./current-user");

describe("requireUser", () => {
  it("throws unauthenticated when there is no valid session", async () => {
    await expect(requireUser()).rejects.toMatchObject({
      kind: "unauthenticated",
    });
  });
});
