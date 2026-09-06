import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const encryptToken = vi.fn();
const fetchOwnChannel = vi.fn();
const refreshAccessToken = vi.fn();
const upsertYoutubeTarget = vi.fn();
const departmentExists = vi.fn();

vi.mock("@/server/adapters/youtube/token-cipher", () => ({
  encryptToken: (...args: unknown[]) => encryptToken(...args),
}));
vi.mock("@/server/adapters/youtube/youtube-client", () => ({
  fetchOwnChannel: (...args: unknown[]) => fetchOwnChannel(...args),
  refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
}));
vi.mock("@/features/youtube/repository/youtube-target-repository", () => ({
  upsertYoutubeTarget: (...args: unknown[]) => upsertYoutubeTarget(...args),
}));
vi.mock("@/features/departments/repository/department-repository", () => ({
  departmentExists: (...args: unknown[]) => departmentExists(...args),
}));

const { connectYoutubeTarget } = await import("./connect-youtube-target");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "user-1",
  role: "MANAGER",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  refreshAccessToken.mockResolvedValue({
    accessToken: "at-1",
    expiresAt: new Date(),
  });
  fetchOwnChannel.mockResolvedValue({ channelId: "UC1", title: "My Channel" });
  encryptToken.mockReturnValue("encrypted-token");
  upsertYoutubeTarget.mockResolvedValue({ id: "target-1", name: "Main" });
});

describe("connectYoutubeTarget", () => {
  it("rejects a plain USER (MANAGER+ only)", async () => {
    await expect(
      connectYoutubeTarget(actor({ role: "USER" }), {
        name: "Main",
        refreshToken: "rt-1",
      }),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(fetchOwnChannel).not.toHaveBeenCalled();
  });

  it("verifies the refresh token against the real YouTube API before storing it", async () => {
    await connectYoutubeTarget(actor(), { name: "Main", refreshToken: "rt-1" });
    expect(refreshAccessToken).toHaveBeenCalledWith("rt-1");
    expect(fetchOwnChannel).toHaveBeenCalledWith("at-1");
    expect(encryptToken).toHaveBeenCalledWith("rt-1");
    expect(upsertYoutubeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: "dept-a",
        name: "Main",
        youtubeChannelId: "UC1",
        encryptedRefreshToken: "encrypted-token",
        createdByUserId: "user-1",
      }),
    );
  });

  it("rejects a refresh token that cannot be exchanged, without storing anything", async () => {
    refreshAccessToken.mockRejectedValue(new Error("invalid_grant"));
    await expect(
      connectYoutubeTarget(actor(), { name: "Main", refreshToken: "bad" }),
    ).rejects.toMatchObject({ kind: "dependency" });
    expect(upsertYoutubeTarget).not.toHaveBeenCalled();
  });

  it("never trusts a non-ADMIN's departmentId — always uses the actor's own", async () => {
    await connectYoutubeTarget(
      actor({ role: "MANAGER", departmentId: "dept-a" }),
      {
        name: "Main",
        refreshToken: "rt-1",
        departmentId: "dept-b",
      },
    );
    expect(upsertYoutubeTarget).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-a" }),
    );
  });

  it("allows ADMIN to connect a channel for another existing department", async () => {
    departmentExists.mockResolvedValue(true);
    await connectYoutubeTarget(actor({ role: "ADMIN" }), {
      name: "Main",
      refreshToken: "rt-1",
      departmentId: "dept-b",
    });
    expect(upsertYoutubeTarget).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: "dept-b" }),
    );
  });
});
