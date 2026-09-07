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
  it("returns the job when it's in an allowed department", async () => {
    findJobById.mockResolvedValue({ id: "job-1", departmentId: "dept-b" });
    await expect(
      getJobForWorker("job-1", ["dept-a", "dept-b"]),
    ).resolves.toMatchObject({ id: "job-1" });
  });

  it("throws not_found when the job doesn't exist", async () => {
    findJobById.mockResolvedValue(null);
    await expect(getJobForWorker("missing", ["dept-a"])).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("throws not_found (never forbidden) for a job outside the Worker's allowed departments", async () => {
    findJobById.mockResolvedValue({ id: "job-1", departmentId: "dept-c" });
    await expect(
      getJobForWorker("job-1", ["dept-a", "dept-b"]),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});
