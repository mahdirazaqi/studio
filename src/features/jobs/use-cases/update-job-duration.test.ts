import { beforeEach, describe, expect, it, vi } from "vitest";

const findJobState = vi.fn();
const setDuration = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobState: (...args: unknown[]) => findJobState(...args),
  setDuration: (...args: unknown[]) => setDuration(...args),
}));

const { updateJobDuration } = await import("./update-job-duration");

beforeEach(() => {
  vi.clearAllMocks();
  findJobState.mockResolvedValue({ state: "RENDERING" });
  setDuration.mockResolvedValue({ id: "job-1", durationSeconds: 30 });
});

describe("updateJobDuration", () => {
  it("rejects a negative value", async () => {
    await expect(
      updateJobDuration({ jobId: "job-1", durationSeconds: -1 }),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("accepts zero and positive values", async () => {
    const result = await updateJobDuration({
      jobId: "job-1",
      durationSeconds: 30,
    });
    expect(result).toMatchObject({ durationSeconds: 30 });
    expect(setDuration).toHaveBeenCalledWith("job-1", 30);
  });

  it("throws not_found when the job doesn't exist", async () => {
    findJobState.mockResolvedValue(null);
    await expect(
      updateJobDuration({ jobId: "missing", durationSeconds: 10 }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("rejects updating duration on a terminal job", async () => {
    findJobState.mockResolvedValue({ state: "CANCELED" });
    await expect(
      updateJobDuration({ jobId: "job-1", durationSeconds: 10 }),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(setDuration).not.toHaveBeenCalled();
  });
});
