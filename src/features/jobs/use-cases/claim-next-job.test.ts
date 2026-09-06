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
    await expect(claimNextJob()).resolves.toMatchObject({ id: "job-1" });
  });

  it("returns null when the queue is empty", async () => {
    claimNextJobRow.mockResolvedValue(null);
    await expect(claimNextJob()).resolves.toBeNull();
  });
});
