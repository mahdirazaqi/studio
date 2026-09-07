import { beforeEach, describe, expect, it, vi } from "vitest";

const claimNextJobRow = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  claimNextJobRow: (...args: unknown[]) => claimNextJobRow(...args),
}));

const { claimNextJob } = await import("./claim-next-job");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimNextJob", () => {
  it("returns the claimed job when one is available", async () => {
    claimNextJobRow.mockResolvedValue({ id: "job-1", state: "CLAIMED" });
    await expect(claimNextJob(["dept-a"])).resolves.toMatchObject({
      id: "job-1",
    });
  });

  it("returns null when the queue is empty", async () => {
    claimNextJobRow.mockResolvedValue(null);
    await expect(claimNextJob(["dept-a"])).resolves.toBeNull();
  });

  it("passes the allowed Department scope straight through to the atomic claim query", async () => {
    claimNextJobRow.mockResolvedValue(null);
    await claimNextJob(["dept-a", "dept-b"]);
    expect(claimNextJobRow).toHaveBeenCalledWith(["dept-a", "dept-b"]);
  });
});
