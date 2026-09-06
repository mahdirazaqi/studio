import { beforeEach, describe, expect, it, vi } from "vitest";

const findJobById = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobById: (...args: unknown[]) => findJobById(...args),
}));

const { getJobForWorker } = await import("./get-job-for-worker");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getJobForWorker", () => {
  it("returns the job when found, regardless of department", async () => {
    findJobById.mockResolvedValue({ id: "job-1", departmentId: "dept-b" });
    await expect(getJobForWorker("job-1")).resolves.toMatchObject({
      id: "job-1",
    });
  });

  it("throws not_found when the job doesn't exist", async () => {
    findJobById.mockResolvedValue(null);
    await expect(getJobForWorker("missing")).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
