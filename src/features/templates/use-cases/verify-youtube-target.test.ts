import { beforeEach, describe, expect, it, vi } from "vitest";

const findConnectedYoutubeTargetForDepartment = vi.fn();

vi.mock("@/features/youtube/repository/youtube-target-repository", () => ({
  findConnectedYoutubeTargetForDepartment: (...args: unknown[]) =>
    findConnectedYoutubeTargetForDepartment(...args),
}));

const { verifyYoutubeTargetReference } =
  await import("./verify-youtube-target");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyYoutubeTargetReference", () => {
  it("returns null without a lookup when no target id is given", async () => {
    expect(await verifyYoutubeTargetReference("dept-a", undefined)).toBeNull();
    expect(await verifyYoutubeTargetReference("dept-a", null)).toBeNull();
    expect(findConnectedYoutubeTargetForDepartment).not.toHaveBeenCalled();
  });

  it("resolves a connected target belonging to the given department", async () => {
    findConnectedYoutubeTargetForDepartment.mockResolvedValue({
      id: "target-1",
      name: "Main",
    });
    const result = await verifyYoutubeTargetReference("dept-a", "target-1");
    expect(result).toBe("target-1");
    expect(findConnectedYoutubeTargetForDepartment).toHaveBeenCalledWith(
      "dept-a",
      "target-1",
    );
  });

  it("rejects a target id that belongs to a different department (never trusts the client's claim)", async () => {
    findConnectedYoutubeTargetForDepartment.mockResolvedValue(null);
    await expect(
      verifyYoutubeTargetReference("dept-a", "target-in-dept-b"),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });

  it("rejects a target that exists but is disconnected", async () => {
    // The repository query itself filters to CONNECTED only, so a
    // disconnected target simply never comes back — same rejection path.
    findConnectedYoutubeTargetForDepartment.mockResolvedValue(null);
    await expect(
      verifyYoutubeTargetReference("dept-a", "disconnected-target"),
    ).rejects.toMatchObject({ kind: "business_rule" });
  });
});
