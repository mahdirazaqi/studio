import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import { businessRuleError } from "@/server/errors/app-error";

const listDepartmentJobs = vi.fn();
const cancelJob = vi.fn();

vi.mock("@/features/jobs/use-cases/list-jobs", () => ({
  listDepartmentJobs: (...args: unknown[]) => listDepartmentJobs(...args),
}));
vi.mock("@/features/jobs/use-cases/cancel-job", () => ({
  cancelJob: (...args: unknown[]) => cancelJob(...args),
}));

const { cancelAllJobsForTelegram } =
  await import("./cancel-all-jobs-for-telegram");

const actor: Actor = { userId: "user-1", role: "USER", departmentId: "dept-a" };

function jobsPage(items: { id: string }[]) {
  return { items, page: 1, pageSize: 100, total: items.length };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cancelAllJobsForTelegram", () => {
  it("queries every cancelable state and reports zero when nothing is cancelable", async () => {
    listDepartmentJobs.mockResolvedValue(jobsPage([]));
    const result = await cancelAllJobsForTelegram(actor);
    expect(result).toEqual({ canceledCount: 0, failedCount: 0 });
    expect(listDepartmentJobs).toHaveBeenCalledWith(actor, {
      state: "QUEUED",
      page: 1,
      pageSize: 100,
    });
    expect(listDepartmentJobs).toHaveBeenCalledWith(actor, {
      state: "CLAIMED",
      page: 1,
      pageSize: 100,
    });
    expect(listDepartmentJobs).toHaveBeenCalledWith(actor, {
      state: "RENDERING",
      page: 1,
      pageSize: 100,
    });
  });

  it("cancels every job returned across all cancelable states, scoped to the actor's own department", async () => {
    listDepartmentJobs.mockImplementation(
      (_actor: Actor, { state }: { state: string }) =>
        Promise.resolve(
          state === "QUEUED"
            ? jobsPage([{ id: "job-1" }, { id: "job-2" }])
            : jobsPage([]),
        ),
    );
    cancelJob.mockResolvedValue({});

    const result = await cancelAllJobsForTelegram(actor);

    expect(result).toEqual({ canceledCount: 2, failedCount: 0 });
    expect(cancelJob).toHaveBeenCalledWith(
      actor,
      "job-1",
      "Canceled via Telegram (Cancel All Jobs)",
    );
    expect(cancelJob).toHaveBeenCalledWith(
      actor,
      "job-2",
      "Canceled via Telegram (Cancel All Jobs)",
    );
  });

  it("counts a per-job cancel failure without aborting the rest of the batch", async () => {
    listDepartmentJobs.mockImplementation(
      (_actor: Actor, { state }: { state: string }) =>
        Promise.resolve(
          state === "QUEUED"
            ? jobsPage([{ id: "job-1" }, { id: "job-2" }])
            : jobsPage([]),
        ),
    );
    cancelJob
      .mockRejectedValueOnce(businessRuleError("already terminal"))
      .mockResolvedValueOnce({});

    const result = await cancelAllJobsForTelegram(actor);

    expect(result).toEqual({ canceledCount: 1, failedCount: 1 });
    expect(cancelJob).toHaveBeenCalledTimes(2);
  });

  it("re-throws a non-AppError instead of silently swallowing it", async () => {
    listDepartmentJobs.mockImplementation(
      (_actor: Actor, { state }: { state: string }) =>
        Promise.resolve(
          state === "QUEUED" ? jobsPage([{ id: "job-1" }]) : jobsPage([]),
        ),
    );
    cancelJob.mockRejectedValue(new Error("db down"));

    await expect(cancelAllJobsForTelegram(actor)).rejects.toThrow("db down");
  });
});
