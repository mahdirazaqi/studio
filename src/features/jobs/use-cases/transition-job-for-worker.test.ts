import { beforeEach, describe, expect, it, vi } from "vitest";

const transitionJob = vi.fn();
const findJobState = vi.fn();
const findJobById = vi.fn();

vi.mock("@/features/jobs/use-cases/transition-job", () => ({
  transitionJob: (...args: unknown[]) => transitionJob(...args),
}));
vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobState: (...args: unknown[]) => findJobState(...args),
  findJobById: (...args: unknown[]) => findJobById(...args),
}));

const { transitionJobForWorker } = await import("./transition-job-for-worker");

const ALLOWED = ["dept-a"];

beforeEach(() => {
  vi.clearAllMocks();
  findJobState.mockResolvedValue({
    state: "RENDERING",
    departmentId: "dept-a",
  });
  transitionJob.mockResolvedValue({ id: "job-1", state: "RENDERED" });
  findJobById.mockResolvedValue({ id: "job-1", state: "RENDERING" });
});

describe("transitionJobForWorker", () => {
  it("maps a canonical Studio name and forwards to transitionJob for a real transition", async () => {
    await transitionJobForWorker("job-1", { state: "RENDERED" }, ALLOWED);
    expect(transitionJob).toHaveBeenCalledWith("job-1", "RENDERED", {});
  });

  it("rejects an unrecognized state value without calling transitionJob", async () => {
    await expect(
      transitionJobForWorker("job-1", { state: "NOT_A_STATE" }, ALLOWED),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range legacy integer", async () => {
    await expect(
      transitionJobForWorker("job-1", { state: 42 }, ALLOWED),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  it("requires errorReason when the target state is ERROR", async () => {
    await expect(
      transitionJobForWorker("job-1", { state: "ERROR" }, ALLOWED),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  it("forwards errorReason when transitioning to ERROR", async () => {
    await transitionJobForWorker(
      "job-1",
      { state: 8, errorReason: "ffmpeg crashed" },
      ALLOWED,
    );
    expect(transitionJob).toHaveBeenCalledWith("job-1", "ERROR", {
      errorReason: "ffmpeg crashed",
    });
  });

  it("throws not_found when the job doesn't exist", async () => {
    findJobState.mockResolvedValue(null);
    await expect(
      transitionJobForWorker("job-1", { state: "ERROR", errorReason: "x" }, ALLOWED),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  it("throws not_found (never forbidden) for a job outside the Worker's allowed departments", async () => {
    findJobState.mockResolvedValue({
      state: "RENDERING",
      departmentId: "dept-z",
    });
    await expect(
      transitionJobForWorker("job-1", { state: "ERROR", errorReason: "x" }, ALLOWED),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  // ADR-0043 — the actual Worker reports three distinct legacy per-stage
  // codes (Downloading=2, Started=3, InProgress=4) that all map onto the
  // same Studio RENDERING bucket; only the first is a real transition.
  describe("same-state idempotency (ADR-0043)", () => {
    it("maps a legacy integer that resolves to the current state as a no-op — never calls transitionJob", async () => {
      findJobState.mockResolvedValue({
        state: "RENDERING",
        departmentId: "dept-a",
      });
      findJobById.mockResolvedValue({ id: "job-1", state: "RENDERING" });

      const result = await transitionJobForWorker(
        "job-1",
        { state: 4 }, // InProgress -> RENDERING, same bucket as current
        ALLOWED,
      );

      expect(transitionJob).not.toHaveBeenCalled();
      expect(result).toEqual({ id: "job-1", state: "RENDERING" });
    });

    it("does the same for a canonical Studio name matching the current state", async () => {
      findJobState.mockResolvedValue({
        state: "RENDERING",
        departmentId: "dept-a",
      });
      await transitionJobForWorker("job-1", { state: "RENDERING" }, ALLOWED);
      expect(transitionJob).not.toHaveBeenCalled();
      expect(findJobById).toHaveBeenCalledWith("job-1");
    });

    it("still performs a real transition when the mapped target differs from the current state", async () => {
      findJobState.mockResolvedValue({
        state: "CLAIMED",
        departmentId: "dept-a",
      });
      await transitionJobForWorker("job-1", { state: 2 }, ALLOWED); // Downloading -> RENDERING
      expect(transitionJob).toHaveBeenCalledWith("job-1", "RENDERING", {});
      expect(findJobById).not.toHaveBeenCalled();
    });

    it("throws not_found if the job disappears between the state check and the no-op read", async () => {
      findJobState.mockResolvedValue({
        state: "RENDERING",
        departmentId: "dept-a",
      });
      findJobById.mockResolvedValue(null);
      await expect(
        transitionJobForWorker("job-1", { state: "RENDERING" }, ALLOWED),
      ).rejects.toMatchObject({ kind: "not_found" });
    });
  });
});
