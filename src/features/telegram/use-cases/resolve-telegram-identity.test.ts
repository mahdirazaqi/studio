import { beforeEach, describe, expect, it, vi } from "vitest";

const findUserByTelegramId = vi.fn();

vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  findUserByTelegramId: (...args: unknown[]) => findUserByTelegramId(...args),
}));

const { resolveTelegramIdentity } = await import("./resolve-telegram-identity");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveTelegramIdentity", () => {
  it("returns null for an unlinked Telegram id", async () => {
    findUserByTelegramId.mockResolvedValue(null);
    expect(await resolveTelegramIdentity("tg-1")).toBeNull();
  });

  it("builds an Actor + fullName from the linked user", async () => {
    findUserByTelegramId.mockResolvedValue({
      id: "user-1",
      role: "USER",
      departmentId: "dept-a",
      fullName: "Ada Lovelace",
    });
    expect(await resolveTelegramIdentity("tg-1")).toEqual({
      actor: { userId: "user-1", role: "USER", departmentId: "dept-a" },
      fullName: "Ada Lovelace",
    });
  });

  it("passes the telegram id through to the repository unchanged", async () => {
    findUserByTelegramId.mockResolvedValue(null);
    await resolveTelegramIdentity("123456789");
    expect(findUserByTelegramId).toHaveBeenCalledWith("123456789");
  });
});
