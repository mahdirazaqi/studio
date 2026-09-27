import { beforeEach, describe, expect, it, vi } from "vitest";

const transitionJob = vi.fn();
const findJobState = vi.fn();
const findJobById = vi.fn();
const markRenderStarted = vi.fn();

vi.mock("@/features/jobs/use-cases/transition-job", () => ({
  transitionJob: (...args: unknown[]) => transitionJob(...args),
}));
vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobState: (...args: unknown[]) => findJobState(...args),
  findJobById: (...args: unknown[]) => findJobById(...args),
  markRenderStarted: (...args: unknown[]) => markRenderStarted(...args),
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
  markRenderStarted.mockResolvedValue({
    id: "job-1",
    state: "RENDERING",
    startedAt: new Date(),
  });
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

  // Phase 19/ADR-0049 — the real Worker's `ChangeState()`
  // (`navaak-ae-renderer/renderer/operator/request.go`) sends `{"state": s}`
  // only, for every state including Error — it has no error-message concept
  // at all. Requiring `errorReason` made every real Worker-reported failure
  // itself fail with a `validation` error, leaving the Job stuck forever in
  // whatever state it was already in (with no error recorded, since the
  // very report meant to record one was rejected).
  it("falls back to a generic reason instead of rejecting when the Worker reports ERROR with no errorReason", async () => {
    await transitionJobForWorker("job-1", { state: "ERROR" }, ALLOWED);
    expect(transitionJob).toHaveBeenCalledWith("job-1", "ERROR", {
      errorReason: expect.stringContaining("Worker"),
    });
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
      transitionJobForWorker(
        "job-1",
        { state: "ERROR", errorReason: "x" },
        ALLOWED,
      ),
    ).rejects.toMatchObject({ kind: "not_found" });
    expect(transitionJob).not.toHaveBeenCalled();
  });

  it("throws not_found (never forbidden) for a job outside the Worker's allowed departments", async () => {
    findJobState.mockResolvedValue({
      state: "RENDERING",
      departmentId: "dept-z",
    });
    await expect(
      transitionJobForWorker(
        "job-1",
        { state: "ERROR", errorReason: "x" },
        ALLOWED,
      ),
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

      // Started(3) — same-state, but not the render-start signal itself.
      const result = await transitionJobForWorker(
        "job-1",
        { state: 3 },
        ALLOWED,
      );

      expect(transitionJob).not.toHaveBeenCalled();
      expect(markRenderStarted).not.toHaveBeenCalled();
      expect(result).toEqual({ id: "job-1", state: "RENDERING" });
    });

    it("does the same for a canonical Studio name matching the current state", async () => {
      findJobState.mockResolvedValue({
        state: "RENDERING",
        departmentId: "dept-a",
      });
      await transitionJobForWorker("job-1", { state: "RENDERING" }, ALLOWED);
      expect(transitionJob).not.toHaveBeenCalled();
      expect(markRenderStarted).not.toHaveBeenCalled();
      expect(findJobById).toHaveBeenCalledWith("job-1");
    });

    // Phase 18/ADR-0048 — "Downloading"/"Started" both arrive before the
    // real Worker does any actual rendering work
    // (`navaak-ae-renderer/renderer/renderer.go`'s `next()`, traced against
    // the real source): `Downloading` fires at the very start of asset
    // download, `Started` after download but before script generation.
    // Neither should set `startedAt` — that would measure download time as
    // render time, exactly what `computeRenderSeconds` is documented not to
    // include.
    it.each([2, 3])(
      "performs the real CLAIMED -> RENDERING transition for legacy code %i but does not set startedAt yet",
      async (legacyCode) => {
        findJobState.mockResolvedValue({
          state: "CLAIMED",
          departmentId: "dept-a",
        });
        await transitionJobForWorker("job-1", { state: legacyCode }, ALLOWED);
        expect(transitionJob).toHaveBeenCalledWith("job-1", "RENDERING", {});
        expect(findJobById).not.toHaveBeenCalled();
      },
    );

    // The one report that actually means rendering started
    // (`operator/render.go`'s `Render()` — issued immediately before
    // invoking `aerender`). In the real Worker this always arrives as a
    // same-state report (Downloading/Started already made the real
    // transition above a no-op by the time it's sent) — that's the branch
    // that must call `markRenderStarted`.
    it("calls markRenderStarted (not just a no-op read) when InProgress(4) arrives as a same-state report", async () => {
      findJobState.mockResolvedValue({
        state: "RENDERING",
        departmentId: "dept-a",
      });
      const result = await transitionJobForWorker(
        "job-1",
        { state: 4 },
        ALLOWED,
      );
      expect(transitionJob).not.toHaveBeenCalled();
      expect(findJobById).not.toHaveBeenCalled();
      expect(markRenderStarted).toHaveBeenCalledWith("job-1");
      expect(result).toMatchObject({ state: "RENDERING" });
    });

    it("throws not_found if the job disappears before the InProgress report is processed", async () => {
      findJobState.mockResolvedValue({
        state: "RENDERING",
        departmentId: "dept-a",
      });
      markRenderStarted.mockResolvedValue(null);
      await expect(
        transitionJobForWorker("job-1", { state: 4 }, ALLOWED),
      ).rejects.toMatchObject({ kind: "not_found" });
    });

    // Edge case: an earlier report (Downloading/Started) was lost, and
    // InProgress(4) itself is the first one Studio ever sees — there's no
    // further per-stage signal still to come, so this must set startedAt
    // immediately rather than waiting forever for an InProgress that will
    // never arrive as a same-state report.
    it("sets startedAt immediately when InProgress(4) itself is the real transition", async () => {
      findJobState.mockResolvedValue({
        state: "CLAIMED",
        departmentId: "dept-a",
      });
      await transitionJobForWorker("job-1", { state: 4 }, ALLOWED);
      expect(transitionJob).toHaveBeenCalledWith(
        "job-1",
        "RENDERING",
        expect.objectContaining({ startedAt: expect.any(Date) }),
      );
    });

    // A non-legacy caller sending the canonical Studio name directly has no
    // per-stage code to distinguish "downloading" from "actually
    // rendering" — the old, simpler behavior (set it at the transition
    // itself) is the only sane fallback.
    it("sets startedAt immediately for a real transition via the canonical name (no legacy code to wait for)", async () => {
      findJobState.mockResolvedValue({
        state: "CLAIMED",
        departmentId: "dept-a",
      });
      await transitionJobForWorker("job-1", { state: "RENDERING" }, ALLOWED);
      expect(transitionJob).toHaveBeenCalledWith(
        "job-1",
        "RENDERING",
        expect.objectContaining({ startedAt: expect.any(Date) }),
      );
    });

    // Phase 15/ADR-0045 — render time (`computeRenderSeconds`) measures
    // `startedAt -> renderedAt`, not `claimedAt -> renderedAt` (which would
    // include asset-download time) or `createdAt -> renderedAt` (which would
    // include queue wait).
    it("never sets startedAt on a transition to ERROR or another non-RENDERING target", async () => {
      findJobState.mockResolvedValue({
        state: "RENDERING",
        departmentId: "dept-a",
      });
      await transitionJobForWorker(
        "job-1",
        { state: "ERROR", errorReason: "boom" },
        ALLOWED,
      );
      const call = transitionJob.mock.calls[0];
      expect(call?.[2]).not.toHaveProperty("startedAt");
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
