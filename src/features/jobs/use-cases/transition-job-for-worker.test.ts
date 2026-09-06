import { beforeEach, describe, expect, it, vi } from "vitest";

const transitionJob = vi.fn();

vi.mock("@/features/jobs/use-cases/transition-job", () => ({
  transitionJob: (...args: unknown[]) => transitionJob(...args),
}));

const { transitionJobForWorker } = await import("./transition-job-for-worker");

beforeEach(() => {
  vi.clearAllMocks();
  transitionJob.mockResolvedValue({ id: "job-1", state: "RENDERING" });
});

describe("transitionJobForWorker", () => {
  it("maps a legacy integer state and forwards to transitionJob", async () => {
    await transitionJobForWorker("job-1", { state: 4 }); // InProgress -> RENDERING
    expect(transitionJob).toHaveBeenCalledWith("job-1", "RENDERING", {});
  });

  it("maps a canonical Studio name and forwards to transitionJob", async () => {
    await transitionJobForWorker("job-1", { state: "RENDERED" });
    expect(transitionJob).toHaveBeenCalledWith("job-1", "RENDERED", {});
  });

  it("rejects an unrecognized state value without calling transitionJob", async () => {
    await expect(
      transitionJobForWorker("job-1", { state: "NOT_A_STATE" }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range legacy integer", async () => {
    await expect(
      transitionJobForWorker("job-1", { state: 42 }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  it("requires errorReason when the target state is ERROR", async () => {
    await expect(
      transitionJobForWorker("job-1", { state: "ERROR" }),
    ).rejects.toMatchObject({ kind: "validation" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  it("forwards errorReason when transitioning to ERROR", async () => {
    await transitionJobForWorker("job-1", {
      state: 8,
      errorReason: "ffmpeg crashed",
    });
    expect(transitionJob).toHaveBeenCalledWith("job-1", "ERROR", {
      errorReason: "ffmpeg crashed",
    });
  });

  it("does not require errorReason for non-ERROR targets", async () => {
    await expect(
      transitionJobForWorker("job-1", { state: "RENDERING" }),
    ).resolves.toBeDefined();
  });
});
