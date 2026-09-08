import { beforeEach, describe, expect, it, vi } from "vitest";

const findJobState = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobState: (...args: unknown[]) => findJobState(...args),
}));

const { getJobLegacyCancelStatus } = await import(
  "./get-job-legacy-cancel-status"
);

beforeEach(() => {
  vi.clearAllMocks();
});

// ADR-0043 — backs the unauthenticated legacy cancel-status poll the actual
// Worker's `CanCancel` hits at `GET {baseURL}/jobs/:id`.
describe("getJobLegacyCancelStatus", () => {
  it("returns the id and a legacy int state for an existing job", async () => {
    findJobState.mockResolvedValue({
      state: "CANCELED",
      departmentId: "dept-a",
    });
    await expect(getJobLegacyCancelStatus("job-1")).resolves.toEqual({
      id: "job-1",
      state: 9,
    });
  });

  it("returns null for an unknown job (caller maps this to the legacy 404 shape)", async () => {
    findJobState.mockResolvedValue(null);
    await expect(getJobLegacyCancelStatus("job-1")).resolves.toBeNull();
  });

  it("never returns state 9 for a job that isn't actually CANCELED", async () => {
    findJobState.mockResolvedValue({
      state: "RENDERING",
      departmentId: "dept-a",
    });
    const result = await getJobLegacyCancelStatus("job-1");
    expect(result?.state).not.toBe(9);
  });
});
