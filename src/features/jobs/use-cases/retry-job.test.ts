import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/authz";
import type { SafeJobDetail } from "@/features/jobs/domain/job";

const findJobInScope = vi.fn();
const createRetryJob = vi.fn();

vi.mock("@/features/jobs/repository/job-repository", () => ({
  findJobInScope: (...args: unknown[]) => findJobInScope(...args),
  createRetryJob: (...args: unknown[]) => createRetryJob(...args),
}));

const { retryJob } = await import("./retry-job");

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "user-1",
  role: "USER",
  departmentId: "dept-a",
  ...overrides,
});

const snapshot = {
  templateId: "template-1",
  templateName: "T",
  composition: "c",
  source: "s",
  scriptRef: "s.js",
  outputPattern: "op",
  description: null,
  tags: [],
  assetSlotDefinitions: [],
  youtubeTarget: null,
};

const job = (overrides: Partial<SafeJobDetail> = {}): SafeJobDetail => ({
  id: "job-1",
  departmentId: "dept-a",
  templateId: "template-1",
  templateName: "T",
  title: "Job title",
  state: "ERROR",
  progress: 40,
  durationSeconds: null,
  deliverToYouTube: false,
  retryOfJobId: null,
  attemptNumber: 1,
  createdByUserId: "original-creator",
  createdByName: "Original Creator",
  errorReason: "render failed",
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot,
  assets: [
    {
      id: "ja-1",
      slotKey: "caption",
      kind: "DATA",
      composition: "c1",
      layer: "l1",
      textValue: "Hi",
      fileId: null,
      fileOriginalName: null,
      fileMimeType: null,
      fileSizeBytes: null,
      fileWidth: null,
      fileHeight: null,
      order: 0,
    },
  ],
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
  deliveredAt: null,
  uploadedAt: null,
  videoFileId: null,
  screenshotFileId: null,
  thumbnailFileId: null,
  deliveryAttempts: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  createRetryJob.mockResolvedValue(job({ id: "job-2", retryOfJobId: "job-1" }));
});

describe("retryJob", () => {
  it("throws not_found when out of scope", async () => {
    findJobInScope.mockResolvedValue(null);
    await expect(retryJob(actor(), "job-1")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("forbids retrying another department's job", async () => {
    findJobInScope.mockResolvedValue(job({ departmentId: "dept-b" }));
    await expect(retryJob(actor(), "job-1")).rejects.toMatchObject({
      kind: "forbidden",
    });
  });

  it("retries an ERROR job", async () => {
    findJobInScope.mockResolvedValue(job({ state: "ERROR" }));
    const result = await retryJob(actor(), "job-1", "try again");
    expect(result.id).toBe("job-2");
    expect(createRetryJob).toHaveBeenCalledWith(
      expect.objectContaining({
        originalJobId: "job-1",
        departmentId: "dept-a",
        createdByUserId: "original-creator",
        retriedByUserId: "user-1",
        retryReason: "try again",
        attemptNumber: 2,
        snapshot,
      }),
    );
  });

  it("retries a CANCELED job", async () => {
    findJobInScope.mockResolvedValue(job({ state: "CANCELED" }));
    await expect(retryJob(actor(), "job-1")).resolves.toMatchObject({
      id: "job-2",
    });
  });

  it("rejects retrying a still-active job (QUEUED/CLAIMED/RENDERING)", async () => {
    for (const state of ["QUEUED", "CLAIMED", "RENDERING"] as const) {
      findJobInScope.mockResolvedValue(job({ state }));
      await expect(retryJob(actor(), "job-1")).rejects.toMatchObject({
        kind: "business_rule",
      });
    }
    expect(createRetryJob).not.toHaveBeenCalled();
  });

  it("rejects retrying a successfully completed job (RENDERED/DELIVERING/UPLOADED)", async () => {
    for (const state of ["RENDERED", "DELIVERING", "UPLOADED"] as const) {
      findJobInScope.mockResolvedValue(job({ state }));
      await expect(retryJob(actor(), "job-1")).rejects.toMatchObject({
        kind: "business_rule",
      });
    }
    expect(createRetryJob).not.toHaveBeenCalled();
  });

  it("rejects retrying a job older than the retry window", async () => {
    const old = new Date();
    old.setDate(old.getDate() - 30);
    findJobInScope.mockResolvedValue(job({ state: "ERROR", createdAt: old }));
    await expect(retryJob(actor(), "job-1")).rejects.toMatchObject({
      kind: "business_rule",
    });
    expect(createRetryJob).not.toHaveBeenCalled();
  });

  it("preserves the original job's snapshot and asset values verbatim, never re-resolving", async () => {
    findJobInScope.mockResolvedValue(job({ state: "ERROR" }));
    await retryJob(actor(), "job-1");
    const call = createRetryJob.mock.calls[0]?.[0];
    expect(call?.snapshot).toEqual(snapshot);
    expect(call?.assets).toEqual([
      expect.objectContaining({ slotKey: "caption", textValue: "Hi" }),
    ]);
  });

  it("allows a MANAGER to retry any job in their own department", async () => {
    findJobInScope.mockResolvedValue(
      job({ state: "ERROR", createdByUserId: "someone-else" }),
    );
    await expect(
      retryJob(actor({ role: "MANAGER" }), "job-1"),
    ).resolves.toMatchObject({ id: "job-2" });
  });
});
