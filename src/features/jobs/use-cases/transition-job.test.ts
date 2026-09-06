import { beforeEach, describe, expect, it, vi } from "vitest";

const findJobState = vi.fn();
const transitionJobRow = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobState: (...args: unknown[]) => findJobState(...args),
  transitionJobRow: (...args: unknown[]) => transitionJobRow(...args),
}));

const { transitionJob } = await import("./transition-job");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transitionJob", () => {
  it("throws not_found when the job doesn't exist", async () => {
    findJobState.mockResolvedValue(null);
    await expect(transitionJob("job-1", "CLAIMED")).rejects.toMatchObject({
      kind: "not_found",
    });
    expect(transitionJobRow).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition before attempting the write", async () => {
    findJobState.mockResolvedValue({ state: "UPLOADED" });
    await expect(transitionJob("job-1", "RENDERING")).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(transitionJobRow).not.toHaveBeenCalled();
  });

  it("performs a valid transition", async () => {
    findJobState.mockResolvedValue({ state: "QUEUED" });
    transitionJobRow.mockResolvedValue({ id: "job-1", state: "CLAIMED" });
    const result = await transitionJob("job-1", "CLAIMED", {
      claimedAt: new Date(),
    });
    expect(result).toMatchObject({ state: "CLAIMED" });
    expect(transitionJobRow).toHaveBeenCalledWith(
      "job-1",
      ["QUEUED"],
      "CLAIMED",
      expect.objectContaining({ claimedAt: expect.any(Date) }),
    );
  });

  it("throws conflict when the atomic update loses a race", async () => {
    findJobState.mockResolvedValue({ state: "QUEUED" });
    transitionJobRow.mockResolvedValue(null);
    await expect(transitionJob("job-1", "CLAIMED")).rejects.toMatchObject({
      kind: "conflict",
    });
  });
});
