import { beforeEach, describe, expect, it, vi } from "vitest";

const findJobState = vi.fn();
const setDuration = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobState: (...args: unknown[]) => findJobState(...args),
  setDuration: (...args: unknown[]) => setDuration(...args),
}));

const { updateJobDuration } = await import("./update-job-duration");

const ALLOWED = ["dept-a"];

beforeEach(() => {
  vi.clearAllMocks();
  findJobState.mockResolvedValue({
    state: "RENDERING",
    departmentId: "dept-a",
  });
  setDuration.mockResolvedValue({ id: "job-1", durationSeconds: 30 });
});

describe("updateJobDuration", () => {
  it("rejects a negative value", async () => {
    await expect(
      updateJobDuration({ jobId: "job-1", durationSeconds: -1 }, ALLOWED),
    ).rejects.toMatchObject({ kind: "validation" });
  });

  it("accepts zero and positive values", async () => {
    const result = await updateJobDuration(
      { jobId: "job-1", durationSeconds: 30 },
      ALLOWED,
    );
    expect(result).toMatchObject({ durationSeconds: 30 });
    expect(setDuration).toHaveBeenCalledWith("job-1", 30);
  });

  it("throws not_found when the job doesn't exist", async () => {
    findJobState.mockResolvedValue(null);
    await expect(
      updateJobDuration({ jobId: "missing", durationSeconds: 10 }, ALLOWED),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("rejects updating duration on a terminal job", async () => {
    findJobState.mockResolvedValue({
      state: "CANCELED",
      departmentId: "dept-a",
    });
    await expect(
      updateJobDuration({ jobId: "job-1", durationSeconds: 10 }, ALLOWED),
    ).rejects.toMatchObject({ kind: "business_rule" });
    expect(setDuration).not.toHaveBeenCalled();
  });

  it("throws not_found (never forbidden) for a job outside the Worker's allowed departments", async () => {
    findJobState.mockResolvedValue({
      state: "RENDERING",
      departmentId: "dept-z",
    });
    await expect(
      updateJobDuration({ jobId: "job-1", durationSeconds: 10 }, ALLOWED),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(setDuration).not.toHaveBeenCalled();
  });
});
