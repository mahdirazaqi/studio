import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";

const encryptToken = vi.fn();
const fetchOwnChannel = vi.fn();
const refreshAccessToken = vi.fn();
const upsertYoutubeTarget = vi.fn();
const departmentsExist = vi.fn();

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
  departmentsExist: (...args: unknown[]) => departmentsExist(...args),
}));

const { connectYoutubeTarget } = await import("./connect-youtube-target");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "user-1",
  role: "ADMIN",
  departmentId: "dept-a",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  departmentsExist.mockResolvedValue(true);
  refreshAccessToken.mockResolvedValue({
    accessToken: "at-1",
    expiresAt: new Date(),
  });
  fetchOwnChannel.mockResolvedValue({ channelId: "UC1", title: "My Channel" });
  encryptToken.mockReturnValue("encrypted-token");
  upsertYoutubeTarget.mockResolvedValue({ id: "target-1", name: "Main" });
});

describe("connectYoutubeTarget", () => {
  it("rejects a plain USER (ADMIN only, ADR-0040)", async () => {
    await expect(
      connectYoutubeTarget(actor({ role: "USER" }), {
        name: "Main",
        refreshToken: "rt-1",
        departmentIds: ["dept-a"],
      }),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(fetchOwnChannel).not.toHaveBeenCalled();
  });

  it("rejects a MANAGER (ADMIN only, ADR-0040)", async () => {
    await expect(
      connectYoutubeTarget(actor({ role: "MANAGER" }), {
        name: "Main",
        refreshToken: "rt-1",
        departmentIds: ["dept-a"],
      }),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(fetchOwnChannel).not.toHaveBeenCalled();
  });

  it("verifies the refresh token against the real YouTube API before storing it", async () => {
    await connectYoutubeTarget(actor(), {
      name: "Main",
      refreshToken: "rt-1",
      departmentIds: ["dept-a", "dept-b"],
    });
    expect(refreshAccessToken).toHaveBeenCalledWith("rt-1");
    expect(fetchOwnChannel).toHaveBeenCalledWith("at-1");
    expect(encryptToken).toHaveBeenCalledWith("rt-1");
    expect(upsertYoutubeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentIds: ["dept-a", "dept-b"],
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
      connectYoutubeTarget(actor(), {
        name: "Main",
        refreshToken: "bad",
        departmentIds: ["dept-a"],
      }),
    ).rejects.toMatchObject({ kind: "dependency" });
    expect(upsertYoutubeTarget).not.toHaveBeenCalled();
  });

  it("rejects a departmentIds set containing a nonexistent department", async () => {
    departmentsExist.mockResolvedValue(false);
    await expect(
      connectYoutubeTarget(actor(), {
        name: "Main",
        refreshToken: "rt-1",
        departmentIds: ["dept-bogus"],
      }),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(fetchOwnChannel).not.toHaveBeenCalled();
  });
});
