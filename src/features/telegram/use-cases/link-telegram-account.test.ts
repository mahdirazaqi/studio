import { beforeEach, describe, expect, it, vi } from "vitest";

import { conflictError } from "@/server/errors/app-error";

const findActiveUserByPhone = vi.fn();
const linkTelegramIdentity = vi.fn();

vi.mock("@/features/telegram/repository/telegram-repository", () => ({
  findActiveUserByPhone: (...args: unknown[]) => findActiveUserByPhone(...args),
  linkTelegramIdentity: (...args: unknown[]) => linkTelegramIdentity(...args),
}));

const { linkTelegramAccount } = await import("./link-telegram-account");

beforeEach(() => {
  vi.clearAllMocks();
});

const matchedUser = {
  id: "user-1",
  role: "USER" as const,
  departmentId: "dept-a",
  fullName: "Ada Lovelace",
};

describe("linkTelegramAccount", () => {
  it("links when the normalized phone matches exactly one active user", async () => {
    findActiveUserByPhone.mockResolvedValue(matchedUser);
    linkTelegramIdentity.mockResolvedValue(undefined);

    const result = await linkTelegramAccount("tg-1", "+98 912 123 4567");

    expect(findActiveUserByPhone).toHaveBeenCalledWith("989121234567");
    expect(linkTelegramIdentity).toHaveBeenCalledWith("user-1", "tg-1");
    expect(result).toEqual({ linked: true, user: matchedUser });
  });

  it("reports no_match when no active user has that phone (OD-06)", async () => {
    findActiveUserByPhone.mockResolvedValue(null);

    const result = await linkTelegramAccount("tg-1", "+989121234567");

    expect(result).toEqual({ linked: false, reason: "no_match" });
    expect(linkTelegramIdentity).not.toHaveBeenCalled();
  });

  it("reports no_match for a phone that normalizes to nothing", async () => {
    const result = await linkTelegramAccount("tg-1", "not a number");
    expect(result).toEqual({ linked: false, reason: "no_match" });
    expect(findActiveUserByPhone).not.toHaveBeenCalled();
  });

  it("reports already_linked_elsewhere when the Telegram id is taken by a different user", async () => {
    findActiveUserByPhone.mockResolvedValue(matchedUser);
    linkTelegramIdentity.mockRejectedValue(
      conflictError("already linked to a different user"),
    );

    const result = await linkTelegramAccount("tg-1", "+989121234567");

    expect(result).toEqual({
      linked: false,
      reason: "already_linked_elsewhere",
    });
  });

  it("re-throws a non-conflict error from the repository", async () => {
    findActiveUserByPhone.mockResolvedValue(matchedUser);
    linkTelegramIdentity.mockRejectedValue(new Error("db down"));

    await expect(linkTelegramAccount("tg-1", "+989121234567")).rejects.toThrow(
      "db down",
    );
  });
});
