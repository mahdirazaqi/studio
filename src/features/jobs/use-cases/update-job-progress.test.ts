import { beforeEach, describe, expect, it, vi } from "vitest";

const findJobState = vi.fn();
const setProgress = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobState: (...args: unknown[]) => findJobState(...args),
  setProgress: (...args: unknown[]) => setProgress(...args),
}));

const { updateJobProgress } = await import("./update-job-progress");

beforeEach(() => {
  vi.clearAllMocks();
  findJobState.mockResolvedValue({ state: "RENDERING" });
  setProgress.mockResolvedValue({ id: "job-1", progress: 50 });
});

describe("updateJobProgress", () => {
  it("rejects a value below 0", async () => {
    await expect(
      updateJobProgress({ jobId: "job-1", progress: -1 }),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("rejects a value above 100", async () => {
    await expect(
      updateJobProgress({ jobId: "job-1", progress: 150 }),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("rejects a non-integer value", async () => {
    await expect(
      updateJobProgress({ jobId: "job-1", progress: 12.5 }),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("accepts a valid value", async () => {
    const result = await updateJobProgress({ jobId: "job-1", progress: 50 });
    expect(result).toMatchObject({ progress: 50 });
    expect(setProgress).toHaveBeenCalledWith("job-1", 50);
  });

  it("throws not_found when the job doesn't exist", async () => {
    findJobState.mockResolvedValue(null);
    await expect(
      updateJobProgress({ jobId: "missing", progress: 10 }),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(setProgress).not.toHaveBeenCalled();
  });

  it("rejects updating progress on a terminal job", async () => {
    findJobState.mockResolvedValue({ state: "UPLOADED" });
    await expect(
      updateJobProgress({ jobId: "job-1", progress: 10 }),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(setProgress).not.toHaveBeenCalled();
  });
});
