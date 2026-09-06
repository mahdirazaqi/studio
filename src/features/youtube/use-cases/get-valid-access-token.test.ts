import { beforeEach, describe, expect, it, vi } from "vitest";

const findTokensById = vi.fn();
const updateAccessTokenCache = vi.fn();
const markYoutubeTargetError = vi.fn();
const decryptToken = vi.fn();
const encryptToken = vi.fn();
const refreshAccessToken = vi.fn();

vi.mock("@/features/youtube/repository/youtube-target-repository", () => ({
  findTokensById: (...args: unknown[]) => findTokensById(...args),
  updateAccessTokenCache: (...args: unknown[]) =>
    updateAccessTokenCache(...args),
  markYoutubeTargetError: (...args: unknown[]) =>
    markYoutubeTargetError(...args),
}));
vi.mock("@/server/adapters/youtube/token-cipher", () => ({
  decryptToken: (...args: unknown[]) => decryptToken(...args),
  encryptToken: (...args: unknown[]) => encryptToken(...args),
}));
vi.mock("@/server/adapters/youtube/youtube-client", () => ({
  refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
}));

const { getValidAccessToken } = await import("./get-valid-access-token");

beforeEach(() => {
  vi.clearAllMocks();
  decryptToken.mockImplementation((v: string) => `decrypted:${v}`);
  encryptToken.mockImplementation((v: string) => `encrypted:${v}`);
  markYoutubeTargetError.mockResolvedValue(undefined);
});

describe("getValidAccessToken", () => {
  it("returns the cached access token when it is still valid", async () => {
    findTokensById.mockResolvedValue({
      encryptedRefreshToken: "enc-rt",
      encryptedAccessToken: "enc-at",
      accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const token = await getValidAccessToken("target-1");
    expect(token).toBe("decrypted:enc-at");
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("refreshes when the cached token is missing", async () => {
    findTokensById.mockResolvedValue({
      encryptedRefreshToken: "enc-rt",
      encryptedAccessToken: null,
      accessTokenExpiresAt: null,
    });
    refreshAccessToken.mockResolvedValue({
      accessToken: "fresh-at",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const token = await getValidAccessToken("target-1");
    expect(refreshAccessToken).toHaveBeenCalledWith("decrypted:enc-rt");
    expect(updateAccessTokenCache).toHaveBeenCalledWith(
      "target-1",
      "encrypted:fresh-at",
      expect.any(Date),
    );
    expect(token).toBe("fresh-at");
  });

  it("refreshes when the cached token is about to expire (safety margin)", async () => {
    findTokensById.mockResolvedValue({
      encryptedRefreshToken: "enc-rt",
      encryptedAccessToken: "enc-at",
      accessTokenExpiresAt: new Date(Date.now() + 5_000), // within the margin
    });
    refreshAccessToken.mockResolvedValue({
      accessToken: "fresh-at",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const token = await getValidAccessToken("target-1");
    expect(refreshAccessToken).toHaveBeenCalled();
    expect(token).toBe("fresh-at");
  });

  it("marks the target ERROR and throws a safe error when refresh fails (revoked token)", async () => {
    findTokensById.mockResolvedValue({
      encryptedRefreshToken: "enc-rt",
      encryptedAccessToken: null,
      accessTokenExpiresAt: null,
    });
    refreshAccessToken.mockRejectedValue(new Error("invalid_grant: revoked"));

    await expect(getValidAccessToken("target-1")).rejects.toMatchObject({
      kind: "dependency",
    });
    expect(markYoutubeTargetError).toHaveBeenCalledWith(
      "target-1",
      expect.any(String),
    );
    // Never leaks the raw provider error into the stored reason.
    const reason = markYoutubeTargetError.mock.calls[0]?.[1] as string;
    expect(reason).not.toContain("invalid_grant");
  });

  it("throws a dependency error for an unknown target id", async () => {
    findTokensById.mockResolvedValue(null);
    await expect(getValidAccessToken("missing")).rejects.toMatchObject({
      kind: "dependency",
    });
  });
});
