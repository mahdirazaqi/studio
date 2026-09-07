import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeJobDetail } from "@/features/jobs/domain/job";

const findJobInScope = vi.fn();
const transitionJobRow = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobInScope: (...args: unknown[]) => findJobInScope(...args),
  transitionJobRow: (...args: unknown[]) => transitionJobRow(...args),
}));

const { cancelJob } = await import("./cancel-job");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "user-1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

const job = (overrides: Partial<SafeJobDetail> = {}): SafeJobDetail => ({
  id: "job-1",
  departmentId: "dept-a",
  templateId: "template-1",
  templateName: "T",
  title: "Job title",
  state: "QUEUED",
  progress: null,
  durationSeconds: null,
  retryOfJobId: null,
  attemptNumber: 1,
  createdByUserId: "user-1",
  createdByName: "User One",
  errorReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot: {
    templateId: "template-1",
    templateName: "T",
    composition: "c",
    source: "s",
    scriptRef: "s.js",
    outputPattern: "op",
    assetSlotDefinitions: [],
  },
  assets: [],
  retriedByUserId: null,
  retriedByName: null,
  retryReason: null,
  canceledByUserId: null,
  canceledByName: null,
  canceledAt: null,
  cancelReason: null,
  claimedAt: null,
  startedAt: null,
  renderedAt: null,
  videoFileId: null,
  screenshotFileId: null,
  thumbnailFileId: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cancelJob", () => {
  it("throws not_found when out of scope", async () => {
    findJobInScope.mockResolvedValue(null);
    await expect(cancelJob(actor(), "job-1")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("forbids a job:manage-ineligible actor (disabled user can't even build an Actor, but cross-department non-ADMIN is forbidden)", async () => {
    findJobInScope.mockResolvedValue(job({ departmentId: "dept-b" }));
    await expect(cancelJob(actor(), "job-1")).rejects.toMatchObject({
      kind: "forbidden",
    });
  });

  it("cancels a QUEUED job", async () => {
    findJobInScope.mockResolvedValue(job({ state: "QUEUED" }));
    transitionJobRow.mockResolvedValue(job({ state: "CANCELED" }));
    const result = await cancelJob(actor(), "job-1", "no longer needed");
    expect(result.state).toBe("CANCELED");
    expect(transitionJobRow).toHaveBeenCalledWith(
      "job-1",
      ["QUEUED", "CLAIMED", "RENDERING"],
      "CANCELED",
      expect.objectContaining({
        canceledByUserId: "user-1",
        cancelReason: "no longer needed",
      }),
    );
  });

  it("is idempotent — canceling an already-canceled job returns it unchanged", async () => {
    const canceled = job({ state: "CANCELED" });
    findJobInScope.mockResolvedValue(canceled);
    const result = await cancelJob(actor(), "job-1");
    expect(result).toBe(canceled);
    expect(transitionJobRow).not.toHaveBeenCalled();
  });

  it("rejects canceling a job that already reached RENDERED", async () => {
    findJobInScope.mockResolvedValue(job({ state: "RENDERED" }));
    await expect(cancelJob(actor(), "job-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(transitionJobRow).not.toHaveBeenCalled();
  });

  it("throws conflict when the job's state changes concurrently", async () => {
    findJobInScope.mockResolvedValue(job({ state: "QUEUED" }));
    transitionJobRow.mockResolvedValue(null);
    await expect(cancelJob(actor(), "job-1")).rejects.toMatchObject({
      kind: "conflict",
    });
  });

  it("allows a MANAGER to cancel any job in their own department", async () => {
    findJobInScope.mockResolvedValue(
      job({ state: "CLAIMED", createdByUserId: "someone-else" }),
    );
    transitionJobRow.mockResolvedValue(job({ state: "CANCELED" }));
    await expect(
      cancelJob(actor({ role: "MANAGER" }), "job-1"),
    ).resolves.toMatchObject({ state: "CANCELED" });
  });
});
